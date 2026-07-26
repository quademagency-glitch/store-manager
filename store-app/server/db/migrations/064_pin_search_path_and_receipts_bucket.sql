-- 064: Security hardening pt.2 (Supabase advisor remediation)
--
-- (1) Pin search_path on every public plpgsql/sql function that lacks one.
--     A mutable search_path lets a caller (esp. for SECURITY DEFINER functions)
--     shadow referenced objects via an attacker-controlled schema. We set it to
--     `public, pg_temp` rather than `''` because some bodies (e.g.
--     process_sale_transaction) reference public tables UNqualified — `''`
--     would break them, `public, pg_temp` is behavior-preserving. pg_temp is
--     last so it can't shadow public objects.
--     Helper functions already pinned (has_permission, get_user_business_id,
--     is_manager, rls_auto_enable) are skipped automatically by the WHERE clause.
--
-- (2) Drop the broad authenticated SELECT policy on the public `receipts`
--     storage bucket. Public buckets serve objects via public URL without a
--     SELECT policy, and the server reads receipts with the service role. The
--     policy only enabled cross-business listing of every file. The upload
--     (INSERT) policy is intentionally kept.

BEGIN;

-- (1) Pin search_path on unpinned public functions ---------------------------
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND l.lanname IN ('plpgsql','sql')
      AND (p.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', fn);
  END LOOP;
END $$;

-- (2) Remove broad receipts listing policy -----------------------------------
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;

COMMIT;
