-- ============================================
-- Migration 075: credit limits and notes on a customer account
--
-- The customer page can already take deposits, pay down credit and hand cash
-- back. Two things it could not do:
--
-- 1. Cap how much credit a customer may run up. AR invoices could be raised
--    against anyone without limit, so "credit" meant "unbounded", and the only
--    control was a person remembering.
-- 2. Record anything about the customer. Every agreement made at the counter
--    lived in somebody's head.
--
-- ── Why credit_limit is NULL and not 0 ──
--
-- NULL means "no limit set", which is exactly today's behaviour, and it is the
-- default so this migration changes nothing on deploy. 0 is a real value
-- meaning "no credit at all", which a shop can choose.
--
-- This is the mistake 074 wrote down: businesses.tax_rate had been collecting
-- typed-in numbers for a year, and keying tax off "rate > 0" would have
-- started charging every one of those shops on deploy day, with nobody
-- deciding to. A limit of 0 defaulted onto every existing customer would be
-- the same shape of error in the other direction: every credit sale in the
-- country refused the morning this ships. Absence of a limit is not a limit of
-- zero.
--
-- The check allows 0 but not negatives. A negative limit would read as
-- "already over" everywhere it is compared and has no meaning.
-- ============================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_credit_limit_non_negative'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_credit_limit_non_negative
      CHECK (credit_limit IS NULL OR credit_limit >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.customers.credit_limit IS
  'Maximum outstanding AR this customer may carry. NULL = no limit set (the default, and the behaviour before migration 075). 0 = no credit permitted.';

-- ============================================
-- customer_notes
--
-- A thread, not a text column on customers. A single column loses who wrote
-- what and when, and the first person to edit it overwrites the last one.
-- Notes here are the record of what was agreed at the counter, so they are
-- worth the same care as the audit log: append, attribute, timestamp.
--
-- author_user_id is ON DELETE SET NULL rather than CASCADE. A note does not
-- stop being true because the person who wrote it has left, and deleting a
-- departed employee should not silently rewrite the customer's history. The
-- UI renders a null author as "removed user".
-- ============================================

CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_notes IS
  'Staff notes against a customer. Append-only in practice: the API offers create, list and delete, but no update, so a note cannot be quietly reworded after the fact.';

-- The only read the app makes: newest first for one customer.
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer
  ON public.customer_notes (customer_id, created_at DESC);

-- Tenant scoping for any cross-customer query, and for the RLS predicate.
CREATE INDEX IF NOT EXISTS idx_customer_notes_business
  ON public.customer_notes (business_id, created_at DESC);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- Read: anyone in the tenant who can see customers at all. Platform admins see
-- every tenant, matching the customers table's own policy from 063.
DROP POLICY IF EXISTS "Users read own business customer notes" ON public.customer_notes;
CREATE POLICY "Users read own business customer notes"
  ON public.customer_notes FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

-- Write: service_role only, so every note goes through the API, which is what
-- stamps author_user_id and business_id from the session rather than the body.
-- The explicit policy rather than relying on BYPASSRLS follows
-- 061_webhook_deliveries_service_role_policy.sql, where inserts through the
-- live server were observed failing despite service_role having rolbypassrls.
DROP POLICY IF EXISTS "Service role writes customer notes" ON public.customer_notes;
CREATE POLICY "Service role writes customer notes"
  ON public.customer_notes FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- anon has no business reaching this table at all. 063 locked down the RPCs
-- for the same reason: the anon key ships in the browser bundle.
REVOKE ALL ON public.customer_notes FROM anon;
GRANT SELECT ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
