-- ============================================
-- Migration 021: Returns & Reversals
-- Store Management App — Phase 6
-- ============================================

-- 1. Update sales table with return_status
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT 'none' CHECK (return_status IN ('none', 'partial', 'full'));

-- 2. Create returns table
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  location_id UUID REFERENCES public.locations(id),
  original_sale_id UUID NOT NULL REFERENCES public.sales(id),
  customer_id UUID REFERENCES public.customers(id),
  processed_by UUID NOT NULL REFERENCES public.users(id),
  total_refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_refund_amount >= 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create return_items table
CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES public.sale_items(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
  returned_unit_ids UUID[] -- array of physical unit IDs returned
);

-- 4. Enable RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies - returns
DROP POLICY IF EXISTS "Admins can read returns" ON public.returns;
CREATE POLICY "Admins can read returns"
  ON public.returns FOR SELECT TO authenticated
  USING (public.has_permission('manage_business') OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Admins can insert returns" ON public.returns;
CREATE POLICY "Admins can insert returns"
  ON public.returns FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_business') OR public.has_permission('manage_platform'));

-- 6. RLS Policies - return_items
DROP POLICY IF EXISTS "Admins can read return_items" ON public.return_items;
CREATE POLICY "Admins can read return_items"
  ON public.return_items FOR SELECT TO authenticated
  USING (public.has_permission('manage_business') OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Admins can insert return_items" ON public.return_items;
CREATE POLICY "Admins can insert return_items"
  ON public.return_items FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_business') OR public.has_permission('manage_platform'));

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_returns_business ON public.returns(business_id);
CREATE INDEX IF NOT EXISTS idx_returns_original_sale ON public.returns(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.return_items(return_id);
