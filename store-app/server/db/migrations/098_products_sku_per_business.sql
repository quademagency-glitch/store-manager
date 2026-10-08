-- ============================================
-- Migration 098: a SKU is unique within a business, not across QuadERP
--
-- 002 declared products.sku UNIQUE platform-wide. Two shops selling the same
-- model could not both use the manufacturer's code, and the refusal ("SKU
-- already in use on this platform", from the importer and from POST
-- /api/products) told any business whether another business stocked a given
-- SKU. Every SKU lookup is already scoped to a business (products lookup,
-- public catalog API, importer from 2026-10-08), so nothing relies on the
-- global rule. Existing rows cannot collide: they satisfied the stricter one.
-- ============================================

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_business_id_sku_key ON public.products (business_id, sku);
