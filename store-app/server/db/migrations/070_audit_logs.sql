-- ============================================
-- Migration 070: Security audit trail
--
-- There is currently no way to answer "who changed this, and when". The
-- closest things that exist are all domain-specific — inventory_audits (018)
-- records physical stock counts, 034 logs price edits, webhook_deliveries (060)
-- tracks outbound calls, admin_actions (009) covers platform-admin operations
-- only. None of them capture the events that matter when an account is
-- compromised or a tenant disputes a change: who logged in, who was granted
-- which role, who was banned, who exported the data.
--
-- Scope is deliberately narrow. This table records SECURITY and ADMINISTRATIVE
-- events, not business activity. Sales, stock movements and price changes
-- already have purpose-built tables, and duplicating them here is exactly what
-- would turn this into the largest and least useful object in the database.
--
-- THREE SCHEMA DECISIONS WORTH THE EXPLANATION:
--
-- 1. actor_user_id is ON DELETE SET NULL, and actor_email/actor_role are
--    denormalised copies. routes/users.js hard-deletes users. An audit row must
--    outlive the person it describes — otherwise deleting a user erases the
--    record of what they did, and "delete the user" becomes a way to cover
--    your tracks. The denormalised columns preserve who it was after the FK
--    goes null.
--
-- 2. business_id is ON DELETE CASCADE, matching 060. Deleting a tenant should
--    take its audit trail with it — that is also what a data-deletion request
--    requires. The trade is explicit: you lose the trail for deleted tenants.
--
-- 3. BIGSERIAL rather than UUID. This will be the highest-insert-rate table
--    here, and a monotonically increasing key keeps the primary-key index
--    append-only instead of scattering random writes across the B-tree.
--
-- WRITES ARE SERVICE-ROLE ONLY. There is deliberately no INSERT, UPDATE or
-- DELETE policy for authenticated users — the table is append-only from the
-- application's perspective and nothing in the product should be able to edit
-- or remove a row. Reads are limited to a business's own log.
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  business_id   UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email   TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    INET,
  user_agent    TEXT,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS
  'Append-only trail of security and administrative events (auth, user/role changes, business status, billing config, data export/import). NOT for business activity — sales, stock and price changes have their own tables.';
COMMENT ON COLUMN public.audit_logs.business_id IS
  'Tenant the event belongs to. NULL for platform-level events with no tenant, and for failed logins where the account could not be resolved.';
COMMENT ON COLUMN public.audit_logs.actor_user_id IS
  'Who did it. SET NULL on user deletion so the row outlives the actor — actor_email/actor_role retain the identity.';
COMMENT ON COLUMN public.audit_logs.actor_email IS
  'Denormalised copy of the actor email at the time of the event, so the record survives deletion of the user row.';
COMMENT ON COLUMN public.audit_logs.actor_role IS
  'Denormalised copy of the actor role name at the time of the event. Roles get renamed and reassigned; this captures what they held then.';
COMMENT ON COLUMN public.audit_logs.action IS
  'Verb in dot notation, e.g. auth.login, user.role_changed, business.status_changed. See utils/auditLog.js AUDIT_ACTIONS for the canonical list.';
COMMENT ON COLUMN public.audit_logs.resource_type IS
  'Type of thing acted on: user, role, business, subscription, api_key, import, export.';
COMMENT ON COLUMN public.audit_logs.resource_id IS
  'Identifier of the affected resource. TEXT, not UUID — invoice numbers, Paystack references and slugs all appear here.';
COMMENT ON COLUMN public.audit_logs.metadata IS
  'Event-specific detail. Passed through a redactor (utils/auditLog.js) that strips passwords, PINs, tokens and gateway secrets before write.';
COMMENT ON COLUMN public.audit_logs.ip_address IS
  'Client IP as resolved by Express. Only trustworthy because trust proxy is set to a hop count rather than true — see index.js.';
COMMENT ON COLUMN public.audit_logs.request_id IS
  'Correlates with the reqId in the Pino access log and the request_id tag on Sentry events.';

-- Business log, newest first — the viewer's default query.
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_time
  ON public.audit_logs (business_id, created_at DESC);

-- Same, filtered by action ("show me every role change").
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_action
  ON public.audit_logs (business_id, action, created_at DESC);

-- "What did this person do" — the question asked during an incident.
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_user_id, created_at DESC);

-- "What happened to this record".
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON public.audit_logs (resource_type, resource_id);

-- Supports the retention sweep.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: a business admin sees their own tenant's log; platform admins see all.
DROP POLICY IF EXISTS "Business admins can read own audit log" ON public.audit_logs;
CREATE POLICY "Business admins can read own audit log"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
    OR public.has_permission('manage_platform')
  );

-- Write: service_role only. No authenticated INSERT/UPDATE/DELETE policy
-- exists, by design — an audit trail the audited party can edit is not one.
-- The explicit service_role policy rather than relying on BYPASSRLS follows
-- 061_webhook_deliveries_service_role_policy.sql, where inserts through the
-- live server were observed failing despite service_role having rolbypassrls.
DROP POLICY IF EXISTS "Service role can write audit logs" ON public.audit_logs;
CREATE POLICY "Service role can write audit logs"
  ON public.audit_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
