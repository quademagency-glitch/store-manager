-- ============================================
-- Migration 060: Ecommerce Storefront Integrations
-- API keys for external storefronts to read catalog/stock/price and
-- create orders; webhook endpoints + delivery log for ERP -> storefront
-- push notifications on order status changes.
-- ============================================

-- customers.phone (NOT NULL, UNIQUE per business, see 016_customers_and_permissions.sql)
-- remains the primary identity for order matching/dedup — storefront orders
-- are upserted by (business_id, phone), same as every other customer-creation
-- flow in this app. email is purely supplementary contact info, not unique,
-- not used for matching.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;

-- ─── API keys ───
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_business ON public.api_keys(business_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON public.api_keys(status);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business can read own API keys" ON public.api_keys;
CREATE POLICY "Business can read own API keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Business can manage own API keys" ON public.api_keys;
CREATE POLICY "Business can manage own API keys"
  ON public.api_keys FOR ALL TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_integrations'))
  )
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_integrations'))
  );

-- ─── Webhook endpoints ───
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{order.status_changed}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_business ON public.webhook_endpoints(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_status ON public.webhook_endpoints(status);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business can read own webhook endpoints" ON public.webhook_endpoints;
CREATE POLICY "Business can read own webhook endpoints"
  ON public.webhook_endpoints FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Business can manage own webhook endpoints" ON public.webhook_endpoints;
CREATE POLICY "Business can manage own webhook endpoints"
  ON public.webhook_endpoints FOR ALL TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_integrations'))
  )
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_integrations'))
  );

-- ─── Webhook delivery log (audit + retry tracking) ───
-- Written exclusively by the Express server via supabaseAdmin (service role,
-- bypasses RLS) — same pattern as import_batches. No authenticated-role
-- INSERT/UPDATE policy; read-only for business admins.
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  webhook_endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_business ON public.webhook_deliveries(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries(webhook_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON public.webhook_deliveries(next_retry_at) WHERE status = 'pending';

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business can read own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Business can read own webhook deliveries"
  ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

-- ─── Backfill manage_integrations permission onto built-in roles ───
-- Same precedent as migration 024 (view_till_balance) and 042 (manage_financials).
-- permissionCheck.js (app layer) already bypasses for Platform Admin/Business
-- Admin by role name, but the RLS has_permission() function does a literal
-- array-containment check with no role-name special case, so the array
-- itself needs the string for RLS-backed access to stay consistent.
UPDATE public.roles
SET permissions = array_append(permissions, 'manage_integrations')
WHERE name = 'Platform Admin' AND NOT ('manage_integrations' = ANY(permissions));

UPDATE public.roles
SET permissions = array_append(permissions, 'manage_integrations')
WHERE name = 'Business Admin' AND NOT ('manage_integrations' = ANY(permissions));
