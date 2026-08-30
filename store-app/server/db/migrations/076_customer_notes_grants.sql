-- ============================================
-- Migration 076: narrow the customer_notes grants to what 075 said
--
-- 075 declared "Write: service_role only" and wrote:
--
--   REVOKE ALL ON public.customer_notes FROM anon;
--   GRANT SELECT ON public.customer_notes TO authenticated;
--   GRANT ALL    ON public.customer_notes TO service_role;
--
-- The REVOKE for anon was right. The GRANT for authenticated was additive, and
-- additive was not enough: Supabase ships
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated`,
-- so a newly created table already carries INSERT, UPDATE and DELETE for
-- `authenticated` before any GRANT in the migration runs. Granting SELECT on
-- top of ALL changes nothing.
--
-- Verified on production after 075 applied:
--   has_table_privilege('authenticated','public.customer_notes','INSERT') = true
--
-- Nothing was exploitable. RLS is enabled and the only policy naming
-- `authenticated` is FOR SELECT, so an insert from a browser session is
-- refused for want of a permissive policy. This is the second lock, not the
-- first: a future migration adding a broad INSERT policy, or anyone disabling
-- RLS for a moment to debug, should not silently open a table the design says
-- is service-role-only. That is the argument 063 and 072 already made about
-- the anon-executable RPCs.
--
-- REVOKE then GRANT, in that order, because REVOKE ALL takes SELECT away too.
-- ============================================

REVOKE ALL ON public.customer_notes FROM authenticated;
GRANT SELECT ON public.customer_notes TO authenticated;

-- Re-asserted rather than assumed: 072 exists because hardening that was
-- applied once had drifted back.
REVOKE ALL ON public.customer_notes FROM anon;
GRANT ALL ON public.customer_notes TO service_role;

DO $verify$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(priv, ', ') INTO bad
  FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS priv
  WHERE has_table_privilege('authenticated', 'public.customer_notes', priv);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'customer_notes still grants % to authenticated', bad;
  END IF;

  IF has_table_privilege('anon', 'public.customer_notes', 'SELECT') THEN
    RAISE EXCEPTION 'customer_notes is readable by anon';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.customer_notes', 'SELECT') THEN
    RAISE EXCEPTION 'customer_notes is no longer readable by authenticated; the notes tab would be empty';
  END IF;
END
$verify$;
