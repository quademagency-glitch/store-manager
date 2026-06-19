-- ============================================
-- Migration 049: Loyalty, Gift Cards & Store Credit
-- ============================================

-- 1. Loyalty Rules
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  points_per_currency_unit NUMERIC(10, 2) NOT NULL DEFAULT 1,
  min_points_to_redeem INTEGER NOT NULL DEFAULT 100,
  point_value NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read loyalty rules in their business" ON public.loyalty_rules;
CREATE POLICY "Users can read loyalty rules in their business"
  ON public.loyalty_rules FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Admins can manage loyalty rules" ON public.loyalty_rules;
CREATE POLICY "Admins can manage loyalty rules"
  ON public.loyalty_rules FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business')));

-- 2. Loyalty Ledger
CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read loyalty ledger in their business" ON public.loyalty_ledger;
CREATE POLICY "Users can read loyalty ledger in their business"
  ON public.loyalty_ledger FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Staff can insert loyalty entries" ON public.loyalty_ledger;
CREATE POLICY "Staff can insert loyalty entries"
  ON public.loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON public.loyalty_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_business ON public.loyalty_ledger(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_created ON public.loyalty_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_type ON public.loyalty_ledger(type);

-- 3. Gift Cards
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  initial_balance NUMERIC(12, 2) NOT NULL CHECK (initial_balance > 0),
  current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  issued_to_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read gift cards in their business" ON public.gift_cards;
CREATE POLICY "Users can read gift cards in their business"
  ON public.gift_cards FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Admins can manage gift cards" ON public.gift_cards;
CREATE POLICY "Admins can manage gift cards"
  ON public.gift_cards FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_business')));

CREATE INDEX IF NOT EXISTS idx_gift_cards_business ON public.gift_cards(business_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON public.gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_customer ON public.gift_cards(issued_to_customer_id);

-- 4. Store Credit Ledger
CREATE TABLE IF NOT EXISTS public.store_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('issue', 'redeem', 'refund')),
  amount NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read store credit in their business" ON public.store_credit_ledger;
CREATE POLICY "Users can read store credit in their business"
  ON public.store_credit_ledger FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Staff can insert store credit entries" ON public.store_credit_ledger;
CREATE POLICY "Staff can insert store credit entries"
  ON public.store_credit_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_store_credit_customer ON public.store_credit_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_business ON public.store_credit_ledger(business_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_created ON public.store_credit_ledger(created_at DESC);
