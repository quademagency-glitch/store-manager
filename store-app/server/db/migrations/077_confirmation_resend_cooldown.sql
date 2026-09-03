-- ============================================================
-- 077: a cluster-wide cooldown for POST /api/auth/resend-confirmation
--
-- WHY A COLUMN AND NOT A RATE LIMITER
--
-- The endpoint already carries three express-rate-limit limiters, and one of
-- them is meant to stop a single address being mail-bombed from many IPs.
-- It does not do that, and the reason is written down in
-- utils/clusterLimits.js: express-rate-limit's MemoryStore lives inside one
-- process, and this API runs 8 of them. A limit of 3 is therefore 3 per
-- worker, so up to 24 an hour to one address.
--
-- Measured, not inferred: six consecutive POSTs to the deployed endpoint on
-- 2026-09-03 all returned 200, and the ratelimit-remaining header came back
-- as 2 against a limit of 3 because a different worker answered each time.
--
-- That gap matters more here than it does on login. The owner chose to have a
-- send failure return 502 rather than a silent 200, which is right for a user
-- who is the error handler, but it means the response distinguishes an
-- address with an unconfirmed account from one without whenever mail is
-- failing. The per-address limiter is what makes that impractical to probe,
-- so it has to be real rather than nominal.
--
-- A timestamp on the row is shared by every worker, survives a restart, and
-- is exactly the granularity wanted: not "how many requests" but "when did we
-- last actually send to this person". Fixing the limiters properly needs a
-- store shared between workers, which is an infrastructure decision; this is
-- not a substitute for that, it is the one place that could not wait for it.
--
-- The route treats a missing column as "no cooldown recorded" and still
-- sends, so deploying the code before this migration degrades to today's
-- behaviour rather than failing.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.confirmation_sent_at IS
  'When a confirmation email was last sent to this user by '
  '/api/auth/resend-confirmation. Read to enforce a cooldown that holds across '
  'all worker processes, which an in-process rate limiter cannot. Null means '
  'never sent, or sent before migration 077.';

-- Only ever read for one user at a time, by a lookup that has already found
-- the row by email, so no index is warranted: adding one would cost writes on
-- every user update to serve a query that is already a primary-key hit.
