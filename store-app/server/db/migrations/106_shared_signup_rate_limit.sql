-- ============================================================
-- 106: a signup rate limit that every worker shares
--
-- On 2026-10-24, 38 signups arrived from one address (79.127.182.75) in two
-- bursts, 02:57 and 03:18 UTC. Each used a stranger's real email address and
-- a casino advert with a bit.ly link as the person's name, so that our
-- welcome email delivered the advert to the stranger with our name on it.
--
-- routes/auth.js limits signup to 5 an hour per address. That limiter counts
-- inside one process and this API runs 8, so the real limit was 40, and 38
-- got through. utils/clusterLimits.js says fixing that needs a store shared
-- between workers; for signup, this table is it.
--
-- claim_signup_slot() counts and records in one transaction under an
-- advisory lock. Without the lock a burst of parallel requests (six of the
-- 38 landed within the same 10 ms) would all read "none so far" before any
-- of them wrote. It returns NULL when the attempt may go ahead, or the name
-- of the limit that refused it.
--
-- Attempts that passed validation are counted, not successful signups: a
-- duplicate email still costs a slot, as it does in the in-process limiter.
--
-- The route falls back to the in-process limiters if this function is
-- missing, so deploying the code before this migration changes nothing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id          BIGSERIAL PRIMARY KEY,
  address_key TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_attempts_created_at_idx
  ON public.signup_attempts (created_at);
CREATE INDEX IF NOT EXISTS signup_attempts_address_key_created_at_idx
  ON public.signup_attempts (address_key, created_at);

-- Server-only: RLS on with no policies, and nothing granted to the API roles.
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.signup_attempts_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_signup_slot(
  p_address_key TEXT,
  p_per_address INT,
  p_global      INT
) RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - INTERVAL '1 hour';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('claim_signup_slot'));

  -- The window is an hour, so nothing older than that is ever read again.
  DELETE FROM signup_attempts WHERE created_at < v_since;

  IF (SELECT count(*) FROM signup_attempts) >= p_global THEN
    RETURN 'global';
  END IF;

  IF (SELECT count(*) FROM signup_attempts WHERE address_key = p_address_key) >= p_per_address THEN
    RETURN 'address';
  END IF;

  INSERT INTO signup_attempts (address_key) VALUES (p_address_key);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.claim_signup_slot(TEXT, INT, INT) IS
  'Records a signup attempt if neither the per-address nor the global hourly '
  'limit is reached. Returns NULL when allowed, else ''address'' or ''global''. '
  'Shared by every API worker, which the in-process express-rate-limit is not.';

-- Locked to the server, as migration 063 did for the other definer-era RPCs.
REVOKE ALL ON FUNCTION public.claim_signup_slot(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signup_slot(TEXT, INT, INT) TO service_role;
