-- Rollback for Migration 036: Double Layer Inventory Theft Prevention
-- WARNING: Only run after confirming no double-tracking data exists.

-- 1. Remove indexes
DROP INDEX IF EXISTS public.idx_inventory_units_serial_number_unique;
DROP INDEX IF EXISTS public.idx_inventory_units_pack_code;
DROP INDEX IF EXISTS public.idx_inventory_units_serial_number;
DROP INDEX IF EXISTS public.idx_products_product_code;

-- 2. Remove columns from inventory_units
ALTER TABLE public.inventory_units
  DROP COLUMN IF EXISTS pack_code_id,
  DROP COLUMN IF EXISTS serial_number;

-- Restore qr_code_id NOT NULL constraint
-- NOTE: Only safe if all rows already have a qr_code_id value.
-- ALTER TABLE public.inventory_units ALTER COLUMN qr_code_id SET NOT NULL;

-- 3. Remove product_code from products
ALTER TABLE public.products DROP COLUMN IF EXISTS product_code;

-- 4. Remove columns from stock_take_scans
ALTER TABLE public.stock_take_scans
  DROP COLUMN IF EXISTS pack_qr_code,
  DROP COLUMN IF EXISTS serial_number;

-- 5. Remove qr_tracking_mode from businesses
ALTER TABLE public.businesses DROP COLUMN IF EXISTS qr_tracking_mode;
