-- ============================================
-- Migration 068: Demo / sandbox business
--
-- The public "Try live demo" account is a real business row with real users,
-- products and sales — that is what makes it worth showing. It must not be
-- mistaken for a customer.
--
-- `is_demo` is the flag every aggregate has to exclude on. Without it the
-- demo tenant inflates the business count on the Platform Admin dashboard,
-- and the seeder's hundred sample sales would show up in whatever
-- cross-tenant reporting gets built next.
--
-- Billing needs no special case: the demo business has no subscription and no
-- invoices, so revenue and MRR already ignore it. subscriptionCron skips it
-- explicitly all the same, so that a demo business accidentally given a plan
-- can never be suspended or emailed.
-- ============================================

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.businesses.is_demo IS
  'Public sandbox tenant. Excluded from Platform Admin metrics and billing; its data is wiped and reseeded on a schedule by scripts/seed-demo-data.js.';

-- Partial: there is exactly one demo business, so indexing the other few
-- thousand rows would be waste.
CREATE INDEX IF NOT EXISTS idx_businesses_is_demo
  ON public.businesses (id)
  WHERE is_demo;
