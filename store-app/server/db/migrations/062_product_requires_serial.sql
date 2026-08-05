-- ============================================
-- Migration 062: Per-product serial requirement
-- Adds a toggle so that, in double QR tracking mode, a scanned serial number
-- is required only for product types that actually carry one.
-- ============================================

-- Default TRUE preserves existing double-mode behaviour (serial always required
-- at intake and at point of sale). Businesses opt specific products OUT for
-- item types that have no serial number.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_serial BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.requires_serial IS
  'When true (default), double QR tracking mode requires a scanned serial number for this product at intake and at point of sale. Set false for item types that have no serial.';
