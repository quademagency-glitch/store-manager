-- Scaffolded with supabase migration new historical_reconciliation.
CREATE TABLE public.financial_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), actor_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL, kind text NOT NULL, record_id uuid NOT NULL,
  action text NOT NULL, note text NOT NULL, evidence text NOT NULL, request jsonb NOT NULL,
  before_record jsonb, after_record jsonb, transaction_id bigint NOT NULL DEFAULT txid_current(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id,operation_id)
);
ALTER TABLE public.financial_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_reviews FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.financial_reviews TO service_role;

-- Recorded costs stay immutable. An estimated cost may change only alongside
-- its documented correction journal in the very same database transaction.
CREATE OR REPLACE FUNCTION public.preserve_sale_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.cost_basis IS DISTINCT FROM OLD.cost_basis THEN
    IF OLD.cost_basis='recorded' OR NEW.cost_basis<>'recorded' OR NOT EXISTS(
      SELECT 1 FROM financial_reviews r WHERE r.business_id=OLD.business_id AND r.kind='cost' AND r.record_id=OLD.id
        AND r.action='confirm_cost' AND r.transaction_id=txid_current()
        AND (r.request->'values'->>'unit_cost')::numeric=NEW.unit_cost
    ) THEN RAISE EXCEPTION 'Recorded sale costs are immutable; document historical corrections through reconciliation'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE VIEW public.financial_exceptions WITH (security_invoker=true) AS
SELECT s.business_id,s.location_id,'sale'::text AS kind,s.id AS record_id,s.receipt_number AS reference,s.accounting_at AS occurred_at,s.total_amount AS amount,
  'Historical payment breakdown needs receipt evidence'::text AS reason,
  jsonb_build_object('payment_method',s.payment_method,'status',s.status,'customer_id',s.customer_id) AS details
FROM sales s WHERE s.status IN ('completed','void_pending') AND s.settlement_id IS NULL
UNION ALL
SELECT s.business_id,s.location_id,'cost',i.id,s.receipt_number,s.accounting_at,i.unit_cost,
  'Historical unit cost is missing or estimated',jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'cost_basis',i.cost_basis)
FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.status IN ('completed','void_pending') AND (i.unit_cost IS NULL OR i.cost_basis IS DISTINCT FROM 'recorded')
UNION ALL
SELECT c.business_id,s.location_id,'commission',c.id,coalesce(s.receipt_number,c.id::text),c.paid_at,c.amount,
  CASE WHEN c.payout_ledger_id IS NULL THEN 'Paid commission has no linked cash entry' ELSE 'Returned sale left paid commission to recover' END,
  jsonb_build_object('user_id',c.user_id,'reversed_amount',c.reversed_amount,'payout_ledger_id',c.payout_ledger_id)
FROM commission_ledger c JOIN sales s ON s.id=c.sale_id WHERE c.paid_at IS NOT NULL AND (c.payout_ledger_id IS NULL OR c.reversed_amount>0)
UNION ALL
SELECT r.business_id,r.location_id,'return',r.id,s.receipt_number,r.created_at,r.total_refund_amount,
  'Historical refund allocation needs payment and item evidence',jsonb_build_object('sale_id',s.id)
FROM returns r JOIN sales s ON s.id=r.original_sale_id WHERE r.calculation_version IS NULL;
REVOKE ALL ON public.financial_exceptions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_exceptions TO service_role;

CREATE FUNCTION public.reconcile_financial_record(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid;v_id uuid:=(p_request->>'record_id')::uuid;
  v_kind text:=p_request->>'kind';v_action text:=p_request->>'action';v_prior financial_reviews%ROWTYPE;
  v_before jsonb;v_after jsonb;v_sale sales%ROWTYPE;v_comm commission_ledger%ROWTYPE;v_ledger business_ledger%ROWTYPE;
  v_values jsonb:=p_request->'values';v_paid numeric;v_credit numeric;v_points numeric;v_value numeric;v_due numeric;v_method text;v_cost numeric;
BEGIN
  IF v_key IS NULL OR v_id IS NULL OR coalesce(length(trim(p_request->>'note')),0)<10 OR coalesce(length(trim(p_request->>'evidence')),0)<3 THEN RAISE EXCEPTION 'Explain the review and provide a receipt, bank statement or other evidence reference'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid reconciliation branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  SELECT * INTO v_prior FROM financial_reviews WHERE business_id=p_business_id AND operation_id=v_key;
  IF FOUND THEN
    IF v_prior.request<>p_request OR v_prior.actor_id<>p_actor_id OR v_prior.location_id<>p_location_id THEN RAISE EXCEPTION 'Review reference already used' USING ERRCODE='P0003'; END IF;
    RETURN jsonb_build_object('id',v_prior.id,'action',v_prior.action);
  END IF;
  IF v_kind='sale' THEN
    SELECT * INTO v_sale FROM sales WHERE id=v_id AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found in this branch'; END IF;
    v_before:=to_jsonb(v_sale);
  ELSIF v_kind='cost' THEN
    SELECT s.* INTO v_sale FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.id=v_id AND s.business_id=p_business_id AND s.location_id=p_location_id FOR UPDATE OF s;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale line not found in this branch'; END IF;
    SELECT to_jsonb(i) INTO v_before FROM sale_items i WHERE id=v_id FOR UPDATE;
  ELSIF v_kind='commission' THEN
    SELECT c.* INTO v_comm FROM commission_ledger c JOIN sales s ON s.id=c.sale_id WHERE c.id=v_id AND c.business_id=p_business_id AND s.location_id=p_location_id FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found in this branch'; END IF;
    v_before:=to_jsonb(v_comm);
  ELSIF v_kind='return' THEN
    SELECT to_jsonb(r) INTO v_before FROM returns r WHERE id=v_id AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Return not found in this branch'; END IF;
  ELSE RAISE EXCEPTION 'Invalid financial record type'; END IF;

  IF v_action='record_evidence' THEN v_after:=v_before;
  ELSIF v_action='confirm_settlement' AND v_kind='sale' THEN
    IF v_sale.settlement_id IS NOT NULL OR v_sale.status NOT IN ('completed','void_pending') THEN RAISE EXCEPTION 'Only a historical settled receipt can be reconciled'; END IF;
    IF EXISTS(SELECT 1 FROM returns WHERE original_sale_id=v_id) THEN RAISE EXCEPTION 'This receipt has refunds. Record its evidence for a joint payment and refund review'; END IF;
    v_paid:=(v_values->>'amount_paid')::numeric;v_credit:=(v_values->>'store_credit')::numeric;v_points:=(v_values->>'points')::numeric;v_value:=(v_values->>'points_value')::numeric;v_method:=v_values->>'payment_method';
    IF v_paid IS NULL OR v_credit IS NULL OR v_points IS NULL OR v_value IS NULL OR v_method IS NULL OR v_method NOT IN ('cash','card','mobile','transfer') THEN RAISE EXCEPTION 'Provide the complete payment breakdown'; END IF;
    IF v_paid::text IN ('NaN','Infinity','-Infinity') OR v_credit::text IN ('NaN','Infinity','-Infinity') OR v_points::text IN ('NaN','Infinity','-Infinity') OR v_value::text IN ('NaN','Infinity','-Infinity') OR least(v_paid,v_credit,v_points,v_value)<0 OR v_paid<>round(v_paid,2) OR v_credit<>round(v_credit,2) OR v_value<>round(v_value,2) OR v_points<>trunc(v_points) THEN RAISE EXCEPTION 'Invalid historical payment amounts'; END IF;
    IF v_credit IS DISTINCT FROM coalesce((SELECT -sum(amount) FROM store_credit_ledger WHERE business_id=p_business_id AND sale_id=v_id AND type='redeem'),0)
      OR v_points IS DISTINCT FROM coalesce((SELECT -sum(points) FROM loyalty_ledger WHERE business_id=p_business_id AND sale_id=v_id AND type='redeem'),0) THEN RAISE EXCEPTION 'The breakdown does not match the recorded reward debits. Record evidence for further review'; END IF;
    IF (v_points=0 AND v_value<>0) OR (v_points>0 AND v_value<=0) THEN RAISE EXCEPTION 'Points and their receipt value must agree'; END IF;
    v_due:=v_sale.total_amount-v_credit-v_value;
    IF v_due<0 OR v_paid<v_due OR (v_method<>'cash' AND v_paid<>v_due) THEN RAISE EXCEPTION 'Payment does not balance to the receipt'; END IF;
    IF nullif(v_values->>'settled_at','') IS NULL OR (v_values->>'settled_at')::timestamptz>now() THEN RAISE EXCEPTION 'Provide the actual settlement date'; END IF;
    UPDATE sales SET status='completed',payment_method=v_method,settlement_id=v_key,settled_at=(v_values->>'settled_at')::timestamptz,
      amount_paid=v_paid,change_due=CASE WHEN v_method='cash' THEN v_paid-v_due ELSE 0 END,cash_received=CASE WHEN v_method='cash' THEN v_due ELSE 0 END,
      store_credit_used=v_credit,loyalty_points_used=v_points,loyalty_value_used=v_value WHERE id=v_id RETURNING to_jsonb(sales.*) INTO v_after;
  ELSIF v_action='confirm_cost' AND v_kind='cost' THEN
    IF v_before->>'cost_basis'='recorded' THEN RAISE EXCEPTION 'This cost is already recorded'; END IF;
    v_cost:=(v_values->>'unit_cost')::numeric;
    IF v_cost IS NULL OR v_cost::text IN ('NaN','Infinity','-Infinity') OR v_cost<0 OR v_cost<>round(v_cost,2) THEN RAISE EXCEPTION 'Provide the evidenced unit cost'; END IF;
    INSERT INTO financial_reviews(business_id,location_id,actor_id,operation_id,kind,record_id,action,note,evidence,request,before_record)
      VALUES(p_business_id,p_location_id,p_actor_id,v_key,v_kind,v_id,v_action,p_request->>'note',p_request->>'evidence',p_request,v_before);
    UPDATE sale_items SET unit_cost=v_cost,cost_basis='recorded' WHERE id=v_id RETURNING to_jsonb(sale_items.*) INTO v_after;
    UPDATE financial_reviews SET after_record=v_after WHERE business_id=p_business_id AND operation_id=v_key RETURNING id INTO v_id;
    RETURN jsonb_build_object('id',v_id,'action',v_action);
  ELSIF v_action='link_payout' AND v_kind='commission' THEN
    IF v_comm.paid_at IS NULL OR v_comm.payout_ledger_id IS NOT NULL THEN RAISE EXCEPTION 'Only an unlinked historical payout can be matched'; END IF;
    SELECT * INTO v_ledger FROM business_ledger WHERE business_id=p_business_id AND location_id=p_location_id AND (ref_number=v_values->>'ledger_reference' OR id::text=v_values->>'ledger_reference') FOR UPDATE;
    IF NOT FOUND OR v_ledger.status<>'approved' OR v_ledger.type<>'expense' OR v_ledger.metadata->>'liability_movement'='true' THEN RAISE EXCEPTION 'Select an approved expense for the original commission payment'; END IF;
    IF v_ledger.amount<coalesce((SELECT sum(amount) FROM commission_ledger WHERE payout_ledger_id=v_ledger.id),0)+v_comm.amount THEN RAISE EXCEPTION 'Payout amount exceeds the remaining expense amount'; END IF;
    UPDATE commission_ledger SET payout_ledger_id=v_ledger.id WHERE id=v_id RETURNING to_jsonb(commission_ledger.*) INTO v_after;
  ELSE RAISE EXCEPTION 'This action is not available for this record'; END IF;
  INSERT INTO financial_reviews(business_id,location_id,actor_id,operation_id,kind,record_id,action,note,evidence,request,before_record,after_record)
    VALUES(p_business_id,p_location_id,p_actor_id,v_key,v_kind,v_id,v_action,p_request->>'note',p_request->>'evidence',p_request,v_before,v_after) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'action',v_action);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_financial_record(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_financial_record(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
CREATE INDEX financial_reviews_record_idx ON public.financial_reviews(business_id,kind,record_id,created_at DESC);
