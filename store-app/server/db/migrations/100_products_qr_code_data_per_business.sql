-- ============================================
-- Migration 100: product QR data is unique within a business, as SKUs are (098)
--
-- 018 made products.qr_code_data unique platform-wide, and a new product's
-- qr_code_data defaults to its SKU (routes/products.js, the importer). So
-- after 098 a second shop using a SKU another shop already had was still
-- refused, now on this index, with the same cross-business disclosure. The
-- one lookup by qr_code_data (GET /api/products/lookup) is scoped to the
-- business. Existing rows cannot collide: they satisfied the stricter rule.
-- ============================================

DROP INDEX IF EXISTS public.idx_products_qr_code_data;
CREATE UNIQUE INDEX IF NOT EXISTS products_business_id_qr_code_data_key
  ON public.products (business_id, qr_code_data) WHERE qr_code_data IS NOT NULL;
