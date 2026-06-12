-- ============================================
-- Migration 037: Unit Level Product Code
-- Adds product_code to inventory_units and stock_take_scans
-- ============================================

ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS product_code TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_units_product_code ON public.inventory_units(product_code);

ALTER TABLE public.stock_take_scans
  ADD COLUMN IF NOT EXISTS product_code TEXT;
