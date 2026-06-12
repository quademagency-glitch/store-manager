-- ============================================
-- Migration 035: Customer Orders (CRM)
-- Tracks special/custom orders placed by customers
-- for out-of-stock or bespoke items.
-- Fully idempotent — safe to re-run.
-- ============================================

-- ─── 1. Customer Orders table ───
CREATE TABLE IF NOT EXISTS public.customer_orders (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_number   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'confirmed', 'sourcing', 'ready', 'fulfilled', 'cancelled')),
  notes          TEXT,
  deposit_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deposit_paid   BOOLEAN NOT NULL DEFAULT false,
  total_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  due_date       DATE,
  fulfilled_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (business_id, order_number)
);

-- ─── 2. Customer Order Items table ───
CREATE TABLE IF NOT EXISTS public.customer_order_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_order_id   UUID NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
  custom_description  TEXT,   -- for non-catalog / bespoke items
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price          DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT item_must_have_product_or_description
    CHECK (product_id IS NOT NULL OR custom_description IS NOT NULL)
);

-- ─── 3. Row Level Security ───
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_tenant_isolation" ON public.customer_orders;
CREATE POLICY "co_tenant_isolation" ON public.customer_orders
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "co_items_tenant_isolation" ON public.customer_order_items;
CREATE POLICY "co_items_tenant_isolation" ON public.customer_order_items
  FOR ALL
  USING (customer_order_id IN (
    SELECT id FROM public.customer_orders
    WHERE business_id IN (
      SELECT business_id FROM public.users WHERE id = auth.uid()
    )
  ));

-- ─── 4. Indexes ───
CREATE INDEX IF NOT EXISTS idx_co_business      ON public.customer_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_co_customer      ON public.customer_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_co_status        ON public.customer_orders(status);
CREATE INDEX IF NOT EXISTS idx_co_created       ON public.customer_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_items_order   ON public.customer_order_items(customer_order_id);
CREATE INDEX IF NOT EXISTS idx_co_items_product ON public.customer_order_items(product_id);
