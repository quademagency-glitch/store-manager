-- Record a contact permission for many customers at once.
--
-- Same guarantees as the single-customer 'preference' action: one transaction,
-- an operation reference journalled in retail_operations with the full request
-- (who recorded it and how consent was obtained), and a retry with the same
-- reference returns the stored result instead of writing twice.
--
-- Also: customer import undo deleted customers with a plain DELETE, and the
-- preference and follow-up foreign keys had no ON DELETE action, so a single
-- recorded preference aborted the whole undo. Those records belong to the
-- customer and go with them, which also serves erasure requests.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.customers'::regclass
      AND c.conrelid IN ('public.customer_contact_preferences'::regclass, 'public.customer_followups'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
ALTER TABLE public.customer_contact_preferences
  ADD CONSTRAINT customer_contact_preferences_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_followups
  ADD CONSTRAINT customer_followups_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

CREATE FUNCTION public.customer_consent_bulk(p_business_id uuid, p_actor_id uuid, p_request jsonb)
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

  IF v_channel IS NULL OR v_channel NOT IN ('sms', 'email') THEN RAISE EXCEPTION 'Choose SMS or email'; END IF;
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

REVOKE ALL ON FUNCTION public.customer_consent_bulk(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_consent_bulk(uuid, uuid, jsonb) TO service_role;
