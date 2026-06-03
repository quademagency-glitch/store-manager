-- ============================================
-- Migration 015: Subscriptions, Billing & Payment Gateways
-- Store Management App — SaaS Monetization Layer
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. Platform Plans
-- ============================================
CREATE TABLE IF NOT EXISTS public.platform_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'GHS',
  max_users INT NOT NULL DEFAULT -1,        -- -1 = unlimited
  max_locations INT NOT NULL DEFAULT 1,
  max_products INT NOT NULL DEFAULT -1,     -- -1 = unlimited
  features JSONB DEFAULT '{}',
  trial_days INT NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active plans" ON public.platform_plans;
CREATE POLICY "Anyone can read active plans"
  ON public.platform_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can insert plans" ON public.platform_plans;
CREATE POLICY "Platform admins can insert plans"
  ON public.platform_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can update plans" ON public.platform_plans;
CREATE POLICY "Platform admins can update plans"
  ON public.platform_plans
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can delete plans" ON public.platform_plans;
CREATE POLICY "Platform admins can delete plans"
  ON public.platform_plans
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_platform'));

CREATE INDEX IF NOT EXISTS idx_platform_plans_active ON public.platform_plans(is_active, sort_order);


-- ============================================
-- 2. Payment Gateways
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'stripe')),
  display_name TEXT NOT NULL,
  public_key TEXT,
  secret_key TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  supported_currencies TEXT[] DEFAULT ARRAY['GHS'],
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read gateways" ON public.payment_gateways;
CREATE POLICY "Platform admins can read gateways"
  ON public.payment_gateways
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can insert gateways" ON public.payment_gateways;
CREATE POLICY "Platform admins can insert gateways"
  ON public.payment_gateways
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can update gateways" ON public.payment_gateways;
CREATE POLICY "Platform admins can update gateways"
  ON public.payment_gateways
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can delete gateways" ON public.payment_gateways;
CREATE POLICY "Platform admins can delete gateways"
  ON public.payment_gateways
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_platform'));


-- ============================================
-- 3. Business Subscriptions
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.platform_plans(id),
  gateway_id UUID REFERENCES public.payment_gateways(id),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('active', 'trialing', 'past_due', 'expired', 'cancelled')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  trial_ends_at TIMESTAMPTZ,
  paystack_subscription_code TEXT,
  paystack_customer_code TEXT,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'GHS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each business can only have one active subscription
  CONSTRAINT unique_active_business_subscription UNIQUE (business_id)
);

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can manage all subscriptions" ON public.business_subscriptions;
CREATE POLICY "Platform admins can manage all subscriptions"
  ON public.business_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Business admins can read own subscription" ON public.business_subscriptions;
CREATE POLICY "Business admins can read own subscription"
  ON public.business_subscriptions
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business ON public.business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status ON public.business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_period_end ON public.business_subscriptions(current_period_end);


-- ============================================
-- 4. Billing Invoices
-- ============================================

-- Sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL DEFAULT ('INV-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 5, '0')),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.business_subscriptions(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'failed', 'refunded')),
  payment_method TEXT,
  paystack_reference TEXT,
  description TEXT,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  emailed_to TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can manage all invoices" ON public.billing_invoices;
CREATE POLICY "Platform admins can manage all invoices"
  ON public.billing_invoices
  FOR ALL
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Business users can read own invoices" ON public.billing_invoices;
CREATE POLICY "Business users can read own invoices"
  ON public.billing_invoices
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_billing_invoices_business ON public.billing_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created ON public.billing_invoices(created_at DESC);


-- ============================================
-- 5. Update businesses table
-- ============================================
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES public.platform_plans(id);


-- ============================================
-- 6. Seed: Create a default Free plan
-- ============================================
INSERT INTO public.platform_plans (name, description, price_monthly, price_yearly, currency, max_users, max_locations, max_products, features, trial_days, sort_order)
VALUES (
  'Free',
  'Get started with basic features. Perfect for small shops.',
  0.00,
  0.00,
  'GHS',
  2,
  1,
  50,
  '{"analytics": false, "multi_location": false, "priority_support": false, "api_access": false}',
  0,
  0
)
ON CONFLICT (name) DO NOTHING;
