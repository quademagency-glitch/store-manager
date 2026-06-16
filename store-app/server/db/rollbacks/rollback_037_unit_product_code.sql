-- Rollback for Migration 037: Unit Level Product Code

DROP INDEX IF EXISTS public.idx_inventory_units_product_code;
ALTER TABLE public.inventory_units DROP COLUMN IF EXISTS product_code;

ALTER TABLE public.stock_take_scans DROP COLUMN IF EXISTS product_code;
