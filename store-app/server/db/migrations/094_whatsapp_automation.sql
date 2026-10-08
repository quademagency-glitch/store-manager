-- Automatic WhatsApp receipts and payment reminders, sent through the
-- business's own WhatsApp Business account (Meta Cloud API).
--
-- Off until the owner turns each kind on. Sent only to customers with a
-- recorded WhatsApp permission: Meta's policy requires opt-in before any
-- business-initiated message, receipts included. There is no QuadERP-owned
-- fallback account. The log keeps no message text or phone number; both are
-- read from current records at send time, so a withdrawn permission is
-- honoured up to the moment of sending.

-- WhatsApp as a gateway type and as a contact channel.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.communication_gateways'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~ '\mtype\M'
  LOOP EXECUTE format('ALTER TABLE public.communication_gateways DROP CONSTRAINT %I', r.conname); END LOOP;
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.customer_contact_preferences'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~ '\mchannel\M'
  LOOP EXECUTE format('ALTER TABLE public.customer_contact_preferences DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.communication_gateways
  ADD CONSTRAINT communication_gateways_type_check CHECK (type IN ('sms', 'email', 'both', 'whatsapp'));
ALTER TABLE public.customer_contact_preferences
  ADD CONSTRAINT customer_contact_preferences_channel_check CHECK (channel IN ('sms', 'email', 'whatsapp'));

-- Per-business switches, both off.
ALTER TABLE public.businesses
  ADD COLUMN whatsapp_receipts boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_reminders boolean NOT NULL DEFAULT false;

-- One row per message the business asked for; the unique key is what makes a
-- retried checkout or a re-run reminder sweep queue nothing twice.
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('receipt', 'reminder')),
  reference_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'accepted', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, kind, reference_id)
);
CREATE INDEX whatsapp_messages_due ON public.whatsapp_messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX whatsapp_messages_recent ON public.whatsapp_messages (business_id, created_at DESC);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

-- Claim due messages for one worker; SKIP LOCKED keeps two workers apart.
CREATE FUNCTION public.claim_whatsapp_messages(p_limit integer)
RETURNS SETOF public.whatsapp_messages LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  UPDATE whatsapp_messages m SET status = 'sending', attempts = m.attempts + 1, updated_at = now()
  WHERE m.id IN (
    SELECT id FROM whatsapp_messages
    WHERE status = 'queued' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT greatest(1, least(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING m.*;
$$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_messages(integer) TO service_role;

-- Bulk permission accepts the new channel.
CREATE OR REPLACE FUNCTION public.customer_consent_bulk(p_business_id uuid, p_actor_id uuid, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_operation uuid := (p_request->>'operation_id')::uuid;
  v_channel text := p_request->>'channel';
  v_allowed text := p_request->>'allowed';
  v_request jsonb;
  v_previous retail_operations%ROWTYPE;
  v_ids uuid[];
  v_found integer;
  v_result jsonb;
BEGIN
  IF v_operation IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'Invalid operator';
  END IF;
  v_request := jsonb_build_object('customer_consent', p_request, 'actor', p_actor_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_operation::text, 0));
  SELECT * INTO v_previous FROM retail_operations WHERE business_id = p_business_id AND operation_id = v_operation;
  IF FOUND THEN
    IF v_previous.request = v_request THEN RETURN v_previous.result; END IF;
    RAISE EXCEPTION 'Reference already used for another operation' USING ERRCODE = 'P0003';
  END IF;

  IF v_channel IS NULL OR v_channel NOT IN ('sms', 'email', 'whatsapp') THEN RAISE EXCEPTION 'Choose SMS, email or WhatsApp'; END IF;
  IF v_allowed IS NULL OR v_allowed NOT IN ('true', 'false') THEN RAISE EXCEPTION 'Choose whether contact is allowed'; END IF;
  IF nullif(trim(p_request->>'source'), '') IS NULL THEN RAISE EXCEPTION 'Record how this permission was obtained'; END IF;
  IF jsonb_typeof(p_request->'customer_ids') <> 'array' THEN RAISE EXCEPTION 'Choose the customers'; END IF;

  SELECT array_agg(DISTINCT x::uuid) INTO v_ids FROM jsonb_array_elements_text(p_request->'customer_ids') AS x;
  IF v_ids IS NULL OR cardinality(v_ids) > 500 THEN RAISE EXCEPTION 'Choose between 1 and 500 customers'; END IF;
  SELECT count(*) INTO v_found FROM customers WHERE business_id = p_business_id AND id = ANY(v_ids);
  IF v_found <> cardinality(v_ids) THEN RAISE EXCEPTION 'One or more customers were not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO customer_contact_preferences (business_id, customer_id, channel, allowed, source, recorded_by)
    SELECT p_business_id, cid, v_channel, v_allowed::boolean, p_request->>'source', p_actor_id FROM unnest(v_ids) AS cid
  ON CONFLICT (business_id, customer_id, channel) DO UPDATE
    SET allowed = excluded.allowed, source = excluded.source, recorded_by = excluded.recorded_by, recorded_at = clock_timestamp();

  v_result := jsonb_build_object('recorded', cardinality(v_ids), 'channel', v_channel, 'allowed', v_allowed::boolean);
  INSERT INTO retail_operations (business_id, operation_id, actor_id, request, result)
    VALUES (p_business_id, v_operation, p_actor_id, v_request, v_result);
  RETURN v_result;
END;
$$;

-- The audience view treats WhatsApp like SMS: the contact detail is the phone.
CREATE OR REPLACE FUNCTION public.customer_segment(p_business_id uuid,p_criteria jsonb,p_channel text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH purchases AS (
   SELECT s.customer_id,max(s.created_at) AS last_purchase,sum(s.total_amount-coalesce(r.refunds,0)) AS spent
   FROM sales s LEFT JOIN LATERAL (SELECT sum(total_refund_amount) refunds FROM returns WHERE original_sale_id=s.id) r ON true
   WHERE s.business_id=p_business_id AND s.status='completed' GROUP BY s.customer_id
 ), audience AS (
   SELECT c.id,c.name,c.phone,c.email,p.last_purchase,coalesce(p.spent,0) AS spent,
     coalesce(cp.allowed,false) AS allowed,
     coalesce(cp.allowed,false) AND nullif(CASE WHEN p_channel IN ('sms','whatsapp') THEN c.phone ELSE c.email END,'') IS NOT NULL AS eligible,
     CASE WHEN cp.allowed=false THEN 'Opted out' WHEN cp.allowed IS NULL THEN 'Preference not recorded'
       WHEN nullif(CASE WHEN p_channel IN ('sms','whatsapp') THEN c.phone ELSE c.email END,'') IS NULL THEN 'Contact detail missing' ELSE 'Allowed' END AS preference
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
