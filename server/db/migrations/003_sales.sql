-- ============================================
-- Migration 003: Sales & Sale Items Tables
-- Store Management App — Sales Flow
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Create the sales table
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID NOT NULL REFERENCES public.users(id),
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'mobile')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create the sale_items table
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0)
);

-- 3. Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — Sales

-- All authenticated users can read all sales
DROP POLICY IF EXISTS "Authenticated users can read sales" ON public.sales;
CREATE POLICY "Authenticated users can read sales"
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert sales (salesperson creates their own)
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
CREATE POLICY "Authenticated users can insert sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = salesperson_id AND public.get_user_role() IN ('manager', 'salesperson'));

-- 5. RLS Policies — Sale Items

-- All authenticated users can read sale items
DROP POLICY IF EXISTS "Authenticated users can read sale_items" ON public.sale_items;
CREATE POLICY "Authenticated users can read sale_items"
  ON public.sale_items
  FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert sale items
-- (only if they own the parent sale)
DROP POLICY IF EXISTS "Authenticated users can insert sale_items" ON public.sale_items;
CREATE POLICY "Authenticated users can insert sale_items"
  ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND s.salesperson_id = auth.uid()
    )
  );

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_salesperson ON public.sales(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items(product_id);
