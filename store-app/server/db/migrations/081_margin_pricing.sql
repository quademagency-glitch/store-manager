-- ============================================
-- Migration 081: Margin pricing
--
-- Markup and margin are not the same number, and the difference is exactly
-- the kind of thing that costs a shop money quietly. A 20% MARKUP on a cost
-- of 100 is 120, on which the margin is 20/120 = 16.7%. A 20% MARGIN on the
-- same cost is 125, because the margin is a share of what the customer pays,
-- not of what you paid.
--
--   markup:  price = cost * (1 + rate)
--   margin:  price = cost / (1 - rate)
--
-- 079 added cost_markup_percent, and a shop that thinks in margin, which most
-- do when they talk about "making 20%", got 16.7% and no hint that the two
-- words mean different arithmetic. cost_margin_percent lets them say what
-- they actually mean.
--
-- price_change_log.change_type is a CHECK constraint, so the new mode has to
-- be allowed here or the audit insert fails AFTER the prices are written,
-- leaving changes with no trail. That is the same trap 079 documented, and
-- the reason this migration must be applied before the code that uses it.
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
    'cost_markup_percent',
    'cost_margin_percent'
  ));

COMMENT ON COLUMN public.price_change_log.change_type IS
  'How the new price was derived. cost_markup_percent means price = cost_price * (1 + change_value/100); cost_margin_percent means price = cost_price / (1 - change_value/100), so change_value is the share of the SELLING price kept as margin; every other mode is relative to the previous selling price.';
