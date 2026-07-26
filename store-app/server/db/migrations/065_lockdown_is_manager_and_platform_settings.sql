-- 065: Security hardening pt.3 (Supabase advisor remediation, final pass)
--
-- (1) is_manager() is a SECURITY DEFINER function exposed on the public RPC
--     surface but referenced by ZERO policies, function bodies, views, or app
--     code (verified). Revoke public/anon/authenticated EXECUTE; keep it for
--     service_role only so it stops appearing on /rest/v1/rpc.
--
-- (2) platform_settings had RLS enabled but no policy (default-deny). The app
--     only reads it server-side via the service role, so add an explicit
--     platform-admin policy to document intent and clear the advisor INFO.
--
-- Left as-is (intentional): has_permission() and get_user_business_id() remain
-- executable by authenticated because RLS policies call them. The *_number_sequences
-- tables remain default-deny (RLS on, no policy) — they are internal bookkeeping
-- touched only by SECURITY DEFINER functions / the service role.

BEGIN;

-- (1) Lock down the unused is_manager() -------------------------------------
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_manager'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- (2) Explicit platform-admin policy for platform_settings ------------------
DROP POLICY IF EXISTS "Platform admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Platform admins can manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (has_permission('manage_platform'))
  WITH CHECK (has_permission('manage_platform'));

COMMIT;
