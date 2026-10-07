-- Scaffold: supabase migration new customer_work_and_settlements (20261007132817).
CREATE TABLE public.customer_contact_preferences (
  business_id uuid NOT NULL REFERENCES businesses(id), customer_id uuid NOT NULL REFERENCES customers(id),
  channel text NOT NULL CHECK(channel IN ('sms','email')), allowed boolean NOT NULL DEFAULT false,
  source text NOT NULL, recorded_by uuid NOT NULL REFERENCES users(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(business_id,customer_id,channel)
);
CREATE TABLE public.customer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  created_by uuid NOT NULL REFERENCES users(id), name text NOT NULL, channel text NOT NULL CHECK(channel IN ('sms','email')),
  subject text NOT NULL DEFAULT '', message text NOT NULL, criteria jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','closed')), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.customer_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  campaign_id uuid NOT NULL REFERENCES customer_campaigns(id), customer_id uuid NOT NULL REFERENCES customers(id),
  status text NOT NULL CHECK(status IN ('planned','accepted','delivered','failed','opted_out','unconfirmed')),
  provider_reference text, note text NOT NULL, recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.shared_work_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('basket','purchase')), title text NOT NULL, payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1, device_id uuid, claimed_until timestamptz,
  closed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX shared_work_owner ON public.shared_work_drafts(business_id,location_id,owner_id,kind) WHERE closed_at IS NULL;
CREATE TABLE public.provider_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  location_id uuid NOT NULL REFERENCES locations(id), provider text NOT NULL, account_label text NOT NULL,
  reference text NOT NULL, payment_method text NOT NULL CHECK(payment_method IN ('card','mobile')),
  direction text NOT NULL CHECK(direction IN ('payment','refund')), statement_date date NOT NULL,
  currency text NOT NULL, gross numeric(12,2) NOT NULL CHECK(gross>=0), fee numeric(12,2) NOT NULL CHECK(fee>=0),
  net numeric(12,2) NOT NULL, imported_by uuid NOT NULL REFERENCES users(id), imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  matched_sale_id uuid REFERENCES sales(id), matched_return_id uuid REFERENCES returns(id),
  matched_by uuid REFERENCES users(id), matched_at timestamptz, match_note text,
  CHECK(gross-fee=net), CHECK(NOT(matched_sale_id IS NOT NULL AND matched_return_id IS NOT NULL)),
  UNIQUE(business_id,provider,account_label,reference,direction)
);
CREATE UNIQUE INDEX provider_sale_once ON public.provider_statement_lines(business_id,matched_sale_id) WHERE matched_sale_id IS NOT NULL;
CREATE UNIQUE INDEX provider_refund_once ON public.provider_statement_lines(business_id,matched_return_id) WHERE matched_return_id IS NOT NULL;

CREATE FUNCTION public.customer_segment(p_business_id uuid,p_criteria jsonb,p_channel text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH purchases AS (
   SELECT s.customer_id,max(s.created_at) AS last_purchase,sum(s.total_amount-coalesce(r.refunds,0)) AS spent
   FROM sales s LEFT JOIN LATERAL (SELECT sum(total_refund_amount) refunds FROM returns WHERE original_sale_id=s.id) r ON true
   WHERE s.business_id=p_business_id AND s.status='completed' GROUP BY s.customer_id
 ), audience AS (
   SELECT c.id,c.name,c.phone,c.email,p.last_purchase,coalesce(p.spent,0) AS spent,
     coalesce(cp.allowed,false) AS allowed,
     coalesce(cp.allowed,false) AND nullif(CASE WHEN p_channel='sms' THEN c.phone ELSE c.email END,'') IS NOT NULL AS eligible,
     CASE WHEN cp.allowed=false THEN 'Opted out' WHEN cp.allowed IS NULL THEN 'Preference not recorded'
       WHEN nullif(CASE WHEN p_channel='sms' THEN c.phone ELSE c.email END,'') IS NULL THEN 'Contact detail missing' ELSE 'Allowed' END AS preference
   FROM customers c LEFT JOIN purchases p ON p.customer_id=c.id
   LEFT JOIN customer_contact_preferences cp ON cp.business_id=c.business_id AND cp.customer_id=c.id AND cp.channel=p_channel
   WHERE c.business_id=p_business_id
     AND (coalesce(p_criteria->>'search','')='' OR c.name ILIKE '%'||(p_criteria->>'search')||'%')
     AND coalesce(p.spent,0)>=coalesce((p_criteria->>'min_spend')::numeric,0)
     AND (coalesce((p_criteria->>'inactive_days')::integer,0)=0 OR p.last_purchase<now()-make_interval(days=>(p_criteria->>'inactive_days')::integer))
     AND (coalesce(p_criteria->>'category','')='' OR EXISTS(SELECT 1 FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products pr ON pr.id=i.product_id
       WHERE s.customer_id=c.id AND s.business_id=p_business_id AND s.status='completed' AND pr.category=p_criteria->>'category'))
 ), page AS (SELECT * FROM audience ORDER BY name,id LIMIT 100 OFFSET greatest(0,p_offset))
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(page) FROM page),'[]'::jsonb),
   'total',(SELECT count(*) FROM audience),'eligible',(SELECT count(*) FROM audience WHERE eligible),'offset',greatest(0,p_offset));
$$;

CREATE FUNCTION public.customer_work_action(p_business_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_action text:=p_request->>'action';v_id uuid;v_result jsonb;v_previous retail_operations%ROWTYPE;
 v_operation uuid:=(p_request->>'operation_id')::uuid;v_request jsonb;v_campaign customer_campaigns%ROWTYPE;v_customer uuid;
BEGIN
 IF v_operation IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid operator'; END IF;
 v_request:=jsonb_build_object('customer_work',p_request,'actor',p_actor_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_operation::text,0));
 SELECT * INTO v_previous FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_operation;
 IF FOUND THEN IF v_previous.request=v_request THEN RETURN v_previous.result; END IF; RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
 IF v_action='preference' THEN
  v_customer:=(p_request->>'customer_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM customers WHERE id=v_customer AND business_id=p_business_id) THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='P0002'; END IF;
  IF nullif(trim(p_request->>'source'),'') IS NULL THEN RAISE EXCEPTION 'Record how this preference was obtained'; END IF;
  INSERT INTO customer_contact_preferences(business_id,customer_id,channel,allowed,source,recorded_by)
   VALUES(p_business_id,v_customer,p_request->>'channel',(p_request->>'allowed')::boolean,p_request->>'source',p_actor_id)
   ON CONFLICT(business_id,customer_id,channel) DO UPDATE SET allowed=excluded.allowed,source=excluded.source,recorded_by=excluded.recorded_by,recorded_at=clock_timestamp()
   RETURNING to_jsonb(customer_contact_preferences.*) INTO v_result;
 ELSIF v_action='campaign' THEN
  v_id:=(p_request->>'campaign_id')::uuid;
  IF v_id IS NULL THEN
   INSERT INTO customer_campaigns(business_id,created_by,name,channel,subject,message,criteria)
    VALUES(p_business_id,p_actor_id,p_request->>'name',p_request->>'channel',coalesce(p_request->>'subject',''),p_request->>'message',p_request->'criteria') RETURNING to_jsonb(customer_campaigns.*) INTO v_result;
  ELSE
   UPDATE customer_campaigns SET name=p_request->>'name',channel=p_request->>'channel',subject=coalesce(p_request->>'subject',''),message=p_request->>'message',criteria=p_request->'criteria',status='draft',version=version+1,updated_at=clock_timestamp()
    WHERE id=v_id AND business_id=p_business_id AND version=(p_request->>'version')::integer AND status<>'closed' RETURNING to_jsonb(customer_campaigns.*) INTO v_result;
   IF NOT FOUND THEN RAISE EXCEPTION 'Campaign changed on another device; reload before saving' USING ERRCODE='P0003'; END IF;
  END IF;
 ELSIF v_action='review_campaign' THEN
  UPDATE customer_campaigns SET status='reviewed',version=version+1,updated_at=clock_timestamp() WHERE id=(p_request->>'campaign_id')::uuid
   AND business_id=p_business_id AND version=(p_request->>'version')::integer AND status='draft' RETURNING to_jsonb(customer_campaigns.*) INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reload the campaign before reviewing' USING ERRCODE='P0003'; END IF;
 ELSIF v_action='followup' THEN
  SELECT * INTO v_campaign FROM customer_campaigns WHERE id=(p_request->>'campaign_id')::uuid AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE='P0002'; END IF;
  v_customer:=(p_request->>'customer_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM customers WHERE id=v_customer AND business_id=p_business_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF p_request->>'status'='planned' AND NOT EXISTS(SELECT 1 FROM customer_contact_preferences WHERE business_id=p_business_id AND customer_id=v_customer AND channel=v_campaign.channel AND allowed) THEN RAISE EXCEPTION 'This customer has not allowed this contact channel'; END IF;
  IF p_request->>'status' IN ('accepted','delivered') AND nullif(trim(p_request->>'provider_reference'),'') IS NULL THEN RAISE EXCEPTION 'A provider reference is required to record this status'; END IF;
  INSERT INTO customer_followups(business_id,campaign_id,customer_id,status,provider_reference,note,recorded_by)
   VALUES(p_business_id,v_campaign.id,v_customer,p_request->>'status',p_request->>'provider_reference',p_request->>'note',p_actor_id) RETURNING to_jsonb(customer_followups.*) INTO v_result;
 ELSE RAISE EXCEPTION 'Unknown customer action'; END IF;
 INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_operation,p_actor_id,v_request,v_result);
 RETURN v_result;
END;
$$;

CREATE FUNCTION public.shared_draft_action(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_draft shared_work_drafts%ROWTYPE;v_action text:=p_request->>'action';v_device uuid:=(p_request->>'device_id')::uuid;
 v_operation uuid:=(p_request->>'operation_id')::uuid;v_previous retail_operations%ROWTYPE;v_request jsonb;v_result jsonb;
BEGIN
 IF v_device IS NULL OR v_operation IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
  OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid draft owner or branch'; END IF;
 v_request:=jsonb_build_object('draft',p_request,'actor',p_actor_id,'branch',p_location_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_operation::text,0));
 SELECT * INTO v_previous FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_operation;
 IF FOUND THEN IF v_previous.request=v_request THEN RETURN v_previous.result; END IF; RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
 IF v_action='create' THEN
  IF octet_length((p_request->'payload')::text)>64000 THEN RAISE EXCEPTION 'This draft is too large'; END IF;
  INSERT INTO shared_work_drafts(business_id,location_id,owner_id,kind,title,payload,device_id,claimed_until)
   VALUES(p_business_id,p_location_id,p_actor_id,p_request->>'kind',p_request->>'title',p_request->'payload',v_device,clock_timestamp()+interval '10 minutes') RETURNING * INTO v_draft;
 ELSE
  SELECT * INTO v_draft FROM shared_work_drafts WHERE id=(p_request->>'draft_id')::uuid AND business_id=p_business_id AND location_id=p_location_id AND owner_id=p_actor_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found for this account and branch' USING ERRCODE='P0002'; END IF;
  IF v_draft.version<>(p_request->>'version')::integer THEN RAISE EXCEPTION 'Draft changed on another device; reload before saving' USING ERRCODE='P0003'; END IF;
  IF v_draft.device_id IS DISTINCT FROM v_device AND v_draft.claimed_until>clock_timestamp() THEN RAISE EXCEPTION 'Draft is being edited on another device; release it there or wait for its claim to expire' USING ERRCODE='P0003'; END IF;
  IF v_action='claim' THEN
   UPDATE shared_work_drafts SET device_id=v_device,claimed_until=clock_timestamp()+interval '10 minutes',version=version+1 WHERE id=v_draft.id RETURNING * INTO v_draft;
  ELSE
   IF v_draft.device_id IS DISTINCT FROM v_device OR v_draft.claimed_until<=clock_timestamp() THEN RAISE EXCEPTION 'Claim this draft before saving or closing it' USING ERRCODE='P0003'; END IF;
   IF v_action='save' THEN
    IF octet_length((p_request->'payload')::text)>64000 THEN RAISE EXCEPTION 'This draft is too large'; END IF;
    UPDATE shared_work_drafts SET title=p_request->>'title',payload=p_request->'payload',version=version+1,updated_at=clock_timestamp(),claimed_until=clock_timestamp()+interval '10 minutes' WHERE id=v_draft.id RETURNING * INTO v_draft;
   ELSIF v_action IN ('release','close') THEN
    UPDATE shared_work_drafts SET device_id=NULL,claimed_until=NULL,version=version+1,closed_at=CASE WHEN v_action='close' THEN clock_timestamp() END WHERE id=v_draft.id RETURNING * INTO v_draft;
   ELSE RAISE EXCEPTION 'Unknown draft action'; END IF;
  END IF;
 END IF;
 v_result:=to_jsonb(v_draft);
 INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_operation,p_actor_id,v_request,v_result);
 RETURN v_result;
END;
$$;

CREATE FUNCTION public.statement_action(p_business_id uuid,p_location_id uuid,p_actor_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_operation uuid:=(p_request->>'operation_id')::uuid;v_previous retail_operations%ROWTYPE;v_request jsonb;v_result jsonb;
 v_line jsonb;v_record provider_statement_lines%ROWTYPE;v_count integer:=0;v_duplicates integer:=0;v_amount numeric;v_method text;v_currency text;
BEGIN
 IF v_operation IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id)
  OR NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Invalid operator or branch'; END IF;
 v_request:=jsonb_build_object('statement',p_request,'actor',p_actor_id,'branch',p_location_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||v_operation::text,0));
 SELECT * INTO v_previous FROM retail_operations WHERE business_id=p_business_id AND operation_id=v_operation;
 IF FOUND THEN IF v_previous.request=v_request THEN RETURN v_previous.result; END IF; RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE='P0003'; END IF;
 IF p_request->>'action'='import' THEN
  IF jsonb_array_length(p_request->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import between 1 and 500 statement lines'; END IF;
  -- Serialize an account import so duplicate references cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||(p_request->>'provider')||(p_request->>'account_label'),0));
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request->'lines') LOOP
   SELECT * INTO v_record FROM provider_statement_lines WHERE business_id=p_business_id AND provider=p_request->>'provider' AND account_label=p_request->>'account_label' AND reference=v_line->>'reference' AND direction=v_line->>'direction';
   IF FOUND THEN
    IF v_record.location_id<>p_location_id OR v_record.gross<>(v_line->>'gross')::numeric OR v_record.fee<>(v_line->>'fee')::numeric OR v_record.net<>(v_line->>'net')::numeric OR v_record.currency<>v_line->>'currency' OR v_record.payment_method<>p_request->>'payment_method' OR v_record.statement_date<>(v_line->>'date')::date THEN RAISE EXCEPTION 'An existing statement reference has different details; review it before importing'; END IF;
    v_duplicates:=v_duplicates+1;CONTINUE;
   END IF;
   INSERT INTO provider_statement_lines(business_id,location_id,provider,account_label,reference,payment_method,direction,statement_date,currency,gross,fee,net,imported_by)
    VALUES(p_business_id,p_location_id,p_request->>'provider',p_request->>'account_label',v_line->>'reference',p_request->>'payment_method',v_line->>'direction',(v_line->>'date')::date,v_line->>'currency',(v_line->>'gross')::numeric,(v_line->>'fee')::numeric,(v_line->>'net')::numeric,p_actor_id);
   v_count:=v_count+1;
  END LOOP;
  v_result:=jsonb_build_object('imported',v_count,'duplicates',v_duplicates);
 ELSIF p_request->>'action'='match' THEN
  SELECT * INTO v_record FROM provider_statement_lines WHERE id=(p_request->>'line_id')::uuid AND business_id=p_business_id AND location_id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Statement line not found in this branch' USING ERRCODE='P0002'; END IF;
  IF v_record.matched_at IS NOT NULL THEN RAISE EXCEPTION 'This statement line is already matched'; END IF;
  IF v_record.direction='payment' THEN
   SELECT s.amount_paid,s.payment_method,coalesce(l.currency,b.currency) INTO v_amount,v_method,v_currency FROM sales s JOIN businesses b ON b.id=s.business_id JOIN locations l ON l.id=s.location_id
    WHERE s.id=(p_request->>'target_id')::uuid AND s.business_id=p_business_id AND s.location_id=p_location_id AND s.status IN ('completed','void_pending') FOR UPDATE OF s;
  ELSE
   SELECT r.payment_refund_amount,r.refund_method,coalesce(l.currency,b.currency) INTO v_amount,v_method,v_currency FROM returns r JOIN businesses b ON b.id=r.business_id JOIN locations l ON l.id=r.location_id
    WHERE r.id=(p_request->>'target_id')::uuid AND r.business_id=p_business_id AND r.location_id=p_location_id FOR UPDATE OF r;
  END IF;
  IF v_amount IS NULL OR v_amount<>v_record.gross OR v_method<>v_record.payment_method OR v_currency<>v_record.currency THEN RAISE EXCEPTION 'Amount, channel and currency must match the recorded payment or refund in this branch'; END IF;
  IF EXISTS(SELECT 1 FROM provider_statement_lines WHERE business_id=p_business_id AND
    (matched_sale_id=(p_request->>'target_id')::uuid OR matched_return_id=(p_request->>'target_id')::uuid)) THEN RAISE EXCEPTION 'This payment or refund is already matched to a statement line' USING ERRCODE='P0003'; END IF;
  IF nullif(trim(p_request->>'note'),'') IS NULL THEN RAISE EXCEPTION 'Record the evidence used to match this line'; END IF;
  UPDATE provider_statement_lines SET matched_sale_id=CASE WHEN direction='payment' THEN (p_request->>'target_id')::uuid END,matched_return_id=CASE WHEN direction='refund' THEN (p_request->>'target_id')::uuid END,
   matched_by=p_actor_id,matched_at=clock_timestamp(),match_note=p_request->>'note' WHERE id=v_record.id RETURNING to_jsonb(provider_statement_lines.*) INTO v_result;
 ELSE RAISE EXCEPTION 'Unknown statement action'; END IF;
 INSERT INTO retail_operations(business_id,operation_id,actor_id,request,result) VALUES(p_business_id,v_operation,p_actor_id,v_request,v_result);
 RETURN v_result;
END;
$$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['customer_contact_preferences','customer_campaigns','customer_followups','shared_work_drafts','provider_statement_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.customer_segment(uuid,jsonb,text,integer),public.customer_work_action(uuid,uuid,jsonb),public.shared_draft_action(uuid,uuid,uuid,jsonb),public.statement_action(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_segment(uuid,jsonb,text,integer),public.customer_work_action(uuid,uuid,jsonb),public.shared_draft_action(uuid,uuid,uuid,jsonb),public.statement_action(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
