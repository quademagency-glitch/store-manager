-- ============================================
-- Migration 011: Multi-Location Refactor
-- Store Management App — Inventory Isolation
-- ============================================

-- 1. Add location_id to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);

-- 2. Add location_id to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);

-- 3. Add location_id to stock_movements
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);

-- 4. Create product_inventory table
CREATE TABLE IF NOT EXISTS public.product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, location_id)
);

-- Enable RLS on product_inventory
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;

-- 5. Data Migration: Move existing stock from products to product_inventory
DO $$ 
DECLARE
  p_record RECORD;
  l_record RECORD;
BEGIN
  -- For each product, assign its stock to the first location found for that business
  FOR p_record IN SELECT id, business_id, stock_quantity, low_stock_threshold FROM public.products LOOP
    SELECT id INTO l_record FROM public.locations WHERE business_id = p_record.business_id LIMIT 1;
    
    IF l_record.id IS NOT NULL THEN
      INSERT INTO public.product_inventory (product_id, location_id, quantity, low_stock_threshold)
      VALUES (p_record.id, l_record.id, p_record.stock_quantity, p_record.low_stock_threshold)
      ON CONFLICT (product_id, location_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 6. Drop stock_quantity and low_stock_threshold from products
ALTER TABLE public.products DROP COLUMN IF EXISTS stock_quantity;
ALTER TABLE public.products DROP COLUMN IF EXISTS low_stock_threshold;

-- 7. Update RLS Policies

-- Product Inventory RLS
DROP POLICY IF EXISTS "Users can read product inventory in their business" ON public.product_inventory;
CREATE POLICY "Users can read product inventory in their business"
  ON public.product_inventory
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    location_id IN (SELECT id FROM public.locations WHERE business_id = public.get_user_business_id())
  );

DROP POLICY IF EXISTS "Managers can manage product inventory in their business" ON public.product_inventory;
CREATE POLICY "Managers can manage product inventory in their business"
  ON public.product_inventory
  FOR ALL
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (location_id IN (SELECT id FROM public.locations WHERE business_id = public.get_user_business_id()) AND public.has_permission('manage_inventory'))
  )
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (location_id IN (SELECT id FROM public.locations WHERE business_id = public.get_user_business_id()) AND public.has_permission('manage_inventory'))
  );

-- Update Sales RLS to strictly enforce location isolation for salespersons
DROP POLICY IF EXISTS "Users can insert sales in their business or platform anywhere" ON public.sales;
CREATE POLICY "Users can insert sales in their business or platform anywhere"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (
      business_id = public.get_user_business_id() AND 
      auth.uid() = salesperson_id AND 
      public.has_permission('create_sales') AND
      -- Enforce location if they are assigned to one
      (location_id = (SELECT location_id FROM public.users WHERE id = auth.uid()) OR (SELECT location_id FROM public.users WHERE id = auth.uid()) IS NULL)
    )
  );

-- Update Stock Movements RLS to enforce location isolation
DROP POLICY IF EXISTS "Staff can insert stock movements in their business or platform anywhere" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements in their business or platform anywhere"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (
      business_id = public.get_user_business_id() AND 
      user_id = auth.uid() AND 
      public.has_permission('manage_inventory') AND
      -- Enforce location if they are assigned to one
      (location_id = (SELECT location_id FROM public.users WHERE id = auth.uid()) OR (SELECT location_id FROM public.users WHERE id = auth.uid()) IS NULL)
    )
  );
