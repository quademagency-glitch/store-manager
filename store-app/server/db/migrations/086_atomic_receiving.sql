-- Scaffolded with supabase migration new atomic_receiving.
CREATE TABLE public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  operation_id uuid NOT NULL, purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  location_id uuid NOT NULL REFERENCES locations(id), actor_id uuid NOT NULL REFERENCES users(id),
  request jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id,operation_id)
);
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.purchase_receipts TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.purchase_orders,public.purchase_order_items FROM anon,authenticated;
CREATE FUNCTION public.receive_purchase_transaction(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_po_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid;v_po purchase_orders%ROWTYPE;v_prior purchase_receipts%ROWTYPE;
  v_items jsonb:=p_request->'items';v_item jsonb;v_line purchase_order_items%ROWTYPE;v_qty integer;v_received jsonb:='[]';v_result jsonb;v_status text;v_supplier text;
BEGIN
  IF v_key IS NULL OR jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A receiving reference and items are required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid receiving branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  SELECT * INTO v_prior FROM purchase_receipts WHERE business_id=p_business_id AND operation_id=v_key;
  IF FOUND THEN
    IF v_prior.purchase_order_id<>p_po_id OR v_prior.location_id<>p_location_id OR v_prior.actor_id<>p_actor_id OR v_prior.request<>p_request THEN RAISE EXCEPTION 'Receiving reference already used for another delivery' USING ERRCODE='P0003'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id=p_po_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE='P0002'; END IF;
  IF v_po.status NOT IN ('sent','partial') THEN RAISE EXCEPTION 'Only sent or partly received purchase orders can receive goods'; END IF;
  IF (SELECT count(DISTINCT value->>'item_id') FROM jsonb_array_elements(v_items))<>jsonb_array_length(v_items) THEN RAISE EXCEPTION 'Select each purchase line only once'; END IF;
  PERFORM p.id FROM products p JOIN purchase_order_items i ON i.product_id=p.id WHERE i.purchase_order_id=p_po_id ORDER BY p.id FOR UPDATE OF p;
  PERFORM pi.id FROM product_inventory pi JOIN purchase_order_items i ON i.product_id=pi.product_id WHERE i.purchase_order_id=p_po_id AND pi.location_id=p_location_id ORDER BY pi.product_id FOR UPDATE OF pi;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) ORDER BY value->>'item_id' LOOP
    SELECT * INTO v_line FROM purchase_order_items WHERE id=(v_item->>'item_id')::uuid AND purchase_order_id=p_po_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM products WHERE id=v_line.product_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Purchase line does not belong to this order and business'; END IF;
    v_qty:=(v_item->>'received_qty')::integer;
    IF v_qty IS NULL OR v_qty<=0 OR (v_item->>'received_qty')::numeric<>v_qty OR v_qty>v_line.quantity-v_line.received_quantity THEN RAISE EXCEPTION 'Received quantity exceeds the outstanding whole quantity'; END IF;
    UPDATE purchase_order_items SET received_quantity=received_quantity+v_qty WHERE id=v_line.id;
    INSERT INTO product_inventory(product_id,location_id,quantity) VALUES(v_line.product_id,p_location_id,v_qty)
      ON CONFLICT(product_id,location_id) DO UPDATE SET quantity=product_inventory.quantity+EXCLUDED.quantity;
    IF v_line.unit_cost>0 THEN UPDATE products SET cost_price=v_line.unit_cost WHERE id=v_line.product_id; END IF;
    INSERT INTO stock_movements(product_id,user_id,business_id,location_id,quantity_change,movement_type,reference_id,notes)
      VALUES(v_line.product_id,p_actor_id,p_business_id,p_location_id,v_qty,'RECEIPT',p_po_id,'PO '||v_po.po_number||': '||coalesce(p_request->>'notes',''));
    v_received:=v_received||jsonb_build_array(jsonb_build_object('product_id',v_line.product_id,'quantity',v_qty,'unit_cost',v_line.unit_cost));
  END LOOP;
  v_status:=CASE WHEN EXISTS(SELECT 1 FROM purchase_order_items WHERE purchase_order_id=p_po_id AND received_quantity<quantity) THEN 'partial' ELSE 'received' END;
  UPDATE purchase_orders SET status=v_status,updated_at=now(),received_date=CASE WHEN v_status='received' THEN current_date ELSE received_date END,
    received_by=CASE WHEN v_status='received' THEN p_actor_id ELSE received_by END WHERE id=p_po_id RETURNING * INTO v_po;
  SELECT name INTO v_supplier FROM suppliers WHERE id=v_po.supplier_id AND business_id=p_business_id;
  v_result:=jsonb_build_object('message','Goods received. PO status: '||v_status,'purchase_order',to_jsonb(v_po),'received_items',v_received,
    'grn_data',jsonb_build_object('po_number',v_po.po_number,'supplier_name',coalesce(v_supplier,'Unknown'),'items',v_received,'notes',coalesce(p_request->>'notes',''),'date',now(),'received_by',(SELECT name FROM users WHERE id=p_actor_id)));
  INSERT INTO purchase_receipts(business_id,operation_id,purchase_order_id,location_id,actor_id,request,result)
    VALUES(p_business_id,v_key,p_po_id,p_location_id,p_actor_id,p_request,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_purchase_transaction(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_transaction(uuid,uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

-- Editing, sending and receiving serialize on the same order row. Replacing
-- draft lines is one transaction, so a failed insert never leaves an empty PO.
CREATE FUNCTION public.save_purchase_order(p_business_id uuid,p_actor_id uuid,p_po_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_po purchase_orders%ROWTYPE;v_item jsonb;v_items jsonb:=p_request->'items';v_qty integer;v_cost numeric;v_supplier uuid:=(p_request->>'supplier_id')::uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid purchase operator'; END IF;
  IF p_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM purchase_orders WHERE id=p_po_id AND business_id=p_business_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE='P0002'; END IF;
    IF v_po.status<>'draft' THEN RAISE EXCEPTION 'Only draft purchase orders can be edited'; END IF;
    v_supplier:=coalesce(v_supplier,v_po.supplier_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=v_supplier AND business_id=p_business_id) THEN RAISE EXCEPTION 'Supplier does not belong to this business'; END IF;
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Provide at least one purchase line'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_qty:=(v_item->>'quantity')::integer;v_cost:=coalesce((v_item->>'unit_cost')::numeric,0);
    IF v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 100000 OR (v_item->>'quantity')::numeric<>v_qty OR v_cost::text IN ('NaN','Infinity','-Infinity') OR v_cost<0 OR v_cost<>round(v_cost,2) THEN RAISE EXCEPTION 'Invalid purchase quantity or unit cost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM products WHERE id=(v_item->>'product_id')::uuid AND business_id=p_business_id) THEN RAISE EXCEPTION 'Product does not belong to this business'; END IF;
  END LOOP;
  IF p_po_id IS NULL THEN
    INSERT INTO purchase_orders(business_id,supplier_id,po_number,currency,created_by)
      VALUES(p_business_id,v_supplier,generate_po_number(p_business_id),(SELECT currency FROM businesses WHERE id=p_business_id),p_actor_id) RETURNING * INTO v_po;
  END IF;
  UPDATE purchase_orders SET supplier_id=v_supplier,expected_date=nullif(p_request->>'expected_date','')::date,notes=p_request->>'notes',updated_at=now() WHERE id=v_po.id;
  DELETE FROM purchase_order_items WHERE purchase_order_id=v_po.id;
  INSERT INTO purchase_order_items(purchase_order_id,product_id,quantity,unit_cost,notes)
    SELECT v_po.id,(value->>'product_id')::uuid,(value->>'quantity')::integer,coalesce((value->>'unit_cost')::numeric,0),value->>'notes' FROM jsonb_array_elements(v_items);
  SELECT * INTO v_po FROM purchase_orders WHERE id=v_po.id;
  RETURN jsonb_build_object('purchase_order',to_jsonb(v_po),'message','Purchase order saved');
END;
$$;
CREATE FUNCTION public.transition_purchase_order(p_business_id uuid,p_actor_id uuid,p_po_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_po purchase_orders%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid purchase operator'; END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id=p_po_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE='P0002'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent','cancelled') THEN RAISE EXCEPTION 'Invalid purchase order transition'; END IF;
  IF v_po.status=p_status THEN RETURN jsonb_build_object('purchase_order',to_jsonb(v_po)); END IF;
  IF (p_status='sent' AND v_po.status<>'draft') OR (p_status='cancelled' AND v_po.status NOT IN ('draft','sent')) THEN RAISE EXCEPTION 'Purchase order cannot change from % to %',v_po.status,p_status; END IF;
  IF p_status='sent' AND NOT EXISTS(SELECT 1 FROM purchase_order_items WHERE purchase_order_id=p_po_id AND quantity>0) THEN RAISE EXCEPTION 'Cannot send an empty purchase order'; END IF;
  UPDATE purchase_orders SET status=p_status,updated_at=now() WHERE id=p_po_id RETURNING * INTO v_po;
  RETURN jsonb_build_object('purchase_order',to_jsonb(v_po));
END;
$$;
REVOKE ALL ON FUNCTION public.save_purchase_order(uuid,uuid,uuid,jsonb),public.transition_purchase_order(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(uuid,uuid,uuid,jsonb),public.transition_purchase_order(uuid,uuid,uuid,text) TO service_role;
