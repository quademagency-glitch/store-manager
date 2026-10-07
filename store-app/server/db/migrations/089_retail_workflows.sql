-- Scaffolded with supabase migration new retail_workflows; numbered for this repo's runner.
CREATE TABLE public.till_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), register_name text NOT NULL,
  opened_by uuid NOT NULL REFERENCES users(id), opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  opening_float numeric(12,2) NOT NULL CHECK(opening_float >= 0), opening_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','reviewed')),
  closed_by uuid REFERENCES users(id), closed_at timestamptz, closing_snapshot jsonb,
  counted_cash numeric(12,2), expected_cash numeric(12,2), variance numeric(12,2),
  denominations jsonb, closing_note text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, review_note text
);
-- Sales belong to a branch, so its shared physical drawer has one active session.
CREATE UNIQUE INDEX till_one_open_per_branch ON public.till_sessions(business_id,location_id) WHERE status='open';
CREATE INDEX till_session_history ON public.till_sessions(business_id,location_id,opened_at DESC);
CREATE TABLE public.retail_operations (
  business_id uuid NOT NULL REFERENCES businesses(id), operation_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), request jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(business_id,operation_id)
);
ALTER TABLE public.till_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.till_sessions,public.retail_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.till_sessions,public.retail_operations TO service_role;

CREATE FUNCTION public.branch_cash_snapshot(p_business_id uuid,p_location_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'cash_sales',coalesce((SELECT sum(coalesce(cash_received,total_amount)) FROM sales WHERE business_id=p_business_id AND location_id=p_location_id AND status IN ('completed','void_pending') AND payment_method='cash'),0),
    'cash_refunds',coalesce((SELECT sum(coalesce(r.cash_refund_amount,CASE WHEN s.payment_method='cash' THEN r.total_refund_amount ELSE 0 END)) FROM returns r JOIN sales s ON s.id=r.original_sale_id WHERE r.business_id=p_business_id AND r.location_id=p_location_id),0),
    'cash_in',coalesce((SELECT sum(amount) FROM business_ledger l WHERE business_id=p_business_id AND location_id=p_location_id AND status='approved' AND type='pay_in' AND coalesce((SELECT p.payment_method FROM ar_payments p WHERE p.ledger_entry_id=l.id LIMIT 1),metadata->>'payment_method','cash')='cash'),0),
    'cash_out',coalesce((SELECT sum(amount) FROM business_ledger l WHERE business_id=p_business_id AND location_id=p_location_id AND status='approved' AND type IN ('expense','deposit_to_bank','ap_payment') AND coalesce((SELECT p.payment_method FROM ap_payments p WHERE p.ledger_entry_id=l.id LIMIT 1),metadata->>'payment_method','cash')='cash'),0),
    'card_recorded',coalesce((SELECT sum(amount_paid) FROM sales WHERE business_id=p_business_id AND location_id=p_location_id AND status IN ('completed','void_pending') AND payment_method='card'),0),
    'momo_recorded',coalesce((SELECT sum(amount_paid) FROM sales WHERE business_id=p_business_id AND location_id=p_location_id AND status IN ('completed','void_pending') AND payment_method='mobile'),0)
  );
$$;

CREATE FUNCTION public.manage_till_session(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid; v_action text:=p_request->>'action';
  v_prior retail_operations%ROWTYPE; v_session till_sessions%ROWTYPE; v_snapshot jsonb; v_amount numeric; v_expected numeric; v_result jsonb; v_note text:=trim(coalesce(p_request->>'note',''));
BEGIN
  IF v_key IS NULL OR v_action NOT IN ('open','close','review','cash_in','cash_out') OR v_action IS NULL THEN RAISE EXCEPTION 'Provide a valid till action and reference'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid till branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  SELECT * INTO v_prior FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_key;
  IF FOUND THEN
    IF v_prior.actor_id<>p_actor_id OR v_prior.request<>jsonb_build_object('location',p_location_id,'till',p_request) THEN RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
    RETURN v_prior.result;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('till:'||p_business_id::text||p_location_id::text,0));
  IF v_action='open' THEN
    v_amount:=(p_request->>'opening_float')::numeric;
    IF v_amount IS NULL OR v_amount<0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'Enter a valid opening float'; END IF;
    IF nullif(trim(p_request->>'register_name'),'') IS NULL THEN RAISE EXCEPTION 'Name the branch drawer'; END IF;
    IF EXISTS(SELECT 1 FROM till_sessions WHERE business_id=p_business_id AND location_id=p_location_id AND status='open') THEN RAISE EXCEPTION 'This branch already has an open till session' USING ERRCODE='P0003'; END IF;
    INSERT INTO till_sessions(business_id,location_id,register_name,opened_by,opening_float,opening_snapshot)
      VALUES(p_business_id,p_location_id,left(trim(p_request->>'register_name'),80),p_actor_id,v_amount,branch_cash_snapshot(p_business_id,p_location_id)) RETURNING * INTO v_session;
  ELSE
    SELECT * INTO v_session FROM till_sessions WHERE id=(p_request->>'session_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Till session not found in this branch' USING ERRCODE='P0002'; END IF;
    IF v_action='review' THEN
      IF v_session.status<>'closed' OR length(v_note)<3 THEN RAISE EXCEPTION 'Review a closed session and provide a note'; END IF;
      UPDATE till_sessions SET status='reviewed',reviewed_by=p_actor_id,reviewed_at=clock_timestamp(),review_note=v_note WHERE id=v_session.id RETURNING * INTO v_session;
    ELSE
      IF v_session.status<>'open' THEN RAISE EXCEPTION 'This till session is already closed' USING ERRCODE='P0003'; END IF;
      IF v_action='close' THEN
        v_amount:=(p_request->>'counted_cash')::numeric;
        IF v_amount IS NULL OR v_amount<0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'Enter a valid counted cash amount'; END IF;
        IF p_request ? 'denominations' AND p_request->'denominations'<>'{}'::jsonb THEN
          IF jsonb_typeof(p_request->'denominations')<>'object' OR EXISTS(
            SELECT 1 FROM jsonb_each_text(p_request->'denominations') d WHERE d.key NOT IN ('200','100','50','20','10','5','2','1','0.5','0.2','0.1') OR d.value !~ '^[0-9]+$'
          ) THEN RAISE EXCEPTION 'Invalid denomination count'; END IF;
          IF (SELECT sum(d.key::numeric*d.value::numeric) FROM jsonb_each_text(p_request->'denominations') d)<>v_amount THEN RAISE EXCEPTION 'Denomination total must match counted cash'; END IF;
        END IF;
        -- One cumulative snapshot avoids timestamp gaps, backdated approvals and
        -- per-source reads seeing different moments. Later commits belong to the next snapshot.
        v_snapshot:=branch_cash_snapshot(p_business_id,p_location_id);
        v_expected:=v_session.opening_float
          +(v_snapshot->>'cash_sales')::numeric-(v_session.opening_snapshot->>'cash_sales')::numeric
          +(v_snapshot->>'cash_in')::numeric-(v_session.opening_snapshot->>'cash_in')::numeric
          -(v_snapshot->>'cash_out')::numeric+(v_session.opening_snapshot->>'cash_out')::numeric
          -(v_snapshot->>'cash_refunds')::numeric+(v_session.opening_snapshot->>'cash_refunds')::numeric;
        IF v_amount<>v_expected AND length(v_note)<5 THEN RAISE EXCEPTION 'Explain the difference between counted and expected cash'; END IF;
        UPDATE till_sessions SET status='closed',closed_by=p_actor_id,closed_at=clock_timestamp(),closing_snapshot=v_snapshot,
          counted_cash=v_amount,expected_cash=v_expected,variance=v_amount-v_expected,denominations=p_request->'denominations',closing_note=v_note WHERE id=v_session.id RETURNING * INTO v_session;
      ELSE
        v_amount:=(p_request->>'amount')::numeric;
        IF v_amount IS NULL OR v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) OR length(v_note)<3 THEN RAISE EXCEPTION 'Provide a positive amount and a cash movement reason'; END IF;
        INSERT INTO business_ledger(business_id,location_id,user_id,type,amount,description,status,approved_by,approved_at,metadata)
          VALUES(p_business_id,p_location_id,p_actor_id,CASE WHEN v_action='cash_in' THEN 'pay_in' ELSE 'deposit_to_bank' END,v_amount,v_note,'approved',p_actor_id,now(),jsonb_build_object('till_session_id',v_session.id,'operation_id',v_key,'payment_method','cash'));
      END IF;
    END IF;
  END IF;
  v_result:=to_jsonb(v_session);
  INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_key,p_actor_id,jsonb_build_object('location',p_location_id,'till',p_request),v_result);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.bill_received_purchase(p_business_id uuid,p_actor_id uuid,p_po_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid; v_po purchase_orders%ROWTYPE; v_prior retail_operations%ROWTYPE;
  v_received numeric; v_billed numeric; v_amount numeric:=(p_request->>'amount')::numeric; v_bill ap_bills%ROWTYPE; v_request jsonb:=jsonb_build_object('purchase',p_po_id,'bill',p_request);
BEGIN
  IF v_key IS NULL OR v_amount IS NULL OR v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'Provide a billing reference and a positive amount'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid billing operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  SELECT * INTO v_prior FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_key;
  IF FOUND THEN
    IF v_prior.actor_id<>p_actor_id OR v_prior.request<>v_request THEN RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id=p_po_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE='P0002'; END IF;
  IF v_po.status NOT IN ('partial','received') THEN RAISE EXCEPTION 'Receive goods before creating their supplier bill'; END IF;
  SELECT coalesce(sum(received_quantity*unit_cost),0) INTO v_received FROM purchase_order_items WHERE purchase_order_id=p_po_id;
  SELECT coalesce(sum(amount),0) INTO v_billed FROM ap_bills WHERE business_id=p_business_id AND purchase_order_id=p_po_id AND status<>'void';
  IF v_amount>round(v_received-v_billed,2) THEN RAISE EXCEPTION 'Amount exceeds the received value remaining to bill' USING ERRCODE='P0003'; END IF;
  INSERT INTO ap_bills(business_id,supplier_id,purchase_order_id,bill_number,description,amount,currency,due_date,created_by)
    VALUES(p_business_id,v_po.supplier_id,p_po_id,generate_ap_bill_number(p_business_id),coalesce(nullif(p_request->>'description',''),'Received goods for '||v_po.po_number),v_amount,v_po.currency,nullif(p_request->>'due_date','')::date,p_actor_id) RETURNING * INTO v_bill;
  INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_key,p_actor_id,v_request,to_jsonb(v_bill));
  RETURN to_jsonb(v_bill);
END;
$$;
REVOKE ALL ON FUNCTION public.branch_cash_snapshot(uuid,uuid),public.manage_till_session(uuid,uuid,uuid,jsonb),public.bill_received_purchase(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.branch_cash_snapshot(uuid,uuid),public.manage_till_session(uuid,uuid,uuid,jsonb),public.bill_received_purchase(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

-- The existing draft writer remains the validation and line-item authority.
CREATE FUNCTION public.save_purchase_order_once(p_business_id uuid,p_actor_id uuid,p_po_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid; v_prior retail_operations%ROWTYPE;
 v_request jsonb:=jsonb_build_object('purchase_order',p_po_id,'save',p_request); v_result jsonb;
BEGIN
 IF v_key IS NULL THEN RAISE EXCEPTION 'A save reference is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
 SELECT * INTO v_prior FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_key;
 IF FOUND THEN
   IF v_prior.actor_id<>p_actor_id OR v_prior.request<>v_request THEN RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
   RETURN v_prior.result;
 END IF;
 v_result:=save_purchase_order(p_business_id,p_actor_id,p_po_id,p_request-'operation_id');
 INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_key,p_actor_id,v_request,v_result);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_purchase_order_once(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_order_once(uuid,uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.record_ap_payment_once(p_business_id uuid,p_actor_id uuid,p_bill_id uuid,p_request jsonb,p_ledger_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid; v_prior retail_operations%ROWTYPE; v_request jsonb:=jsonb_build_object('ap_payment',p_bill_id,'payment',p_request); v_result jsonb; v_location uuid:=nullif(p_request->>'location_id','')::uuid; v_amount numeric:=(p_request->>'amount')::numeric;
BEGIN
 IF v_key IS NULL OR v_amount IS NULL OR v_amount NOT BETWEEN 0.01 AND 9999999999.99 OR v_amount<>round(v_amount,2) OR p_request->>'payment_method' NOT IN ('cash','mobile_money','bank_transfer','card','other') OR p_ledger_status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Invalid supplier payment'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid payment operator'; END IF;
 IF (p_request->>'payment_method' IN ('cash','mobile_money') OR v_location IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM locations WHERE id=v_location AND business_id=p_business_id) THEN RAISE EXCEPTION 'Choose a payment branch in this business'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
 SELECT * INTO v_prior FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_key;
 IF FOUND THEN
   IF v_prior.actor_id<>p_actor_id OR v_prior.request<>v_request THEN RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
   RETURN v_prior.result;
 END IF;
 v_result:=record_ap_payment(p_bill_id,v_amount,p_request->>'payment_method',coalesce(nullif(p_request->>'payment_date','')::date,current_date),v_location,p_request->>'notes',p_actor_id,p_business_id,p_request->>'payment_method' IN ('cash','mobile_money'),p_ledger_status);
 INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_key,p_actor_id,v_request,v_result);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_ap_payment_once(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ap_payment_once(uuid,uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
