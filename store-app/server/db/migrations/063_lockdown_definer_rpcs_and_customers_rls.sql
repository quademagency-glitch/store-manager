-- 063: Security hardening (Supabase advisor remediation)
--
-- (1) Revoke public/anon/authenticated EXECUTE on backend-only SECURITY DEFINER
--     functions. These are invoked exclusively via the service-role client
--     (supabaseAdmin) in the Express backend, never directly from the browser,
--     so exposing them on the public REST RPC surface (/rest/v1/rpc/...) let an
--     unauthenticated caller with the anon key run privileged writes. We grant
--     EXECUTE back to service_role explicitly so the backend keeps working.
--
-- (2) Replace the always-true customers RLS policies with business-scoped ones,
--     matching the pattern already used by products/sales/locations. The old
--     policies let any authenticated user read/modify customers across ALL
--     businesses (cross-tenant leak).
--
-- NOT touched: has_permission(), get_user_business_id(), is_manager(). These are
-- called inside RLS policy expressions evaluated as the `authenticated` role, so
-- authenticated MUST retain EXECUTE on them or RLS breaks app-wide.

BEGIN;

-- (1) Lock down backend-only SECURITY DEFINER functions ----------------------
-- Loop over every overload of each named function so we don't have to hardcode
-- argument signatures.
DO $$
DECLARE
  fn regprocedure;
  target_names text[] := ARRAY[
    'process_sale_transaction',
    'record_ar_payment',
    'record_ap_payment',
    'undo_import_batch',
    'apply_accounting_starter_pack',
    'seed_default_accounting_templates',
    'generate_po_number',
    'generate_ar_invoice_number',
    'generate_ap_bill_number',
    'generate_ledger_ref_number',
    'rls_auto_enable',
    'handle_new_user'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- (2) Business-scope the customers policies ----------------------------------
DROP POLICY IF EXISTS "Authenticated users can read customers"   ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

CREATE POLICY "Users can read customers in their business"
  ON public.customers FOR SELECT TO authenticated
  USING (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can insert customers in their business"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can update customers in their business"
  ON public.customers FOR UPDATE TO authenticated
  USING (has_permission('manage_platform') OR business_id = get_user_business_id())
  WITH CHECK (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can delete customers in their business"
  ON public.customers FOR DELETE TO authenticated
  USING (has_permission('manage_platform') OR business_id = get_user_business_id());

COMMIT;
