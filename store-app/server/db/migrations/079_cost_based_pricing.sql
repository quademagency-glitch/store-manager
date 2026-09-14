-- ============================================
-- Migration 079: Cost-based pricing
--
-- Every mode in /api/pricing computed the new price from the CURRENT SELLING
-- PRICE, so a product imported with a cost and no price could never be
-- priced: a 30% markup on 0 is 0. Bulk import now accepts cost-only sheets
-- and leaves those products at price 0, so there has to be a way to price
-- them from cost afterwards.
--
-- price_change_log.change_type is a CHECK constraint, so the new mode has to
-- be allowed here or the audit insert fails AFTER the prices have already
-- been written, leaving changes with no trail.
--
-- Fully idempotent, safe to re-run.
-- ============================================

ALTER TABLE public.price_change_log
  DROP CONSTRAINT IF EXISTS price_change_log_change_type_check;

ALTER TABLE public.price_change_log
  ADD CONSTRAINT price_change_log_change_type_check
  CHECK (change_type IN (
    'markup_percent',
    'markdown_percent',
    'fixed_amount',
    'set_price',
    'manual',
    'cost_markup_percent'
  ));

COMMENT ON COLUMN public.price_change_log.change_type IS
  'How the new price was derived. cost_markup_percent means price = cost_price * (1 + change_value/100); every other mode is relative to the previous selling price.';
