-- ============================================
-- Migration 096: re-apply 062 (products.requires_serial)
--
-- Production was baselined on 2026-08-06, which recorded migrations 001-064
-- as applied without running them. 062 evidently never ran there: on
-- 2026-10-08 every POST /api/products failed with PGRST204, "Could not find
-- the 'requires_serial' column of 'products' in the schema cache", and
-- double-QR checkout (085) reads the same column.
--
-- Identical to 062 and idempotent, so a no-op wherever 062 did run. The
-- NOTIFY makes PostgREST reload its schema cache, which also covers the case
-- where the column existed and only the cache was stale.
-- ============================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_serial BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.requires_serial IS
  'When true (default), double QR tracking mode requires a scanned serial number for this product at intake and at point of sale. Set false for item types that have no serial.';

NOTIFY pgrst, 'reload schema';
