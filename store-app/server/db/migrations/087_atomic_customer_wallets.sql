-- Scaffolded with supabase migration new atomic_customer_wallets.
-- Each wallet change carries its actor, branch, immutable request fingerprint,
-- and result. Verification codes are never retained in this operation journal.
CREATE TABLE public.wallet_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  operation_id uuid NOT NULL, location_id uuid NOT NULL REFERENCES locations(id),
  actor_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL, request_hash text NOT NULL,
  customer_id uuid REFERENCES customers(id), gift_card_id uuid REFERENCES gift_cards(id),
  credit_entry_id uuid REFERENCES store_credit_ledger(id), ledger_entry_id uuid REFERENCES business_ledger(id),
  amount numeric(12,2) NOT NULL CHECK(amount>0), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,operation_id)
);
ALTER TABLE public.wallet_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.wallet_operations TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.gift_cards FROM anon,authenticated;

CREATE FUNCTION public.process_wallet_transaction(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_kind text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_key uuid:=(p_request->>'operation_id')::uuid; v_amount numeric:=(p_request->>'amount')::numeric;
  v_customer_id uuid:=(p_request->>'customer_id')::uuid; v_customer customers%ROWTYPE;
  v_prior wallet_operations%ROWTYPE; v_card gift_cards%ROWTYPE; v_credit store_credit_ledger%ROWTYPE;
  v_ledger_id uuid; v_result jsonb; v_funding text:=p_request->>'funding'; v_note text:=trim(p_request->>'note');
  v_hash text:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
BEGIN
  IF v_key IS NULL OR v_amount IS NULL OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<=0 OR v_amount>99999999.99 OR round(v_amount,2)<>v_amount THEN RAISE EXCEPTION 'A reference and positive amount with at most two decimal places are required'; END IF;
  IF p_kind NOT IN ('deposit','withdrawal','credit_adjustment','gift_issue','gift_transfer') THEN RAISE EXCEPTION 'Unknown wallet operation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
    OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid branch or operator'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_key::text,0));
  SELECT * INTO v_prior FROM wallet_operations WHERE business_id=p_business_id AND operation_id=v_key;
  IF FOUND THEN
    IF v_prior.kind<>p_kind OR v_prior.request_hash<>v_hash OR v_prior.location_id<>p_location_id OR v_prior.actor_id<>p_actor_id THEN RAISE EXCEPTION 'Wallet reference already used for another request' USING ERRCODE='P0003'; END IF;
    RETURN v_prior.result;
  END IF;
  IF v_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM customers WHERE id=v_customer_id AND business_id=p_business_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='P0002'; END IF;
  ELSIF p_kind<>'gift_issue' THEN RAISE EXCEPTION 'Select a customer'; END IF;

  IF p_kind='withdrawal' THEN
    IF v_customer.verification_code IS NULL OR v_customer.verification_code IS DISTINCT FROM p_request->>'code'
      OR v_customer.otp_expires_at IS NULL OR v_customer.otp_expires_at<=now() THEN RAISE EXCEPTION 'Invalid or expired verification code'; END IF;
    IF coalesce((SELECT sum(amount) FROM store_credit_ledger WHERE customer_id=v_customer_id AND business_id=p_business_id),0)<v_amount THEN RAISE EXCEPTION 'Insufficient customer credit'; END IF;
    UPDATE customers SET verification_code=NULL,otp_expires_at=NULL WHERE id=v_customer_id;
  END IF;
  IF p_kind='credit_adjustment' AND coalesce(length(v_note),0)<5 THEN RAISE EXCEPTION 'Explain why this credit adjustment is needed'; END IF;

  IF p_kind='gift_issue' THEN
    IF v_funding IS NULL OR v_funding NOT IN ('cash','promotional') THEN RAISE EXCEPTION 'Select cash purchase or promotional gift'; END IF;
    IF v_funding='promotional' AND coalesce(length(v_note),0)<5 THEN RAISE EXCEPTION 'Give a reason for the promotional gift'; END IF;
    IF nullif(p_request->>'expires_at','')::timestamptz<=now() THEN RAISE EXCEPTION 'Gift card expiry must be in the future'; END IF;
    INSERT INTO gift_cards(business_id,code,initial_balance,current_balance,issued_to_customer_id,expires_at,created_by)
      VALUES(p_business_id,upper(replace(gen_random_uuid()::text,'-','')),v_amount,v_amount,v_customer_id,nullif(p_request->>'expires_at','')::timestamptz,p_actor_id) RETURNING * INTO v_card;
  ELSIF p_kind='gift_transfer' THEN
    SELECT * INTO v_card FROM gift_cards WHERE business_id=p_business_id AND code=upper(trim(p_request->>'code')) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found' USING ERRCODE='P0002'; END IF;
    IF NOT v_card.active OR v_card.expires_at<=now() THEN RAISE EXCEPTION 'Gift card is inactive or expired'; END IF;
    IF v_card.issued_to_customer_id IS NOT NULL AND v_card.issued_to_customer_id<>v_customer_id THEN RAISE EXCEPTION 'This gift card belongs to another customer'; END IF;
    IF v_card.current_balance<v_amount THEN RAISE EXCEPTION 'Insufficient gift card balance'; END IF;
    UPDATE gift_cards SET current_balance=current_balance-v_amount WHERE id=v_card.id RETURNING * INTO v_card;
  END IF;

  IF p_kind<>'gift_issue' THEN
    INSERT INTO store_credit_ledger(customer_id,business_id,type,amount,note)
      VALUES(v_customer_id,p_business_id,CASE WHEN p_kind='withdrawal' THEN 'redeem' ELSE 'issue' END,
        CASE WHEN p_kind='withdrawal' THEN -v_amount ELSE v_amount END,
        p_kind||' ['||v_key::text||']'||CASE WHEN v_note IS NOT NULL THEN ': '||v_note ELSE '' END) RETURNING * INTO v_credit;
  END IF;
  IF p_kind IN ('deposit','withdrawal') OR (p_kind='gift_issue' AND v_funding='cash') THEN
    INSERT INTO business_ledger(business_id,location_id,user_id,type,amount,description,status,approved_by,approved_at,metadata)
      VALUES(p_business_id,p_location_id,p_actor_id,CASE WHEN p_kind='withdrawal' THEN 'expense' ELSE 'pay_in' END,
        v_amount,CASE p_kind WHEN 'deposit' THEN 'Customer cash deposit' WHEN 'withdrawal' THEN 'Customer cash withdrawal' ELSE 'Gift card cash purchase' END,
        'approved',p_actor_id,now(),jsonb_build_object('flow_kind',p_kind,'operation_id',v_key,'customer_id',v_customer_id,'gift_card_id',v_card.id,'liability_movement',true)) RETURNING id INTO v_ledger_id;
  END IF;
  v_result:=jsonb_build_object('operation_id',v_key,'kind',p_kind,'amount',v_amount,'new_balance',v_credit.balance_after,'entry',CASE WHEN v_credit.id IS NULL THEN NULL ELSE to_jsonb(v_credit) END,
    'card',CASE WHEN v_card.id IS NULL THEN NULL ELSE to_jsonb(v_card) END,'ledger_entry_id',v_ledger_id);
  INSERT INTO wallet_operations(business_id,operation_id,location_id,actor_id,kind,request_hash,customer_id,gift_card_id,credit_entry_id,ledger_entry_id,amount,result)
    VALUES(p_business_id,v_key,p_location_id,p_actor_id,p_kind,v_hash,v_customer_id,v_card.id,v_credit.id,v_ledger_id,v_amount,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.process_wallet_transaction(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid,uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
