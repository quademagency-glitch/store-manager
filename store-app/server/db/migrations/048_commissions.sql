-- ============================================
-- Migration 048: Sales Commissions
-- commission_rules + commission_ledger
-- ============================================

-- 1. Commission Rules
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Rule',
  type TEXT NOT NULL CHECK (type IN ('flat', 'percentage')),
  value NUMERIC(12, 2) NOT NULL CHECK (value >= 0),
  min_sale_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  product_category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read commission rules in their business" ON public.commission_rules;
CREATE POLICY "Users can read commission rules in their business"
  ON public.commission_rules FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR business_id = public.get_user_business_id()
  );

DROP POLICY IF EXISTS "Admins can create commission rules" ON public.commission_rules;
CREATE POLICY "Admins can create commission rules"
  ON public.commission_rules FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

DROP POLICY IF EXISTS "Admins can update commission rules" ON public.commission_rules;
CREATE POLICY "Admins can update commission rules"
  ON public.commission_rules FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

DROP POLICY IF EXISTS "Admins can delete commission rules" ON public.commission_rules;
CREATE POLICY "Admins can delete commission rules"
  ON public.commission_rules FOR DELETE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

CREATE INDEX IF NOT EXISTS idx_commission_rules_business ON public.commission_rules(business_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON public.commission_rules(active);

-- 2. Commission Ledger
CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own commissions, managers can read all in business
DROP POLICY IF EXISTS "Users can read commissions" ON public.commission_ledger;
CREATE POLICY "Users can read commissions"
  ON public.commission_ledger FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR user_id = auth.uid()
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

-- System inserts commissions (via service role)
DROP POLICY IF EXISTS "System can insert commissions" ON public.commission_ledger;
CREATE POLICY "System can insert commissions"
  ON public.commission_ledger FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR business_id = public.get_user_business_id()
  );

-- Admins can update commissions (mark as paid)
DROP POLICY IF EXISTS "Admins can update commissions" ON public.commission_ledger;
CREATE POLICY "Admins can update commissions"
  ON public.commission_ledger FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

CREATE INDEX IF NOT EXISTS idx_commission_ledger_business ON public.commission_ledger(business_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_user ON public.commission_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_sale ON public.commission_ledger(sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_paid ON public.commission_ledger(paid_at);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_created ON public.commission_ledger(created_at DESC);
