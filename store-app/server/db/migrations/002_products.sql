-- ============================================
-- Migration 002: Products Table
-- Store Management App — Inventory CRUD
-- ============================================

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read products
DROP POLICY IF EXISTS "Anyone can read products" ON public.products;
CREATE POLICY "Anyone can read products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only managers can insert/update/delete products
DROP POLICY IF EXISTS "Managers can insert products" ON public.products;
CREATE POLICY "Managers can insert products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "Managers can update products" ON public.products;
CREATE POLICY "Managers can update products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'manager');

DROP POLICY IF EXISTS "Managers can delete products" ON public.products;
CREATE POLICY "Managers can delete products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'manager');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
