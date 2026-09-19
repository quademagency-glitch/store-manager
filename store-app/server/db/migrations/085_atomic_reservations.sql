-- Scaffolded with supabase migration new atomic_reservations; repository order.
ALTER TABLE public.sales ADD COLUMN creation_id uuid, ADD COLUMN creation_request jsonb;
CREATE UNIQUE INDEX sales_creation_idx ON public.sales(business_id,creation_id);
CREATE TABLE public.cancelled_checkouts (
  business_id uuid NOT NULL REFERENCES businesses(id), operation_id uuid NOT NULL,
  location_id uuid NOT NULL REFERENCES locations(id), actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(business_id,operation_id)
);
ALTER TABLE public.cancelled_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cancelled_checkouts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cancelled_checkouts TO service_role;

CREATE FUNCTION public.reserve_sale_transaction(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_key uuid:=(p_request->>'operation_id')::uuid; v_sale sales%ROWTYPE; v_biz businesses%ROWTYPE;
  v_item jsonb; v_scan jsonb; v_product products%ROWTYPE; v_unit inventory_units%ROWTYPE; v_qr qr_code_pool%ROWTYPE;
  v_units uuid[]:='{}'; v_line_units uuid[]; v_qty integer; v_total numeric:=0; v_tax numeric:=0; v_net numeric; v_discount numeric;
  v_price numeric; v_customer uuid:=(p_request->>'customer_id')::uuid; v_items jsonb:=p_request->'items';
BEGIN
  IF v_key IS NULL OR jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A checkout reference and sale items are required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid checkout branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  IF EXISTS(SELECT 1 FROM cancelled_checkouts WHERE business_id=p_business_id AND operation_id=v_key) THEN RAISE EXCEPTION 'This saved checkout was cancelled. Start a new checkout'; END IF;
  SELECT * INTO v_sale FROM sales WHERE business_id=p_business_id AND creation_id=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_sale.location_id<>p_location_id OR v_sale.salesperson_id<>p_actor_id OR v_sale.creation_request<>p_request THEN
      RAISE EXCEPTION 'Checkout reference already belongs to another request' USING ERRCODE='P0003';
    END IF;
    RETURN jsonb_build_object('sale',sale_receipt(v_sale.id),'replayed',true);
  END IF;
  IF v_customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE id=v_customer AND business_id=p_business_id) THEN RAISE EXCEPTION 'Customer does not belong to this business'; END IF;
  SELECT * INTO STRICT v_biz FROM businesses WHERE id=p_business_id FOR SHARE;
  IF (SELECT count(DISTINCT value->>'product_id') FROM jsonb_array_elements(v_items))<>jsonb_array_length(v_items) THEN RAISE EXCEPTION 'Select each product only once'; END IF;
  -- Deterministic product -> stock -> unit lock order, shared with receiving.
  PERFORM id FROM products WHERE id IN(SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(v_items)) ORDER BY id FOR UPDATE;
  PERFORM id FROM product_inventory WHERE location_id=p_location_id AND product_id IN(SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(v_items)) ORDER BY product_id FOR UPDATE;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) ORDER BY value->>'product_id' LOOP
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::uuid AND business_id=p_business_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product does not belong to this business'; END IF;
    v_qty:=(v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 100000 OR (v_item->>'quantity')::numeric<>v_qty THEN RAISE EXCEPTION 'Quantity must be a positive whole number'; END IF;
    v_price:=(v_item->>'unit_price')::numeric;
    IF v_price IS NULL OR v_price<>v_product.price THEN RAISE EXCEPTION 'Product price changed. Refresh the cart before taking payment'; END IF;
    IF NOT EXISTS(SELECT 1 FROM product_inventory WHERE product_id=v_product.id AND location_id=p_location_id AND quantity>=v_qty) THEN RAISE EXCEPTION 'Insufficient stock for %',v_product.name; END IF;
    v_total:=v_total+v_product.price*v_qty;
  END LOOP;
  v_discount:=coalesce((p_request->>'discount')::numeric,0);
  IF v_discount NOT BETWEEN 0 AND v_total OR v_discount<>round(v_discount,2) OR v_discount>round(v_total*coalesce(v_biz.max_discount_percent,0)/100,2) THEN RAISE EXCEPTION 'Discount exceeds the business limit'; END IF;
  v_total:=v_total-v_discount;
  IF (p_request->>'total_amount')::numeric IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'Cart total does not match saved prices'; END IF;
  v_net:=v_total;
  IF v_biz.tax_enabled AND coalesce(v_biz.tax_rate,0)>0 THEN
    IF v_biz.tax_inclusive THEN v_tax:=round(v_total*v_biz.tax_rate/(100+v_biz.tax_rate),2);v_net:=v_total-v_tax;
    ELSE v_tax:=round(v_total*v_biz.tax_rate/100,2);v_total:=v_total+v_tax; END IF;
  END IF;
  IF (p_request->>'expected_total')::numeric IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'Tax or total changed. Refresh the cart before taking payment'; END IF;
  INSERT INTO sales(business_id,location_id,salesperson_id,customer_id,total_amount,discount_amount,payment_method,receipt_number,status,
    subtotal,tax_amount,tax_rate_applied,tax_inclusive_applied,tax_label_applied,creation_id,creation_request)
  VALUES(p_business_id,p_location_id,p_actor_id,v_customer,v_total,v_discount,p_request->>'payment_method','RCPT-'||upper(replace(gen_random_uuid()::text,'-','')),'pending',
    v_net,v_tax,CASE WHEN v_tax>0 THEN v_biz.tax_rate END,CASE WHEN v_tax>0 THEN v_biz.tax_inclusive END,CASE WHEN v_tax>0 THEN v_biz.tax_label END,v_key,p_request) RETURNING * INTO v_sale;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) ORDER BY value->>'product_id' LOOP
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::uuid;
    v_qty:=(v_item->>'quantity')::integer; v_line_units:='{}';
    IF jsonb_array_length(coalesce(v_item->'unit_ids','[]'::jsonb))>0 AND jsonb_array_length(coalesce(v_item->'scans','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Use unit references or scans, not both'; END IF;
    FOR v_scan IN SELECT value FROM jsonb_array_elements(coalesce(v_item->'scans','[]'::jsonb)) ORDER BY value->>'item_code' LOOP
      SELECT * INTO v_qr FROM qr_code_pool WHERE code=v_scan->>'item_code' FOR UPDATE;
      IF NOT FOUND OR v_qr.status='voided' THEN RAISE EXCEPTION 'Item code not found or voided'; END IF;
      IF v_biz.qr_tracking_mode='double' THEN
        SELECT u.* INTO v_unit FROM inventory_units u JOIN qr_code_pool pack ON pack.id=u.pack_code_id
          WHERE pack.code=v_scan->>'pack_code' AND u.product_id=v_product.id AND u.business_id=p_business_id AND u.location_id=p_location_id
          AND (NOT v_product.requires_serial OR u.serial_number=v_scan->>'serial_number')
          AND u.status='in_stock' AND NOT u.id=ANY(v_units) ORDER BY u.id LIMIT 1 FOR UPDATE OF u;
      ELSE
        SELECT * INTO v_unit FROM inventory_units WHERE qr_code_id=v_qr.id AND product_id=v_product.id
          AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
      END IF;
      IF NOT FOUND OR v_unit.status<>'in_stock' OR v_unit.id=ANY(v_units) THEN RAISE EXCEPTION 'Scanned unit is unavailable in this branch'; END IF;
      IF v_unit.qr_code_id IS NULL THEN
        IF v_qr.status<>'unassigned' OR EXISTS(SELECT 1 FROM inventory_units WHERE qr_code_id=v_qr.id) THEN RAISE EXCEPTION 'Item code already assigned'; END IF;
        UPDATE inventory_units SET qr_code_id=v_qr.id WHERE id=v_unit.id;
        UPDATE qr_code_pool SET status='assigned' WHERE id=v_qr.id;
      ELSIF v_unit.qr_code_id<>v_qr.id THEN RAISE EXCEPTION 'Item code does not match the selected unit'; END IF;
      v_units:=array_append(v_units,v_unit.id);v_line_units:=array_append(v_line_units,v_unit.id);
    END LOOP;
    FOR v_scan IN SELECT value FROM jsonb_array_elements(coalesce(v_item->'unit_ids','[]'::jsonb)) ORDER BY value LOOP
      SELECT * INTO v_unit FROM inventory_units WHERE id=(v_scan#>>'{}')::uuid AND product_id=v_product.id AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
      IF NOT FOUND OR v_unit.status<>'in_stock' OR v_unit.id=ANY(v_units) THEN RAISE EXCEPTION 'Selected unit is unavailable in this branch'; END IF;
      v_units:=array_append(v_units,v_unit.id);v_line_units:=array_append(v_line_units,v_unit.id);
    END LOOP;
    IF cardinality(v_line_units)>0 AND cardinality(v_line_units)<>v_qty THEN RAISE EXCEPTION 'Scan exactly the quantity being sold'; END IF;
    IF cardinality(v_line_units)=0 AND EXISTS(SELECT 1 FROM inventory_units WHERE product_id=v_product.id AND location_id=p_location_id) THEN RAISE EXCEPTION 'Tracking codes are required for this product'; END IF;
    UPDATE product_inventory SET quantity=quantity-v_qty WHERE product_id=v_product.id AND location_id=p_location_id;
    INSERT INTO sale_items(sale_id,business_id,product_id,quantity,unit_price,tracked_quantity)
      VALUES(v_sale.id,p_business_id,v_product.id,v_qty,v_product.price,cardinality(v_line_units));
    INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
      VALUES(p_business_id,p_location_id,v_product.id,-v_qty,'SALE',p_actor_id,v_sale.id,'Checkout reservation');
    UPDATE inventory_units SET status='pending_sale',sold_in_sale_id=v_sale.id WHERE id=ANY(v_line_units);
  END LOOP;
  RETURN jsonb_build_object('sale',sale_receipt(v_sale.id),'replayed',false);
END;
$$;
CREATE FUNCTION public.cancel_checkout_reservation(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_sale sales%ROWTYPE;v_prior cancelled_checkouts%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid checkout branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_operation_id::text,0));
  SELECT * INTO v_prior FROM cancelled_checkouts WHERE business_id=p_business_id AND operation_id=p_operation_id;
  IF FOUND AND (v_prior.location_id<>p_location_id OR v_prior.actor_id<>p_actor_id) THEN RAISE EXCEPTION 'Checkout belongs to another branch or operator'; END IF;
  SELECT * INTO v_sale FROM sales WHERE business_id=p_business_id AND creation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_sale.location_id<>p_location_id OR v_sale.salesperson_id<>p_actor_id THEN RAISE EXCEPTION 'Checkout belongs to another branch or operator'; END IF;
    IF v_sale.status='pending' THEN PERFORM cancel_pending_sale(v_sale.id);
    ELSIF v_sale.status<>'voided' THEN RAISE EXCEPTION 'This checkout was already paid. Resume it to view the receipt' USING ERRCODE='P0003'; END IF;
  END IF;
  -- A cancellation that arrives before a delayed creation is a tombstone:
  -- that creation cannot subsequently reserve stock behind the cashier's back.
  INSERT INTO cancelled_checkouts(business_id,operation_id,location_id,actor_id) VALUES(p_business_id,p_operation_id,p_location_id,p_actor_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('cancelled',true);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_checkout_reservation(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_checkout_reservation(uuid,uuid,uuid,uuid) TO service_role;
CREATE FUNCTION public.sync_offline_sale(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb,p_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;v_sale_id uuid;
BEGIN
  IF coalesce((p_payment->>'store_credit')::numeric,0)<>0 OR coalesce((p_payment->>'points')::integer,0)<>0 THEN RAISE EXCEPTION 'Offline payments cannot redeem rewards'; END IF;
  v_result:=reserve_sale_transaction(p_business_id,p_location_id,p_actor_id,p_request);
  v_sale_id:=(v_result->'sale'->>'id')::uuid;
  RETURN finalize_sale_transaction(p_business_id,p_location_id,p_actor_id,v_sale_id,(p_payment->>'settlement_id')::uuid,
    p_payment->>'payment_method',(p_payment->>'amount_paid')::numeric,0,0);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_sale_transaction(uuid,uuid,uuid,jsonb),public.sync_offline_sale(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sale_transaction(uuid,uuid,uuid,jsonb),public.sync_offline_sale(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
-- The old RPC accepted browser prices and arbitrary units. Retire its service
-- grant too, so integrations cannot accidentally bypass the new validation.
REVOKE EXECUTE ON FUNCTION public.process_sale_transaction(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,uuid[],numeric,numeric,numeric,boolean,text) FROM service_role;
NOTIFY pgrst,'reload schema';
