-- ============================================
-- Migration 104: make the migration set reproduce production
--
-- `npm run db:drift -- --definitions` (2026-10-08, against Postgres 17) found
-- production holding objects no file in this repo creates, from 027 and
-- 063-065, which were applied by hand and never committed; and two files
-- (059, 062) recorded by the 2026-08-06 baseline that never ran. 062 was
-- re-applied by 096. Worse, a rebuild from these files came out LESS secure
-- than production: 072, which reasserts 063's hardening, aborts on a fresh
-- database because the customer policies it checks for come from 063.
--
-- Every statement here is a no-op on production apart from the two removals
-- in section 1. On a fresh database it produces what production has.
-- ============================================

-- ── 1. Leftovers nothing uses ───────────────────────────────────────────────
-- debug_whoami() returned the caller's role and JWT claims and was executable
-- by anon. promotions is read by no code in the app or the API, yet any
-- signed-in user of any business could list every active promotion code.

DROP FUNCTION IF EXISTS public.debug_whoami();
-- is_manager() read a users.role column no code sets; nothing calls it.
DROP FUNCTION IF EXISTS public.is_manager();

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active promotions" ON public.promotions;
DROP POLICY IF EXISTS "Platform admins can manage promotions" ON public.promotions;
REVOKE ALL ON public.promotions FROM anon, authenticated;
GRANT ALL ON public.promotions TO service_role;

-- ── 2. Columns production has ───────────────────────────────────────────────

-- The customer verification expiry the code reads (087, routes/customers.js).
-- 059 added a differently named column that never reached production.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
ALTER TABLE public.customers DROP COLUMN IF EXISTS verification_code_expires_at;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS setup_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS compare_at_price_monthly NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS compare_at_price_yearly NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS trial_days_monthly INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days_yearly INTEGER NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_id_unique' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_unique UNIQUE (id);
  END IF;
END $$;

-- ── 3. The security posture 063 set and 072 reasserts ───────────────────────

-- Customers scoped to the caller's business, never "any authenticated user".
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Users can read customers in their business" ON public.customers;
DROP POLICY IF EXISTS "Users can insert customers in their business" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers in their business" ON public.customers;
DROP POLICY IF EXISTS "Users can delete customers in their business" ON public.customers;
CREATE POLICY "Users can read customers in their business" ON public.customers FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());
CREATE POLICY "Users can insert customers in their business" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());
CREATE POLICY "Users can update customers in their business" ON public.customers FOR UPDATE TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id())
  WITH CHECK (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());
CREATE POLICY "Users can delete customers in their business" ON public.customers FOR DELETE TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Platform admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Platform admins can manage platform settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_permission('manage_platform')) WITH CHECK (public.has_permission('manage_platform'));

ALTER TABLE public.ap_bill_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_ref_number_sequences ENABLE ROW LEVEL SECURITY;

-- Backend-only functions: the API calls them with the service role; a browser
-- never should. Same list and method as 072.
DO $$
DECLARE
  target_name TEXT;
  sig TEXT;
BEGIN
  FOREACH target_name IN ARRAY ARRAY[
    'process_sale_transaction', 'record_ar_payment', 'record_ap_payment', 'undo_import_batch',
    'seed_default_accounting_templates', 'handle_new_user', 'apply_accounting_starter_pack',
    'generate_po_number', 'generate_ar_invoice_number', 'generate_ap_bill_number', 'generate_ledger_ref_number'
  ] LOOP
    FOR sig IN
      SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = target_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
  END LOOP;
END $$;

-- The runner's own bookkeeping, created by db/migrate.js before any migration.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.schema_migrations FROM anon, authenticated';
  END IF;
END $$;
