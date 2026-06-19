-- ============================================
-- Migration 053: Undo Import Batch RPC
-- Best-effort, per-row undo: rows with no downstream activity are deleted
-- outright; rows with activity are left in place (or compensated via a
-- reversing stock movement — never deleted, matching the append-only
-- philosophy already used for stock_movements elsewhere); rows that can't
-- be safely touched are reported as blocked. Never all-or-nothing — one
-- busy row must not prevent undoing the rest of a batch.
--
-- p_dry_run uses the standard Postgres pattern of raising and catching a
-- sentinel exception to roll back any data changes while still returning
-- the computed outcome (PL/pgSQL local variables are unaffected by the
-- implicit savepoint rollback an EXCEPTION block performs).
-- ============================================

CREATE OR REPLACE FUNCTION public.undo_import_batch(p_batch_id UUID, p_user_id UUID, p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_business_id UUID;
  outcomes JSONB := '[]'::jsonb;

  v_product RECORD;
  v_receipt RECORD;
  v_has_sales BOOLEAN;
  v_has_po BOOLEAN;
  v_has_units BOOLEAN;
  v_other_movements INTEGER;

  v_customer RECORD;
  v_ar_invoice RECORD;
  v_customer_has_sales BOOLEAN;

  v_supplier RECORD;
  v_ap_bill RECORD;
  v_supplier_has_po BOOLEAN;
BEGIN
  SELECT * INTO v_batch FROM public.import_batches WHERE id = p_batch_id;
  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;
  IF v_batch.status = 'undone' THEN
    RAISE EXCEPTION 'This batch has already been undone';
  END IF;

  v_business_id := v_batch.business_id;

  -- ============== PRODUCTS ==============
  IF v_batch.entity_type = 'products' THEN
    FOR v_product IN SELECT * FROM public.products WHERE import_batch_id = p_batch_id LOOP
      SELECT EXISTS(SELECT 1 FROM public.sale_items WHERE product_id = v_product.id) INTO v_has_sales;
      SELECT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE product_id = v_product.id) INTO v_has_po;
      SELECT EXISTS(SELECT 1 FROM public.inventory_units WHERE product_id = v_product.id) INTO v_has_units;
      SELECT COUNT(*) INTO v_other_movements
        FROM public.stock_movements
        WHERE product_id = v_product.id
          AND NOT (movement_type = 'RECEIPT' AND reference_id = p_batch_id);

      IF NOT v_has_sales AND NOT v_has_po AND NOT v_has_units AND v_other_movements = 0 THEN
        DELETE FROM public.stock_movements WHERE product_id = v_product.id AND movement_type = 'RECEIPT' AND reference_id = p_batch_id;
        DELETE FROM public.products WHERE id = v_product.id; -- product_inventory cascades
        outcomes := outcomes || jsonb_build_object('entity_id', v_product.id, 'name', v_product.name, 'action', 'deleted');
      ELSE
        FOR v_receipt IN SELECT * FROM public.stock_movements WHERE product_id = v_product.id AND movement_type = 'RECEIPT' AND reference_id = p_batch_id LOOP
          INSERT INTO public.stock_movements (product_id, user_id, business_id, location_id, quantity_change, movement_type, reference_id, notes)
          VALUES (v_product.id, p_user_id, v_business_id, v_receipt.location_id, -v_receipt.quantity_change, 'ADJUSTMENT', p_batch_id, 'Compensating reversal for undone import batch');

          UPDATE public.product_inventory
          SET quantity = quantity - v_receipt.quantity_change
          WHERE product_id = v_product.id AND location_id = v_receipt.location_id;
        END LOOP;
        outcomes := outcomes || jsonb_build_object(
          'entity_id', v_product.id, 'name', v_product.name, 'action', 'compensated',
          'reason', 'Product has sales, purchase order, or unit history beyond this import — stock reversed, record kept.'
        );
      END IF;
    END LOOP;
  END IF;

  -- ============== CUSTOMERS ==============
  IF v_batch.entity_type = 'customers' THEN
    FOR v_customer IN SELECT * FROM public.customers WHERE import_batch_id = p_batch_id LOOP
      SELECT EXISTS(SELECT 1 FROM public.sales WHERE customer_id = v_customer.id) INTO v_customer_has_sales;
      SELECT * INTO v_ar_invoice FROM public.ar_invoices WHERE customer_id = v_customer.id AND import_batch_id = p_batch_id LIMIT 1;

      IF v_customer_has_sales THEN
        outcomes := outcomes || jsonb_build_object('entity_id', v_customer.id, 'name', v_customer.name, 'action', 'blocked', 'reason', 'Customer has sales recorded against them.');
      ELSIF v_ar_invoice IS NOT NULL AND v_ar_invoice.amount_paid > 0 THEN
        outcomes := outcomes || jsonb_build_object('entity_id', v_customer.id, 'name', v_customer.name, 'action', 'blocked', 'reason', 'Customer''s opening balance has payments recorded against it.');
      ELSE
        IF v_ar_invoice IS NOT NULL THEN
          DELETE FROM public.ar_invoices WHERE id = v_ar_invoice.id;
        END IF;
        DELETE FROM public.customers WHERE id = v_customer.id;
        outcomes := outcomes || jsonb_build_object('entity_id', v_customer.id, 'name', v_customer.name, 'action', 'deleted');
      END IF;
    END LOOP;
  END IF;

  -- ============== SUPPLIERS ==============
  IF v_batch.entity_type = 'suppliers' THEN
    FOR v_supplier IN SELECT * FROM public.suppliers WHERE import_batch_id = p_batch_id LOOP
      SELECT EXISTS(SELECT 1 FROM public.purchase_orders WHERE supplier_id = v_supplier.id) INTO v_supplier_has_po;
      SELECT * INTO v_ap_bill FROM public.ap_bills WHERE supplier_id = v_supplier.id AND import_batch_id = p_batch_id LIMIT 1;

      IF v_supplier_has_po THEN
        outcomes := outcomes || jsonb_build_object('entity_id', v_supplier.id, 'name', v_supplier.name, 'action', 'blocked', 'reason', 'Supplier has purchase orders recorded against them.');
      ELSIF v_ap_bill IS NOT NULL AND v_ap_bill.amount_paid > 0 THEN
        outcomes := outcomes || jsonb_build_object('entity_id', v_supplier.id, 'name', v_supplier.name, 'action', 'blocked', 'reason', 'Supplier''s opening balance has payments recorded against it.');
      ELSE
        IF v_ap_bill IS NOT NULL THEN
          DELETE FROM public.ap_bills WHERE id = v_ap_bill.id;
        END IF;
        DELETE FROM public.suppliers WHERE id = v_supplier.id;
        outcomes := outcomes || jsonb_build_object('entity_id', v_supplier.id, 'name', v_supplier.name, 'action', 'deleted');
      END IF;
    END LOOP;
  END IF;

  IF NOT p_dry_run THEN
    UPDATE public.import_batches
    SET status = 'undone', undone_at = now(), undone_by = p_user_id, undo_report = outcomes
    WHERE id = p_batch_id;
  END IF;

  IF p_dry_run THEN
    RAISE EXCEPTION 'DRY_RUN_ROLLBACK';
  END IF;

  RETURN jsonb_build_object('success', true, 'dry_run', false, 'outcomes', outcomes);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'DRY_RUN_ROLLBACK' THEN
      RETURN jsonb_build_object('success', true, 'dry_run', true, 'outcomes', outcomes);
    END IF;
    RAISE;
END;
$$;
