-- ============================================
-- Migration 072: reassert the security hardening that exists only in production
--
-- WHY THIS EXISTS, AND WHY THE NUMBERING SKIPS 063-065
--
-- On 2026-07-26 two rounds of security hardening were applied directly to the
-- production database in response to Supabase security advisors. They were
-- never written to files and never recorded in schema_migrations. The repo
-- therefore jumps 062 -> 066, and the applied-migration list this database
-- reports has the same hole.
--
-- That was found by rehearsing a restore, which is the only way it could have
-- been found. The consequence was severe and entirely silent: the documented
-- recovery procedure is "apply migrations up to the version in the snapshot
-- manifest, then load the data". Following it faithfully would have rebuilt the
-- database WITHOUT any of this hardening — meaning a recovered production
-- system in which:
--
--   * process_sale_transaction, record_ar_payment, record_ap_payment and
--     undo_import_batch are SECURITY DEFINER and executable by `anon`. The
--     anon key ships in the browser bundle, so anyone at all could have
--     processed sales, recorded payments against any business, or reversed an
--     import — bypassing the API and every permission check in it.
--   * the four `customers` RLS policies are back to always-true, exposing
--     every tenant's customer list to every other tenant.
--   * function search_paths are unpinned, which is a privilege-escalation
--     route for SECURITY DEFINER functions.
--
-- A disaster recovery procedure that quietly reintroduces those is worse than
-- no procedure, because it is followed under pressure and trusted.
--
-- WHY A NEW MIGRATION RATHER THAN BACKFILLED 063/064 FILES
--
-- What matters is that applying every migration in this directory to an empty
-- database produces a correctly hardened one. Reconstructing two historical
-- files from a memory of what they contained would put invented SQL and false
-- timestamps into the permanent record, and would still leave the numbering
-- hole. Asserting the desired end state, once, in a file that says plainly
-- what happened, is both truthful and reproducible.
--
-- This migration is a NO-OP against the current production database. It was
-- written by reading that database's live state, not from the changelog, and
-- every statement is idempotent so it is safe to apply anywhere, repeatedly.
--
-- SCOPE: reproducibility, not new hardening. This deliberately changes nothing
-- about the current security posture. Tightening something here would hide a
-- behavioural change inside a bookkeeping fix, and the next person to read it
-- would have no way to tell which statements were which.
-- ============================================

-- ── 1. Backend-only routines must not be callable with the public anon key ──
--
-- Every one of these is invoked exclusively through the service-role client in
-- the Express API; the browser makes no .rpc() calls at all. REVOKE FROM PUBLIC
-- is the load-bearing statement — Postgres grants EXECUTE to PUBLIC on every
-- new function by default, so revoking only from anon and authenticated would
-- leave the grant intact through PUBLIC role membership.

DO $$
DECLARE
  target_name TEXT;
  sig         TEXT;
  backend_only TEXT[] := ARRAY[
    -- SECURITY DEFINER: these run with the owner's rights, so an anon EXECUTE
    -- grant on one is a complete bypass of RLS rather than merely an extra call.
    'process_sale_transaction',
    'record_ar_payment',
    'record_ap_payment',
    'undo_import_batch',
    'seed_default_accounting_templates',
    'handle_new_user',
    'rls_auto_enable',
    'is_manager',
    -- Not SECURITY DEFINER, but backend-only and sequence-advancing: letting a
    -- client burn invoice/PO numbers creates gaps in a business's books.
    'apply_accounting_starter_pack',
    'generate_po_number',
    'generate_ar_invoice_number',
    'generate_ap_bill_number',
    'generate_ledger_ref_number'
  ];
BEGIN
  FOREACH target_name IN ARRAY backend_only LOOP
    -- Resolve every overload: a bare name is not unique in Postgres, and
    -- REVOKE needs the full signature. A distinct variable from the outer loop
    -- because reusing one would overwrite the name still being iterated.
    FOR sig IN
      SELECT format('%I.%I(%s)', n.nspname, p.proname,
                    pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = target_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
  END LOOP;
END $$;

-- ── 2. The two helpers that MUST stay callable ──────────────────────────────
--
-- has_permission() and get_user_business_id() are evaluated INSIDE the RLS
-- policies below, as the authenticated role. Revoking EXECUTE on them does not
-- harden anything — it breaks row-level security across the entire schema,
-- because every policy that calls them starts erroring. They are SECURITY
-- DEFINER precisely so they can read the users table that the policy is
-- protecting. Left explicit here so that a future sweep of "anon can execute
-- these" advisor warnings does not quietly remove them.

DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('has_permission', 'get_user_business_id')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', fn);
  END LOOP;
END $$;

-- ── 3. Pin search_path on every SECURITY DEFINER function ───────────────────
--
-- An unpinned SECURITY DEFINER function resolves unqualified names against the
-- caller's search_path, so a caller who can create objects in a schema earlier
-- on that path can shadow a table or operator and have the function execute
-- their definition with the owner's privileges.
--
-- `public, pg_temp` rather than the stricter `''`: these bodies reference
-- public tables unqualified, and an empty search_path breaks them at runtime
-- rather than at deploy time. pg_temp is listed last deliberately — leaving it
-- unlisted lets Postgres search it FIRST, which is the shadowing hole this
-- statement closes.
--
-- Skips any function that already pins one, so the deliberately different
-- settings live in production (is_manager uses '', rls_auto_enable uses
-- pg_catalog, the two RLS helpers use public) are preserved rather than
-- flattened.

DO $$
DECLARE fn TEXT;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END LOOP;
END $$;

-- ── 4. Business-scope the customers RLS policies ────────────────────────────
--
-- These were created always-true (USING (true)), which on a multi-tenant table
-- means every signed-in user of every business could read, edit and delete
-- every other business's customer list through the REST endpoint. Scoped to
-- match the pattern already used by products, sales and locations.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read customers in their business"   ON public.customers;
DROP POLICY IF EXISTS "Users can insert customers in their business" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers in their business" ON public.customers;
DROP POLICY IF EXISTS "Users can delete customers in their business" ON public.customers;

CREATE POLICY "Users can read customers in their business"
  ON public.customers FOR SELECT TO authenticated
  USING (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can insert customers in their business"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can update customers in their business"
  ON public.customers FOR UPDATE TO authenticated
  USING      (has_permission('manage_platform') OR business_id = get_user_business_id())
  WITH CHECK (has_permission('manage_platform') OR business_id = get_user_business_id());

CREATE POLICY "Users can delete customers in their business"
  ON public.customers FOR DELETE TO authenticated
  USING (has_permission('manage_platform') OR business_id = get_user_business_id());

-- ── 5. Drop the broad read policy on the receipts bucket ────────────────────
--
-- The bucket is public (receipt images are served by URL) and the API reads it
-- with the service role, so a blanket authenticated-SELECT policy granted
-- reach across every business's uploads for nothing in return. The upload
-- policy is kept. Named exactly as it was created; harmless if already gone.

DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;

-- ── 6. Verify, and refuse to apply if the result is wrong ───────────────────
--
-- A hardening migration that silently half-applies is the failure mode this
-- whole file exists because of. This aborts the transaction rather than
-- reporting success over a database that is still exposed.

DO $$
DECLARE
  leaked TEXT[];
  unscoped INT;
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname) INTO leaked
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('process_sale_transaction','record_ar_payment','record_ap_payment',
                      'undo_import_batch','seed_default_accounting_templates',
                      'handle_new_user','rls_auto_enable','apply_accounting_starter_pack')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still execute privileged routines: %', array_to_string(leaked, ', ');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.has_permission(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'has_permission is not executable by authenticated — RLS is broken app-wide';
  END IF;

  SELECT count(*) INTO unscoped FROM pg_policies
  WHERE schemaname='public' AND tablename='customers'
    AND COALESCE(qual::text, with_check::text) NOT LIKE '%get_user_business_id%';

  IF unscoped > 0 THEN
    RAISE EXCEPTION 'customers still has % unscoped RLS polic(ies)', unscoped;
  END IF;
END $$;
