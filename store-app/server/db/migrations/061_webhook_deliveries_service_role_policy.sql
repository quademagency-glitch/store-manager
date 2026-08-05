-- ============================================
-- Migration 061: Explicit service_role write policy for webhook_deliveries
--
-- webhook_deliveries relies on supabaseAdmin (service_role) to insert/update
-- delivery rows — by design there's no authenticated-role INSERT/UPDATE
-- policy (see 060_ecommerce_integrations.sql). service_role has rolbypassrls
-- at the Postgres role level (confirmed via pg_roles), which should make RLS
-- irrelevant for it — but in practice, inserts through the live server were
-- observed failing with "new row violates row-level security policy" while
-- an isolated one-off script against the same table/key succeeded. Root
-- cause wasn't conclusively pinned down (suspected connection-pooler/session
-- role-switching quirk), so this adds an explicit service_role policy as a
-- direct, defense-in-depth fix rather than depending solely on implicit
-- BYPASSRLS behavior for this table.
-- ============================================

DROP POLICY IF EXISTS "Service role can write webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Service role can write webhook deliveries"
  ON public.webhook_deliveries FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
