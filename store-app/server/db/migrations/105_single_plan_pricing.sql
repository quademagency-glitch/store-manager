-- ============================================
-- Migration 105: one plan, paid before use (owner's decision, 2026-10-08)
--
--   GHS 1,000 one-time setup fee
--   GHS 1,000 a year, one branch included
--   GHS   200 a year for each additional branch, charged in full when the
--             branch is added and again at every renewal
--   No free trial: a new business pays the setup fee and first year before
--   it can use QuadERP. Yearly only. Every feature for everyone.
--
-- What a payment costs is computed in utils/subscriptionCharge.js; what it
-- grants is applied here, by apply_subscription_payment(), once per payment
-- reference, with the business row locked so the client's verify call and
-- Paystack's webhook racing each other cannot grant a renewal twice.
-- ============================================

-- ── Schema ──────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS price_per_extra_location NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Branches paid for in the current subscription year. routes/locations.js
-- refuses a new branch beyond this.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS paid_locations INTEGER NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_paid_locations_positive') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_paid_locations_positive CHECK (paid_locations >= 1);
  END IF;
END $$;

-- 'unpaid': signed up, not yet paid. Narrowed to billing like 'expired'.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('active', 'banned', 'trialing', 'expired', 'unpaid'));

-- ── The plan ────────────────────────────────────────────────────────────────

INSERT INTO public.platform_plans
  (name, description, price_monthly, price_yearly, currency, setup_fee, price_per_extra_location,
   max_users, max_locations, max_products, features, trial_days, trial_days_monthly, trial_days_yearly,
   promo_mode, is_active, sort_order)
VALUES
  ('QuadERP', 'Every feature. One branch included; each additional branch GHS 200 a year.',
   0, 1000, 'GHS', 1000, 200, -1, -1, -1, '{}'::jsonb, 0, 0, 0, 'none', true, 1)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description, price_monthly = 0, price_yearly = 1000, currency = 'GHS',
  setup_fee = 1000, price_per_extra_location = 200, max_users = -1, max_locations = -1, max_products = -1,
  trial_days = 0, trial_days_monthly = 0, trial_days_yearly = 0, promo_mode = 'none',
  compare_at_price_monthly = NULL, compare_at_price_yearly = NULL, intro_price_monthly = NULL, intro_price_yearly = NULL,
  is_active = true, sort_order = 1, updated_at = now();

-- The old tiers stay as rows (subscriptions and invoices refer to them) but
-- can no longer be chosen.
UPDATE public.platform_plans SET is_active = false, updated_at = now() WHERE name <> 'QuadERP' AND is_active;

-- Existing businesses move to the one plan, and are credited with the
-- branches they already run so the next renewal is priced honestly.
UPDATE public.businesses b
SET subscription_plan_id = (SELECT id FROM public.platform_plans WHERE name = 'QuadERP'),
    paid_locations = greatest(1, (SELECT count(*) FROM public.locations l WHERE l.business_id = b.id))::int;

-- ── Applying a payment ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_subscription_payment(
  p_business_id UUID,
  p_plan_id UUID,
  p_kind TEXT,
  p_branches INTEGER,
  p_amount NUMERIC,
  p_currency TEXT,
  p_reference TEXT,
  p_channel TEXT,
  p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub business_subscriptions%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_invoice UUID;
  v_paid_locations INTEGER;
BEGIN
  IF p_kind NOT IN ('start', 'renew', 'branches') THEN RAISE EXCEPTION 'Unknown payment kind' USING ERRCODE = 'P0001'; END IF;
  IF p_branches IS NULL OR p_branches < 1 THEN RAISE EXCEPTION 'A payment covers at least one branch' USING ERRCODE = 'P0001'; END IF;
  IF p_reference IS NULL OR p_reference = '' THEN RAISE EXCEPTION 'A payment needs its reference' USING ERRCODE = 'P0001'; END IF;

  -- One payment at a time per business; the reference makes a repeat a no-op.
  PERFORM 1 FROM businesses WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM billing_invoices WHERE paystack_reference = p_reference) THEN
    RETURN jsonb_build_object('already_applied', true);
  END IF;

  SELECT * INTO v_sub FROM business_subscriptions WHERE business_id = p_business_id FOR UPDATE;

  IF p_kind IN ('start', 'renew') THEN
    -- Paying before the year is out adds a year to the end of it.
    v_start := greatest(now(), coalesce(v_sub.current_period_end, now()));
    v_end := v_start + interval '1 year';
    INSERT INTO business_subscriptions
      (business_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
       trial_ends_at, amount, currency, paystack_subscription_code, updated_at)
    VALUES (p_business_id, p_plan_id, 'active', 'yearly', v_start, v_end, NULL, p_amount, p_currency, p_reference, now())
    ON CONFLICT (business_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id, status = 'active', billing_cycle = 'yearly',
      current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
      trial_ends_at = NULL, amount = EXCLUDED.amount, currency = EXCLUDED.currency,
      paystack_subscription_code = EXCLUDED.paystack_subscription_code, updated_at = now()
    RETURNING * INTO v_sub;

    UPDATE businesses
    SET status = 'active', subscription_plan_id = p_plan_id, trial_ends_at = NULL,
        paid_locations = CASE WHEN p_kind = 'start' THEN greatest(paid_locations, p_branches) ELSE paid_locations END
    WHERE id = p_business_id
    RETURNING paid_locations INTO v_paid_locations;
  ELSE
    -- Additional branches: added to what is paid for, kept at renewal.
    UPDATE businesses SET paid_locations = paid_locations + p_branches
    WHERE id = p_business_id
    RETURNING paid_locations INTO v_paid_locations;
  END IF;

  INSERT INTO billing_invoices
    (business_id, subscription_id, amount, currency, status, payment_method, paystack_reference, description, paid_at)
  VALUES (p_business_id, v_sub.id, p_amount, p_currency, 'paid', coalesce(p_channel, 'paystack'), p_reference, p_description, now())
  RETURNING id INTO v_invoice;

  RETURN jsonb_build_object(
    'already_applied', false,
    'invoice_id', v_invoice,
    'paid_locations', v_paid_locations,
    'current_period_end', v_sub.current_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_payment(UUID, UUID, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_payment(UUID, UUID, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;
