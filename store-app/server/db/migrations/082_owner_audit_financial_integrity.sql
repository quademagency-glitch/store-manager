-- Generated with `supabase migration new owner_audit_financial_integrity`,
-- then named 082 to follow this repository's migration runner order.
-- Existing costs cannot be reconstructed: freeze the best available estimate
-- and label it explicitly. New items record the cost at the time of sale.
ALTER TABLE public.sale_items
  ADD COLUMN unit_cost numeric(12, 4),
  ADD COLUMN cost_basis text NOT NULL DEFAULT 'estimated'
    CHECK (cost_basis IN ('recorded', 'estimated', 'unavailable'));

UPDATE public.sale_items si
SET unit_cost = p.cost_price,
    cost_basis = CASE WHEN p.cost_price IS NULL THEN 'unavailable' ELSE 'estimated' END
FROM public.products p WHERE p.id = si.product_id;
UPDATE public.sale_items SET cost_basis = 'unavailable' WHERE unit_cost IS NULL;

CREATE FUNCTION public.snapshot_sale_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT cost_price INTO NEW.unit_cost FROM public.products
    WHERE id = NEW.product_id AND business_id = NEW.business_id;
  NEW.cost_basis := CASE WHEN NEW.unit_cost IS NULL THEN 'unavailable' ELSE 'recorded' END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_sale_item_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_sale_item_cost() TO service_role;
CREATE TRIGGER snapshot_sale_item_cost BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_sale_item_cost();

CREATE FUNCTION public.preserve_sale_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.cost_basis IS DISTINCT FROM OLD.cost_basis THEN
    RAISE EXCEPTION 'Recorded sale costs are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_sale_item_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_sale_item_cost() TO service_role;
CREATE TRIGGER preserve_sale_item_cost BEFORE UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.preserve_sale_item_cost();

COMMENT ON COLUMN public.sale_items.unit_cost IS 'Frozen cost at sale creation; pre-082 rows are labelled estimated, never historical actuals.';

-- Customer verification is handled by the server. RLS restricts rows, not
-- columns: an authenticated table-wide SELECT would still expose OTPs.
REVOKE ALL ON TABLE public.customers FROM anon, authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'customers'
    AND column_name NOT IN ('verification_code', 'otp_expires_at', 'verification_code_expires_at');
  EXECUTE 'GRANT SELECT (' || cols || ') ON public.customers TO authenticated';
END;
$$;

ALTER TABLE public.commission_ledger
  ADD COLUMN payout_ledger_id uuid REFERENCES public.business_ledger(id);
REVOKE INSERT, UPDATE, DELETE ON public.commission_ledger FROM anon, authenticated;

-- Payout and its cash expense either both commit or both roll back. Lock rows
-- before testing paid_at so concurrent/repeated requests cannot pay twice.
CREATE FUNCTION public.pay_commissions(
  p_business_id uuid, p_location_id uuid, p_actor_id uuid,
  p_user_id uuid, p_commission_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_ids uuid[];
  v_total numeric;
  v_records jsonb;
  v_ledger_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'A valid payout location is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'Invalid payout actor';
  END IF;
  PERFORM id FROM commission_ledger
    WHERE id = ANY(p_commission_ids) AND business_id = p_business_id AND user_id = p_user_id
    ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM commission_ledger WHERE id = ANY(p_commission_ids)
      AND business_id = p_business_id AND user_id = p_user_id)
      <> (SELECT count(DISTINCT id) FROM unnest(p_commission_ids) id) THEN
    RAISE EXCEPTION 'Commission selection does not belong to this employee and business';
  END IF;
  SELECT array_agg(id), COALESCE(sum(amount), 0) INTO v_ids, v_total
    FROM commission_ledger WHERE id = ANY(p_commission_ids)
    AND business_id = p_business_id AND user_id = p_user_id AND paid_at IS NULL;
  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('message', 'Commissions already paid', 'total_paid', 0, 'records', '[]'::jsonb);
  END IF;
  IF v_total > 0 THEN
    INSERT INTO business_ledger(business_id, location_id, user_id, type, amount,
      description, status, approved_by, approved_at, metadata)
    VALUES (p_business_id, p_location_id, p_actor_id, 'expense', v_total,
      'Commission payout', 'approved', p_actor_id, now(),
      jsonb_build_object('commission_ids', v_ids, 'employee_id', p_user_id, 'account_category', 'Staff commissions')) RETURNING id INTO v_ledger_id;
  END IF;
  WITH paid AS (
    UPDATE commission_ledger SET paid_at = now(), payout_ledger_id = v_ledger_id WHERE id = ANY(v_ids) RETURNING *
  ) SELECT jsonb_agg(to_jsonb(paid)) INTO v_records FROM paid;
  RETURN jsonb_build_object('message', cardinality(v_ids) || ' commission(s) paid', 'total_paid', v_total, 'records', v_records);
END;
$$;
REVOKE ALL ON FUNCTION public.pay_commissions(uuid, uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commissions(uuid, uuid, uuid, uuid, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
