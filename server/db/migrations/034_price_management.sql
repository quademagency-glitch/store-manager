-- ============================================
-- Migration 034: Price Management
-- Adds cost_price to products, price change audit log.
-- Fully idempotent — safe to re-run.
-- ============================================

-- ─── 1. Add cost_price to products ───
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0.00;

COMMENT ON COLUMN public.products.cost_price IS 'Cost/purchase price for margin calculation. Selling price remains in the price column.';

-- ─── 2. Price change audit log ───
CREATE TABLE IF NOT EXISTS public.price_change_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_price DECIMAL(10, 2) NOT NULL,
  new_price DECIMAL(10, 2) NOT NULL,
  old_cost_price DECIMAL(10, 2),
  new_cost_price DECIMAL(10, 2),
  change_type TEXT NOT NULL CHECK (change_type IN ('markup_percent', 'markdown_percent', 'fixed_amount', 'set_price', 'manual')),
  change_value DECIMAL(10, 2),
  batch_id UUID,
  reason TEXT,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_log_tenant_isolation" ON public.price_change_log;
CREATE POLICY "price_log_tenant_isolation" ON public.price_change_log
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

-- ─── 3. Indexes ───
CREATE INDEX IF NOT EXISTS idx_price_log_business ON public.price_change_log(business_id);
CREATE INDEX IF NOT EXISTS idx_price_log_product ON public.price_change_log(product_id);
CREATE INDEX IF NOT EXISTS idx_price_log_batch ON public.price_change_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_price_log_created ON public.price_change_log(created_at DESC);
