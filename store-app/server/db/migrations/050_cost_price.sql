-- ============================================
-- Migration 050: Add cost_price to products
-- ============================================

-- Add cost_price column to products (nullable, backfilled from purchase orders)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2);

-- Backfill cost_price from the latest purchase order items
UPDATE public.products p
SET cost_price = po_item.unit_cost
FROM (
  SELECT DISTINCT ON (poi.product_id) poi.product_id, poi.unit_cost
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  ORDER BY poi.product_id, po.created_at DESC
) po_item
WHERE p.id = po_item.product_id
  AND p.cost_price IS NULL;

-- Create index on cost_price for P&L queries
CREATE INDEX IF NOT EXISTS idx_products_cost_price ON public.products(cost_price) WHERE cost_price IS NOT NULL;
