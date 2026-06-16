-- ============================================
-- Migration 036: Double Layer Inventory Theft Prevention
-- Adds configuration for double QR code scanning, product codes, and serial numbers.
-- ============================================

-- 1. Add qr_tracking_mode to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS qr_tracking_mode TEXT NOT NULL DEFAULT 'single' 
  CHECK (qr_tracking_mode IN ('single', 'double'));

COMMENT ON COLUMN public.businesses.qr_tracking_mode IS 'Determines if inventory needs 1 or 2 QR codes (single vs double layer tracking)';

-- 2. Add product_code to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_code TEXT;

COMMENT ON COLUMN public.products.product_code IS 'Manufacturer serial number or model code';

CREATE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);

-- 3. Update inventory_units
ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS pack_code_id UUID REFERENCES public.qr_code_pool(id),
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- Make qr_code_id nullable (as it might only be added at point of sale in double mode)
ALTER TABLE public.inventory_units ALTER COLUMN qr_code_id DROP NOT NULL;

-- Enforce globally unique serial numbers per business (no duplicates allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_units_serial_number_unique 
  ON public.inventory_units(business_id, serial_number) 
  WHERE serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_units_pack_code ON public.inventory_units(pack_code_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_serial_number ON public.inventory_units(serial_number);

-- 4. Update stock_take_scans to capture extra scans
ALTER TABLE public.stock_take_scans
  ADD COLUMN IF NOT EXISTS pack_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- 5. Add double layer status to sales items/units if needed.
-- (No specific DB changes to sales table needed, validation happens in application / RPC)
