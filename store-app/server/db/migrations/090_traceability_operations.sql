-- Scaffold: supabase migration new traceability_operations (20261007132309).
-- Repository numbering; service-only workflows with tenant and branch checks.
CREATE TABLE public.unit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  unit_id uuid NOT NULL REFERENCES inventory_units(id), location_id uuid NOT NULL REFERENCES locations(id),
  actor_id uuid REFERENCES users(id), event_type text NOT NULL, details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX unit_events_history ON public.unit_events(business_id,unit_id,created_at);
CREATE TABLE public.unit_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  from_location_id uuid NOT NULL REFERENCES locations(id), to_location_id uuid NOT NULL REFERENCES locations(id),
  dispatched_by uuid NOT NULL REFERENCES users(id), dispatched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'in_transit' CHECK(status IN ('in_transit','partial','received')),
  note text NOT NULL, CHECK(from_location_id<>to_location_id)
);
CREATE TABLE public.unit_shipment_items (
  shipment_id uuid NOT NULL REFERENCES unit_shipments(id) ON DELETE CASCADE, unit_id uuid NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
  received_by uuid REFERENCES users(id), received_at timestamptz, receipt_note text,
  PRIMARY KEY(shipment_id,unit_id)
);
CREATE INDEX unit_shipments_branch ON public.unit_shipments(business_id,to_location_id,status);
CREATE TABLE public.return_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), return_item_id uuid NOT NULL UNIQUE REFERENCES return_items(id),
  status text NOT NULL DEFAULT 'awaiting_inspection' CHECK(status IN ('awaiting_inspection','quarantine','restock','repair','supplier_return')),
  condition text, note text, warranty_until date, warranty_reference text,
  inspected_by uuid REFERENCES users(id), inspected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.loss_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), alert_id uuid REFERENCES alerts(id),
  unit_id uuid REFERENCES inventory_units(id), title text NOT NULL,
  assignee_id uuid REFERENCES users(id), due_date date, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by uuid REFERENCES users(id), resolved_at timestamptz, resolution text
);
CREATE TABLE public.loss_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES loss_cases(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.label_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), unit_id uuid NOT NULL REFERENCES inventory_units(id),
  old_code_id uuid NOT NULL REFERENCES qr_code_pool(id), new_code_id uuid NOT NULL REFERENCES qr_code_pool(id),
  reason text NOT NULL, requested_by uuid NOT NULL REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid REFERENCES users(id), approved_at timestamptz, CHECK(old_code_id<>new_code_id)
);
CREATE TABLE public.workflow_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), subject_type text NOT NULL CHECK(subject_type IN ('inspection','case')),
  subject_id uuid NOT NULL, uploaded_by uuid NOT NULL REFERENCES users(id), filename text NOT NULL,
  content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  content_base64 text NOT NULL CHECK(length(content_base64)<=2800000), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX workflow_evidence_subject ON public.workflow_evidence(business_id,subject_type,subject_id);
CREATE FUNCTION public.guard_workflow_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_status text;
BEGIN
  IF NEW.subject_type='inspection' THEN
    SELECT status INTO v_status FROM return_inspections WHERE id=NEW.subject_id AND business_id=NEW.business_id AND location_id=NEW.location_id FOR UPDATE;
  ELSE
    SELECT status INTO v_status FROM loss_cases WHERE id=NEW.subject_id AND business_id=NEW.business_id AND location_id=NEW.location_id FOR UPDATE;
  END IF;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Evidence record not found in this branch'; END IF;
  IF v_status IN ('resolved','restock','supplier_return') THEN RAISE EXCEPTION 'This review is complete; its evidence is read-only'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.uploaded_by AND business_id=NEW.business_id) THEN RAISE EXCEPTION 'Invalid evidence uploader'; END IF;
  IF (SELECT count(*) FROM workflow_evidence WHERE subject_type=NEW.subject_type AND subject_id=NEW.subject_id)>=10 THEN RAISE EXCEPTION 'This record already has ten photos'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_workflow_evidence BEFORE INSERT ON public.workflow_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_workflow_evidence();
ALTER TABLE public.inventory_units ADD COLUMN purchase_receipt_id uuid REFERENCES public.purchase_receipts(id);
CREATE INDEX inventory_units_receiving_idx ON public.inventory_units(purchase_receipt_id,product_id) WHERE purchase_receipt_id IS NOT NULL;
-- 020 created this inside EXCEPTION WHEN OTHERS, so it may be absent.
ALTER TABLE public.inventory_units DROP CONSTRAINT IF EXISTS inventory_units_status_check;
ALTER TABLE public.inventory_units ADD CONSTRAINT inventory_units_status_check
  CHECK(status IN ('in_stock','sold','damaged','lost','transferred','returned','pending_sale','quarantine','in_transit','repair','supplier_return'));
-- Browser access cannot bypass the workflow RPCs.
REVOKE INSERT,UPDATE,DELETE ON public.inventory_units FROM anon,authenticated;

CREATE FUNCTION public.capture_unit_event() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_before jsonb; v_actor uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.status,NEW.location_id,NEW.qr_code_id,NEW.pack_code_id,NEW.serial_number,NEW.sold_in_sale_id)
    IS NOT DISTINCT FROM (OLD.status,OLD.location_id,OLD.qr_code_id,OLD.pack_code_id,OLD.serial_number,OLD.sold_in_sale_id) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('status',OLD.status,'location_id',OLD.location_id,'qr_code_id',OLD.qr_code_id,'sale_id',OLD.sold_in_sale_id); END IF;
  v_actor:=nullif(current_setting('quaderp.actor_id',true),'')::uuid;
  IF v_actor IS NULL AND TG_OP='INSERT' THEN v_actor:=NEW.assigned_by; END IF;
  IF v_actor IS NULL AND NEW.sold_in_sale_id IS NOT NULL THEN SELECT salesperson_id INTO v_actor FROM sales WHERE id=NEW.sold_in_sale_id; END IF;
  INSERT INTO unit_events(business_id,unit_id,location_id,actor_id,event_type,details)
    VALUES(NEW.business_id,NEW.id,NEW.location_id,v_actor,CASE WHEN TG_OP='INSERT' THEN 'assigned' ELSE 'changed' END,
      jsonb_build_object('before',v_before,'after',jsonb_build_object('status',NEW.status,'location_id',NEW.location_id,'qr_code_id',NEW.qr_code_id,'sale_id',NEW.sold_in_sale_id),
        'reference',nullif(current_setting('quaderp.reference',true),'')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_unit_event AFTER INSERT OR UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.capture_unit_event();
-- Do not fabricate an earlier journey: a migration snapshot is explicitly a snapshot.
INSERT INTO unit_events(business_id,unit_id,location_id,event_type,details)
 SELECT business_id,id,location_id,'history_started',jsonb_build_object('status',status,'assigned_at',assigned_at,'sale_id',sold_in_sale_id) FROM inventory_units;

-- Retain the tested refund accounting. All newly returned items start on hold;
-- disposition is a separate, recorded inspection and never refunds twice.
ALTER FUNCTION public.process_return_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,text) RENAME TO process_return_accounting;
CREATE FUNCTION public.process_return_transaction(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_sale_id uuid,p_operation_id uuid,p_items jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_line record; v_id uuid; v_existing boolean;
BEGIN
  -- Serialize retries with the accounting routine. A return completed before
  -- this migration must never acquire a new hold when its old request retries.
  PERFORM id FROM sales WHERE id=p_sale_id AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
  SELECT EXISTS(SELECT 1 FROM returns WHERE business_id=p_business_id AND operation_id=p_operation_id) INTO v_existing;
  PERFORM set_config('quaderp.actor_id',p_actor_id::text,true);
  PERFORM set_config('quaderp.reference',p_operation_id::text,true);
  v_result:=process_return_accounting(p_business_id,p_location_id,p_actor_id,p_sale_id,p_operation_id,p_items,p_reason);
  IF v_existing THEN
    RETURN v_result || jsonb_build_object('inspection_required',EXISTS(
      SELECT 1 FROM return_inspections i JOIN return_items r ON r.id=i.return_item_id
      WHERE r.return_id=(v_result->>'return_id')::uuid));
  END IF;
  FOR v_line IN SELECT * FROM return_items WHERE return_id=(v_result->>'return_id')::uuid ORDER BY product_id LOOP
    v_id:=NULL;
    INSERT INTO return_inspections(business_id,location_id,return_item_id) VALUES(p_business_id,p_location_id,v_line.id)
      ON CONFLICT(return_item_id) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      UPDATE product_inventory SET quantity=quantity-v_line.quantity WHERE product_id=v_line.product_id AND location_id=p_location_id;
      UPDATE inventory_units SET status='quarantine' WHERE id=ANY(v_line.returned_unit_ids);
      INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
        VALUES(p_business_id,p_location_id,v_line.product_id,-v_line.quantity,'ADJUSTMENT',p_actor_id,v_id,'Return held for condition inspection');
    END IF;
  END LOOP;
  RETURN v_result || jsonb_build_object('inspection_required',true);
END;
$$;

CREATE FUNCTION public.traceability_action(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_operation uuid:=(p_request->>'operation_id')::uuid; v_action text:=p_request->>'action';
  v_previous retail_operations%ROWTYPE; v_request jsonb; v_result jsonb; v_id uuid; v_ids uuid[];
  v_destination uuid; v_shipment unit_shipments%ROWTYPE; v_inspection return_inspections%ROWTYPE;
  v_line return_items%ROWTYPE; v_case loss_cases%ROWTYPE; v_label label_requests%ROWTYPE;
  v_unit inventory_units%ROWTYPE; v_receipt purchase_receipts%ROWTYPE; v_received integer; v_new_code uuid; v_row record; v_status text; v_note text:=trim(coalesce(p_request->>'note',''));
BEGIN
  IF v_operation IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid operator or branch'; END IF;
  v_request:=jsonb_build_object('traceability',p_request,'branch',p_location_id,'actor',p_actor_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_operation::text,0));
  SELECT * INTO v_previous FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_operation;
  IF FOUND THEN
    IF v_previous.request=v_request THEN RETURN v_previous.result; END IF;
    RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003';
  END IF;
  PERFORM set_config('quaderp.actor_id',p_actor_id::text,true);
  PERFORM set_config('quaderp.reference',v_operation::text,true);
  IF v_action IN ('dispatch','receive') THEN
    SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(p_request->'unit_ids') x;
    IF coalesce(cardinality(v_ids),0)=0 OR cardinality(v_ids)>200 OR cardinality(v_ids)<>(SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN RAISE EXCEPTION 'Scan 1 to 200 distinct units'; END IF;
    IF v_action='dispatch' THEN
      v_destination:=(p_request->>'destination_id')::uuid;
      IF v_destination=p_location_id OR NOT EXISTS(SELECT 1 FROM locations WHERE id=v_destination AND business_id=p_business_id) THEN RAISE EXCEPTION 'Choose a different branch in this business'; END IF;
    ELSE
      SELECT * INTO v_shipment FROM unit_shipments WHERE id=(p_request->>'shipment_id')::uuid AND business_id=p_business_id AND to_location_id=p_location_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found for this receiving branch' USING ERRCODE='P0002'; END IF;
      v_destination:=p_location_id;
    END IF;
    -- Match checkout/returns lock ordering: aggregate inventory first, then units.
    FOR v_row IN SELECT DISTINCT product_id FROM inventory_units WHERE id=ANY(v_ids) ORDER BY product_id LOOP
      INSERT INTO product_inventory(product_id,location_id,quantity) VALUES(v_row.product_id,v_destination,0) ON CONFLICT(product_id,location_id) DO NOTHING;
    END LOOP;
    PERFORM pi.id FROM product_inventory pi WHERE pi.product_id IN (SELECT product_id FROM inventory_units WHERE id=ANY(v_ids))
      AND pi.location_id IN (p_location_id,v_destination) ORDER BY pi.product_id,pi.location_id FOR UPDATE;
    PERFORM id FROM inventory_units WHERE id=ANY(v_ids) ORDER BY id FOR UPDATE;
    IF v_action='dispatch' THEN
      IF (SELECT count(*) FROM inventory_units WHERE id=ANY(v_ids) AND business_id=p_business_id AND location_id=p_location_id AND status='in_stock' AND sold_in_sale_id IS NULL)<>cardinality(v_ids) THEN RAISE EXCEPTION 'Every scanned unit must be available in this branch'; END IF;
      INSERT INTO unit_shipments(business_id,from_location_id,to_location_id,dispatched_by,note)
        VALUES(p_business_id,p_location_id,v_destination,p_actor_id,v_note) RETURNING id INTO v_id;
      INSERT INTO unit_shipment_items(shipment_id,unit_id) SELECT v_id,unnest(v_ids);
      FOR v_row IN SELECT product_id,count(*)::integer AS quantity FROM inventory_units WHERE id=ANY(v_ids) GROUP BY product_id LOOP
        UPDATE product_inventory SET quantity=quantity-v_row.quantity WHERE product_id=v_row.product_id AND location_id=p_location_id AND quantity>=v_row.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Recorded stock is insufficient; reconcile before transferring'; END IF;
        INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
          VALUES(p_business_id,p_location_id,v_row.product_id,-v_row.quantity,'TRANSFER_OUT',p_actor_id,v_id,v_note);
      END LOOP;
      UPDATE inventory_units SET status='in_transit' WHERE id=ANY(v_ids);
    ELSE
      v_id:=v_shipment.id;
      IF (SELECT count(*) FROM unit_shipment_items si JOIN inventory_units u ON u.id=si.unit_id WHERE si.shipment_id=v_id AND si.unit_id=ANY(v_ids)
        AND si.received_at IS NULL AND u.business_id=p_business_id AND u.status='in_transit' AND u.location_id=v_shipment.from_location_id)<>cardinality(v_ids) THEN RAISE EXCEPTION 'A unit is unexpected or has already been received'; END IF;
      FOR v_row IN SELECT product_id,count(*)::integer AS quantity FROM inventory_units WHERE id=ANY(v_ids) GROUP BY product_id LOOP
        UPDATE product_inventory SET quantity=quantity+v_row.quantity WHERE product_id=v_row.product_id AND location_id=p_location_id;
        INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
          VALUES(p_business_id,p_location_id,v_row.product_id,v_row.quantity,'TRANSFER_IN',p_actor_id,v_id,v_note);
      END LOOP;
      UPDATE unit_shipment_items SET received_by=p_actor_id,received_at=clock_timestamp(),receipt_note=v_note WHERE shipment_id=v_id AND unit_id=ANY(v_ids);
      UPDATE inventory_units SET status='in_stock',location_id=p_location_id WHERE id=ANY(v_ids);
      UPDATE unit_shipments SET status=CASE WHEN EXISTS(SELECT 1 FROM unit_shipment_items WHERE shipment_id=v_id AND received_at IS NULL) THEN 'partial' ELSE 'received' END WHERE id=v_id;
    END IF;
    SELECT to_jsonb(s) INTO v_result FROM unit_shipments s WHERE id=v_id;
  ELSIF v_action='inspect' THEN
    SELECT * INTO v_inspection FROM return_inspections WHERE id=(p_request->>'inspection_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found in this branch' USING ERRCODE='P0002'; END IF;
    v_status:=p_request->>'disposition';
    IF v_inspection.status IN ('restock','supplier_return') THEN RAISE EXCEPTION 'This disposition is final; use a new documented workflow'; END IF;
    IF v_status NOT IN ('restock','quarantine','repair','supplier_return') OR p_request->>'condition' NOT IN ('unopened','working','damaged') OR v_note='' THEN RAISE EXCEPTION 'Record condition, disposition and inspection notes'; END IF;
    IF v_status='restock' AND p_request->>'condition'='damaged' THEN RAISE EXCEPTION 'Damaged goods cannot return to sellable stock'; END IF;
    SELECT * INTO v_line FROM return_items WHERE id=v_inspection.return_item_id;
    PERFORM id FROM product_inventory WHERE product_id=v_line.product_id AND location_id=p_location_id FOR UPDATE;
    PERFORM id FROM inventory_units WHERE id=ANY(v_line.returned_unit_ids) ORDER BY id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM inventory_units WHERE id=ANY(v_line.returned_unit_ids) AND (business_id<>p_business_id OR location_id<>p_location_id OR status NOT IN ('quarantine','repair'))) THEN RAISE EXCEPTION 'Unit state changed; review the item history'; END IF;
    IF v_status='restock' THEN
      UPDATE product_inventory SET quantity=quantity+v_line.quantity WHERE product_id=v_line.product_id AND location_id=p_location_id;
      INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
        VALUES(p_business_id,p_location_id,v_line.product_id,v_line.quantity,'ADJUSTMENT',p_actor_id,v_inspection.id,'Inspection released return: '||v_note);
    END IF;
    UPDATE inventory_units SET status=CASE WHEN v_status='restock' THEN 'in_stock' ELSE v_status END WHERE id=ANY(v_line.returned_unit_ids);
    UPDATE return_inspections SET status=v_status,condition=p_request->>'condition',note=v_note,warranty_until=nullif(p_request->>'warranty_until','')::date,
      warranty_reference=p_request->>'warranty_reference',inspected_by=p_actor_id,inspected_at=clock_timestamp() WHERE id=v_inspection.id RETURNING to_jsonb(return_inspections.*) INTO v_result;
  ELSIF v_action='link_receipt' THEN
    SELECT * INTO v_receipt FROM purchase_receipts WHERE id=(p_request->>'receipt_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receiving record not found in this branch'; END IF;
    SELECT * INTO v_unit FROM inventory_units WHERE id=(p_request->>'unit_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND OR v_unit.status<>'in_stock' OR v_unit.purchase_receipt_id IS NOT NULL THEN RAISE EXCEPTION 'Choose an available unit without an existing receiving link'; END IF;
    SELECT coalesce(sum((value->>'quantity')::integer),0) INTO v_received FROM jsonb_array_elements(v_receipt.result->'received_items') WHERE value->>'product_id'=v_unit.product_id::text;
    IF v_received<1 OR (SELECT count(*) FROM inventory_units WHERE purchase_receipt_id=v_receipt.id AND product_id=v_unit.product_id)>=v_received THEN RAISE EXCEPTION 'All received units of this product are already linked, or the product was not received'; END IF;
    IF v_note='' THEN RAISE EXCEPTION 'Record how you verified this receiving record'; END IF;
    UPDATE inventory_units SET purchase_receipt_id=v_receipt.id WHERE id=v_unit.id;
    INSERT INTO unit_events(business_id,unit_id,location_id,actor_id,event_type,details)
      VALUES(p_business_id,v_unit.id,p_location_id,p_actor_id,'receiving_link',jsonb_build_object('receipt_id',v_receipt.id,'purchase_order_id',v_receipt.purchase_order_id,'note',v_note,'reference',v_operation));
    v_result:=jsonb_build_object('unit_id',v_unit.id,'receipt_id',v_receipt.id);
  ELSIF v_action='open_case' THEN
    IF trim(coalesce(p_request->>'title',''))='' THEN RAISE EXCEPTION 'Name the investigation'; END IF;
    IF p_request->>'alert_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM alerts WHERE id=(p_request->>'alert_id')::uuid AND business_id=p_business_id AND location_id=p_location_id) THEN RAISE EXCEPTION 'Alert not found in this branch'; END IF;
    IF p_request->>'unit_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_units WHERE id=(p_request->>'unit_id')::uuid AND business_id=p_business_id AND location_id=p_location_id) THEN RAISE EXCEPTION 'Unit not found in this branch'; END IF;
    INSERT INTO loss_cases(business_id,location_id,alert_id,unit_id,title,created_by) VALUES(p_business_id,p_location_id,(p_request->>'alert_id')::uuid,(p_request->>'unit_id')::uuid,p_request->>'title',p_actor_id) RETURNING to_jsonb(loss_cases.*) INTO v_result;
  ELSIF v_action='update_case' THEN
    SELECT * INTO v_case FROM loss_cases WHERE id=(p_request->>'case_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investigation not found in this branch' USING ERRCODE='P0002'; END IF;
    IF v_case.status='resolved' THEN RAISE EXCEPTION 'A resolved case cannot be rewritten'; END IF;
    IF v_note='' OR p_request->>'status' NOT IN ('open','investigating','resolved') THEN RAISE EXCEPTION 'Choose a status and record findings'; END IF;
    IF p_request->>'assignee_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=(p_request->>'assignee_id')::uuid AND business_id=p_business_id) THEN RAISE EXCEPTION 'Assignee must belong to this business'; END IF;
    UPDATE loss_cases SET assignee_id=(p_request->>'assignee_id')::uuid,due_date=nullif(p_request->>'due_date','')::date,status=p_request->>'status',
      resolved_by=CASE WHEN p_request->>'status'='resolved' THEN p_actor_id END,resolved_at=CASE WHEN p_request->>'status'='resolved' THEN clock_timestamp() END,
      resolution=CASE WHEN p_request->>'status'='resolved' THEN v_note END WHERE id=v_case.id RETURNING to_jsonb(loss_cases.*) INTO v_result;
    INSERT INTO loss_case_notes(case_id,actor_id,note) VALUES(v_case.id,p_actor_id,v_note);
  ELSIF v_action='request_label' THEN
    SELECT * INTO v_unit FROM inventory_units WHERE id=(p_request->>'unit_id')::uuid AND business_id=p_business_id AND location_id=p_location_id;
    IF NOT FOUND OR v_unit.qr_code_id IS NULL OR v_unit.status<>'in_stock' THEN RAISE EXCEPTION 'Select an available unit with an existing item label'; END IF;
    SELECT id INTO v_new_code FROM qr_code_pool WHERE code=p_request->>'new_code' AND status='unassigned';
    IF v_new_code IS NULL OR v_note='' THEN RAISE EXCEPTION 'Provide an unused code and reason for replacement'; END IF;
    INSERT INTO label_requests(business_id,location_id,unit_id,old_code_id,new_code_id,reason,requested_by)
      VALUES(p_business_id,p_location_id,v_unit.id,v_unit.qr_code_id,v_new_code,v_note,p_actor_id) RETURNING to_jsonb(label_requests.*) INTO v_result;
  ELSIF v_action='approve_label' THEN
    SELECT * INTO v_label FROM label_requests WHERE id=(p_request->>'label_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Label request not found in this branch' USING ERRCODE='P0002'; END IF;
    IF v_label.requested_by=p_actor_id THEN RAISE EXCEPTION 'A different manager must approve this replacement'; END IF;
    IF v_label.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Label already replaced'; END IF;
    PERFORM id FROM inventory_units WHERE id=v_label.unit_id FOR UPDATE;
    PERFORM id FROM qr_code_pool WHERE id IN (v_label.old_code_id,v_label.new_code_id) ORDER BY id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM inventory_units WHERE id=v_label.unit_id AND location_id=p_location_id AND status='in_stock' AND qr_code_id=v_label.old_code_id)
      OR NOT EXISTS(SELECT 1 FROM qr_code_pool WHERE id=v_label.new_code_id AND status='unassigned') THEN RAISE EXCEPTION 'Unit or code state changed; request a new replacement'; END IF;
    UPDATE qr_code_pool SET status='voided' WHERE id=v_label.old_code_id;
    UPDATE qr_code_pool SET status='assigned' WHERE id=v_label.new_code_id;
    UPDATE inventory_units SET qr_code_id=v_label.new_code_id WHERE id=v_label.unit_id;
    UPDATE label_requests SET approved_by=p_actor_id,approved_at=clock_timestamp() WHERE id=v_label.id RETURNING to_jsonb(label_requests.*) INTO v_result;
  ELSE RAISE EXCEPTION 'Unknown traceability action'; END IF;
  INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_operation,p_actor_id,v_request,v_result);
  RETURN v_result;
END;
$$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['unit_events','unit_shipments','unit_shipment_items','return_inspections','loss_cases','loss_case_notes','label_requests','workflow_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_workflow_evidence(),public.capture_unit_event(),public.process_return_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,text),public.traceability_action(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_workflow_evidence(),public.capture_unit_event(),public.process_return_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,text),public.traceability_action(uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.find_tracked_units(p_business_id uuid,p_location_id uuid,p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(row),'[]'::jsonb) FROM (
   SELECT u.id,u.status,u.serial_number,u.product_code,p.name AS product_name,q.code AS item_code,k.code AS pack_code,
     u.location_id,u.sold_in_sale_id
   FROM inventory_units u JOIN products p ON p.id=u.product_id
   LEFT JOIN qr_code_pool q ON q.id=u.qr_code_id LEFT JOIN qr_code_pool k ON k.id=u.pack_code_id
   WHERE u.business_id=p_business_id AND u.location_id=p_location_id AND
     (lower(q.code)=lower(p_code) OR lower(k.code)=lower(p_code) OR lower(u.serial_number)=lower(p_code) OR lower(u.product_code)=lower(p_code)
      OR EXISTS(SELECT 1 FROM label_requests l JOIN qr_code_pool old ON old.id=l.old_code_id WHERE l.unit_id=u.id AND l.business_id=p_business_id AND l.approved_at IS NOT NULL AND lower(old.code)=lower(p_code)))
   ORDER BY u.assigned_at DESC LIMIT 50
 ) row;
$$;
REVOKE ALL ON FUNCTION public.find_tracked_units(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_tracked_units(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
