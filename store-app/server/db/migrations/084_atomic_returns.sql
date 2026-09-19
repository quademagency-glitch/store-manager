-- Generated with `supabase migration new atomic_returns`; repository numbering.
ALTER TABLE public.returns
  ADD COLUMN operation_id uuid,
  ADD COLUMN request_payload jsonb,
  ADD COLUMN result_payload jsonb,
  ADD COLUMN calculation_version integer,
  ADD COLUMN refund_method text,
  ADD COLUMN payment_refund_amount numeric(12,2),
  ADD COLUMN cash_refund_amount numeric(12,2),
  ADD COLUMN credit_refund_amount numeric(12,2),
  ADD COLUMN points_refund numeric(18,4),
  ADD COLUMN points_refund_value numeric(12,2),
  ADD COLUMN tax_refund_amount numeric(12,2);
CREATE UNIQUE INDEX returns_operation_idx ON public.returns(business_id,operation_id);
ALTER TABLE public.return_items ADD COLUMN refund_amount numeric(12,2), ADD COLUMN tax_refund_amount numeric(12,2);
CREATE INDEX return_items_sale_item_idx ON public.return_items(sale_item_id);
-- Partial returns can restore a fraction of a redeemed point. Redemption still
-- accepts whole points; cumulative allocation restores the exact original total.
ALTER TABLE public.loyalty_ledger ALTER COLUMN points TYPE numeric(18,4),
  ALTER COLUMN balance_after TYPE numeric(18,4);
REVOKE INSERT,UPDATE,DELETE ON public.returns,public.return_items FROM anon,authenticated;

CREATE FUNCTION public.sale_return_lines(p_sale_id uuid)
RETURNS TABLE(id uuid,product_id uuid,quantity integer,unit_price numeric,line_total numeric,line_tax numeric,
  returned_quantity integer,tracked boolean,product jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH lines AS (
    SELECT i.*,sum(i.quantity*i.unit_price) OVER () AS weight,
      sum(i.quantity*i.unit_price) OVER (ORDER BY i.id) AS running
    FROM sale_items i WHERE i.sale_id=p_sale_id
  ) SELECT i.id,i.product_id,i.quantity,i.unit_price,
    CASE WHEN weight>0 THEN round(s.total_amount*running/weight,2)-round(s.total_amount*(running-i.quantity*i.unit_price)/weight,2) ELSE 0 END,
    CASE WHEN weight>0 THEN round(s.tax_amount*running/weight,2)-round(s.tax_amount*(running-i.quantity*i.unit_price)/weight,2) ELSE 0 END,
    (SELECT coalesce(sum(r.quantity),0)::integer FROM return_items r WHERE r.sale_item_id=i.id),
    coalesce(i.tracked_quantity>0,
      EXISTS(SELECT 1 FROM inventory_units u WHERE u.sold_in_sale_id=p_sale_id AND u.product_id=i.product_id)
      OR EXISTS(SELECT 1 FROM return_items r WHERE r.sale_item_id=i.id AND cardinality(r.returned_unit_ids)>0)),
    jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku)
  FROM lines i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id;
$$;

CREATE FUNCTION public.returnable_sale(p_business_id uuid,p_location_id uuid,p_sale_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_sale sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id AND business_id=p_business_id AND location_id=p_location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found in this branch' USING ERRCODE='P0002'; END IF;
  RETURN sale_receipt(p_sale_id) || jsonb_build_object('sale_items',(
    SELECT coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('returnable_quantity',greatest(0,i.quantity-i.returned_quantity)) ORDER BY i.id),'[]'::jsonb)
    FROM sale_return_lines(p_sale_id) i
  ));
END;
$$;

CREATE FUNCTION public.process_return_transaction(
  p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_sale_id uuid,p_operation_id uuid,p_items jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_sale sales%ROWTYPE; v_existing returns%ROWTYPE; v_return returns%ROWTYPE;
  v_item jsonb; v_line record; v_units uuid[]; v_qty integer;
  v_gross numeric:=0; v_tax numeric:=0; v_refund numeric; v_line_tax numeric; v_prev numeric;
  v_credit numeric:=0; v_points numeric:=0; v_points_value numeric:=0; v_payment numeric:=0;
  v_earned numeric; v_reverse numeric; v_comm record; v_basis numeric; v_returned_basis numeric;
  v_request jsonb; v_result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_items IS NULL OR nullif(trim(p_reason),'') IS NULL OR jsonb_typeof(p_items)<>'array'
    OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Select return items and provide a reason'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN
    RAISE EXCEPTION 'Invalid return operator';
  END IF;
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found in this branch' USING ERRCODE='P0002'; END IF;
  v_request:=jsonb_build_object('sale_id',p_sale_id,'items',p_items,'reason',trim(p_reason));
  SELECT * INTO v_existing FROM returns WHERE business_id=p_business_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_existing.request_payload=v_request THEN RETURN v_existing.result_payload; END IF;
    RAISE EXCEPTION 'This return reference was already used for different items' USING ERRCODE='P0003';
  END IF;
  IF v_sale.status<>'completed' THEN RAISE EXCEPTION 'Only a completed sale can be returned'; END IF;
  IF v_sale.settlement_id IS NULL AND (EXISTS(SELECT 1 FROM loyalty_ledger WHERE sale_id=p_sale_id AND type='redeem')
    OR EXISTS(SELECT 1 FROM store_credit_ledger WHERE sale_id=p_sale_id AND type='redeem')) THEN
    RAISE EXCEPTION 'This older sale used rewards without a settlement breakdown; reconcile it before refunding';
  END IF;
  IF EXISTS(SELECT 1 FROM returns WHERE original_sale_id=p_sale_id AND calculation_version IS NULL) THEN
    RAISE EXCEPTION 'This sale has an older return that needs reconciliation before another refund';
  END IF;
  IF v_sale.total_amount>0 AND NOT EXISTS(SELECT 1 FROM sale_items WHERE sale_id=p_sale_id AND unit_price>0) THEN
    RAISE EXCEPTION 'Original sale line prices are missing; refund requires reconciliation';
  END IF;
  IF (SELECT count(DISTINCT value->>'sale_item_id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Select each sale line only once';
  END IF;
  IF v_sale.customer_id IS NOT NULL THEN PERFORM id FROM customers WHERE id=v_sale.customer_id FOR UPDATE; END IF;
  SELECT coalesce(sum(total_refund_amount),0) INTO v_prev FROM returns WHERE original_sale_id=p_sale_id;
  INSERT INTO returns(business_id,location_id,original_sale_id,customer_id,processed_by,reason,operation_id,request_payload,calculation_version)
    VALUES(p_business_id,p_location_id,p_sale_id,v_sale.customer_id,p_actor_id,trim(p_reason),p_operation_id,v_request,1) RETURNING * INTO v_return;

  -- Inventory locks are acquired in product order, matching cancellation/hold.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'sale_item_id' LOOP
    SELECT * INTO v_line FROM sale_return_lines(p_sale_id) WHERE id=(v_item->>'sale_item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Return item does not belong to the original sale'; END IF;
    v_qty:=(v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty<=0 OR v_qty>v_line.quantity-v_line.returned_quantity THEN
      RAISE EXCEPTION 'Return quantity exceeds the remaining quantity';
    END IF;
  END LOOP;
  PERFORM pi.id FROM product_inventory pi WHERE pi.location_id=p_location_id AND pi.product_id IN (
    SELECT i.product_id FROM sale_items i WHERE i.id IN (SELECT (value->>'sale_item_id')::uuid FROM jsonb_array_elements(p_items))
  ) ORDER BY pi.product_id FOR UPDATE;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'sale_item_id' LOOP
    SELECT * INTO v_line FROM sale_return_lines(p_sale_id) WHERE id=(v_item->>'sale_item_id')::uuid;
    v_qty:=(v_item->>'quantity')::integer;
    SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO v_units FROM jsonb_array_elements_text(coalesce(v_item->'unit_ids','[]'::jsonb));
    IF cardinality(v_units)<>(SELECT count(DISTINCT u) FROM unnest(v_units) u)
      OR (v_line.tracked AND cardinality(v_units)<>v_qty)
      OR (NOT v_line.tracked AND cardinality(v_units)>0) THEN
      RAISE EXCEPTION 'Scan exactly the tracked units being returned';
    END IF;
    PERFORM id FROM inventory_units WHERE id=ANY(v_units) ORDER BY id FOR UPDATE;
    IF (SELECT count(*) FROM inventory_units WHERE id=ANY(v_units) AND sold_in_sale_id=p_sale_id
      AND product_id=v_line.product_id AND business_id=p_business_id AND location_id=p_location_id AND status='sold')<>cardinality(v_units) THEN
      RAISE EXCEPTION 'A scanned unit is not returnable on this sale';
    END IF;
    v_refund:=round(v_line.line_total*(v_line.returned_quantity+v_qty)/v_line.quantity,2)-round(v_line.line_total*v_line.returned_quantity/v_line.quantity,2);
    v_line_tax:=round(v_line.line_tax*(v_line.returned_quantity+v_qty)/v_line.quantity,2)-round(v_line.line_tax*v_line.returned_quantity/v_line.quantity,2);
    INSERT INTO return_items(return_id,sale_item_id,product_id,quantity,unit_price,returned_unit_ids,refund_amount,tax_refund_amount)
      VALUES(v_return.id,v_line.id,v_line.product_id,v_qty,v_line.unit_price,v_units,v_refund,v_line_tax);
    UPDATE product_inventory SET quantity=quantity+v_qty WHERE product_id=v_line.product_id AND location_id=p_location_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory record is missing'; END IF;
    UPDATE inventory_units SET status='in_stock',sold_in_sale_id=null,sold_at=null WHERE id=ANY(v_units);
    INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
      VALUES(p_business_id,p_location_id,v_line.product_id,v_qty,'RETURN',p_actor_id,v_return.id,'Returned from sale '||p_sale_id);
    v_gross:=v_gross+v_refund; v_tax:=v_tax+v_line_tax;
  END LOOP;
  IF v_prev+v_gross>v_sale.total_amount THEN RAISE EXCEPTION 'Refund exceeds the original sale'; END IF;
  IF v_sale.total_amount>0 THEN
    v_credit:=round(v_sale.store_credit_used*(v_prev+v_gross)/v_sale.total_amount,2)-round(v_sale.store_credit_used*v_prev/v_sale.total_amount,2);
    v_points:=round(v_sale.loyalty_points_used*(v_prev+v_gross)/v_sale.total_amount,4)-round(v_sale.loyalty_points_used*v_prev/v_sale.total_amount,4);
    -- Allocate the remainder after credit, so rounding can never allocate more
    -- than a one-cent refund across two reward sources. Cumulative differences
    -- still restore each source exactly when all items have been returned.
    IF v_sale.total_amount>v_sale.store_credit_used THEN
      v_points_value:=round(v_sale.loyalty_value_used*(v_prev+v_gross-round(v_sale.store_credit_used*(v_prev+v_gross)/v_sale.total_amount,2))/(v_sale.total_amount-v_sale.store_credit_used),2)
        -round(v_sale.loyalty_value_used*(v_prev-round(v_sale.store_credit_used*v_prev/v_sale.total_amount,2))/(v_sale.total_amount-v_sale.store_credit_used),2);
    END IF;
  END IF;
  v_payment:=v_gross-v_credit-v_points_value;
  IF v_payment<0 THEN RAISE EXCEPTION 'Refund allocation requires reconciliation'; END IF;
  IF v_credit>0 THEN INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount,note)
    VALUES(v_sale.customer_id,p_business_id,p_sale_id,'refund',v_credit,'Restored credit for return '||v_return.id); END IF;
  IF v_points>0 THEN INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points,note)
    VALUES(v_sale.customer_id,p_business_id,p_sale_id,'adjust',v_points,'Restored redeemed points for return '||v_return.id); END IF;
  SELECT coalesce(sum(points),0) INTO v_earned FROM loyalty_ledger WHERE sale_id=p_sale_id AND type='earn';
  IF v_earned>0 AND v_sale.total_amount>0 THEN
    v_reverse:=floor(v_earned*(v_prev+v_gross)/v_sale.total_amount)-floor(v_earned*v_prev/v_sale.total_amount);
    IF v_reverse>0 THEN INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points,note)
      VALUES(v_sale.customer_id,p_business_id,p_sale_id,'adjust',-v_reverse,'Reversed earned points for return '||v_return.id); END IF;
  END IF;
  FOR v_comm IN SELECT * FROM commission_ledger WHERE sale_id=p_sale_id ORDER BY id FOR UPDATE LOOP
    SELECT coalesce(sum(i.quantity*i.unit_price),0),coalesce(sum(i.returned_quantity*i.unit_price),0)
      INTO v_basis,v_returned_basis FROM sale_return_lines(p_sale_id) i
      WHERE v_comm.eligible_sale_item_ids IS NULL OR i.id=ANY(v_comm.eligible_sale_item_ids);
    v_reverse:=CASE WHEN v_basis>0 THEN round(v_comm.original_amount*v_returned_basis/v_basis,2) ELSE 0 END;
    UPDATE commission_ledger SET reversed_amount=v_reverse,
      amount=CASE WHEN paid_at IS NULL THEN original_amount-v_reverse ELSE amount END WHERE id=v_comm.id;
  END LOOP;
  UPDATE sales SET return_status=CASE WHEN EXISTS(SELECT 1 FROM sale_return_lines(p_sale_id) WHERE returned_quantity<quantity) THEN 'partial' ELSE 'full' END WHERE id=p_sale_id;
  UPDATE returns SET total_refund_amount=v_gross,tax_refund_amount=v_tax,refund_method=v_sale.payment_method,
    payment_refund_amount=v_payment,cash_refund_amount=CASE WHEN v_sale.payment_method='cash' THEN v_payment ELSE 0 END,
    credit_refund_amount=v_credit,points_refund=v_points,points_refund_value=v_points_value WHERE id=v_return.id RETURNING * INTO v_return;
  v_result:=jsonb_build_object('message','Return recorded successfully','return_id',v_return.id,'refund',to_jsonb(v_return)-'request_payload'-'result_payload',
    'items',(SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('product',jsonb_build_object('name',p.name,'sku',p.sku))) FROM return_items r JOIN products p ON p.id=r.product_id WHERE r.return_id=v_return.id));
  UPDATE returns SET result_payload=v_result WHERE id=v_return.id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.sale_return_lines(uuid),public.returnable_sale(uuid,uuid,uuid),
  public.process_return_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sale_return_lines(uuid),public.returnable_sale(uuid,uuid,uuid),
  public.process_return_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
