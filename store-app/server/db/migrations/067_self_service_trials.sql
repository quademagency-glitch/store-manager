-- ============================================
-- Migration 067: Self-service signup & free trials
--
-- Until now every business was provisioned by a Platform Admin, so a
-- business was either 'active' or 'banned' and nothing else. Self-service
-- signup introduces a third state: an account that exists, works, and has
-- never been paid for — and a fourth for when that runs out.
--
--   trialing  full access, unpaid, ends at trial_ends_at
--   expired   trial ran out with no subscription; sign-in still works but
--             the app is read-limited to billing (see server/middleware/
--             authGuard.js) so the owner can still come back and pay
--
-- 'expired' deliberately is NOT 'banned'. Banned is a moderation action and
-- locks the account out completely; an expired trial is a sales state and
-- must leave a route to upgrade.
-- ============================================

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.businesses.trial_ends_at IS
  'When a self-service free trial lapses. NULL for businesses that never had one (operator-provisioned or already paying).';

-- Widen the status check rather than replace it, so 'active'/'banned' keep
-- meaning exactly what they did.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('active', 'banned', 'trialing', 'expired'));

-- The trial-expiry cron scans for exactly this shape once a day. Partial, so
-- the index stays tiny — the overwhelming majority of rows are not trialing.
CREATE INDEX IF NOT EXISTS idx_businesses_trialing_expiry
  ON public.businesses (trial_ends_at)
  WHERE status = 'trialing';
