-- ============================================
-- Migration 071: CSP violation collection
--
-- The Content-Security-Policy in vercel.json ships as Report-Only so it can be
-- validated against real traffic before it starts blocking anything. Browsers
-- post violations to POST /api/csp-report, which aggregates them in memory —
-- and that is the problem this table solves.
--
-- The API runs clustered, one worker per core (up to 8 on Railway). Incoming
-- reports are distributed across workers, so any single worker sees roughly an
-- eighth of them and the summary endpoint returned "0 violations" while
-- violations were actively being recorded by its siblings. A false all-clear is
-- worse than no endpoint at all: the whole point is deciding whether it is safe
-- to switch the policy to enforcing, and that decision must not be made on a
-- one-in-eight sample. In-memory state also resets on every deploy, which is
-- precisely when you want the preceding week's evidence.
--
-- Append-only. Write volume is already bounded by the in-memory de-duplication
-- in routes/cspReport.js (a given directive/blocked-uri pair is written once,
-- then at most once per 15 minutes), so this stays small even if a directive is
-- badly wrong on a busy page. The summary aggregates with GROUP BY rather than
-- maintaining a counter, which avoids needing an upsert RPC for what is a
-- short-lived diagnostic.
--
-- Expected lifetime: this is scaffolding for the Report-Only bake period. Once
-- the policy is enforcing and stable, the table can be dropped.
-- ============================================

CREATE TABLE IF NOT EXISTS public.csp_violations (
  id            BIGSERIAL PRIMARY KEY,
  directive     TEXT NOT NULL,
  blocked_uri   TEXT,
  document_uri  TEXT,
  disposition   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.csp_violations IS
  'Content-Security-Policy violations reported by browsers while the policy is in Report-Only mode. Append-only, cross-worker; the in-process aggregation in routes/cspReport.js only sees one worker of N. Drop once the policy is enforcing and stable.';
COMMENT ON COLUMN public.csp_violations.directive IS
  'The directive that would have blocked the load, e.g. script-src, img-src. This is what has to be widened in vercel.json if the resource is legitimate.';
COMMENT ON COLUMN public.csp_violations.blocked_uri IS
  'The resource the page tried to load. Attacker-influenceable via a crafted page, so treated as untrusted text and truncated before write.';
COMMENT ON COLUMN public.csp_violations.document_uri IS
  'The app page that triggered it — tells you which screen to re-test after changing the policy.';
COMMENT ON COLUMN public.csp_violations.disposition IS
  '"report" while Report-Only, "enforce" once enforcing. A row with disposition=enforce means something was actually blocked for a real user.';

-- Supports the summary aggregation and any retention sweep.
CREATE INDEX IF NOT EXISTS idx_csp_violations_created_at
  ON public.csp_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive
  ON public.csp_violations (directive, blocked_uri);

ALTER TABLE public.csp_violations ENABLE ROW LEVEL SECURITY;

-- Written by the report collector, which runs as service_role. There is no
-- authenticated-role policy of any kind: the endpoint is public and
-- unauthenticated by necessity (browsers post these without credentials), so
-- nothing that reaches it should be able to read the table back. Following
-- 061_webhook_deliveries_service_role_policy.sql, the service_role policy is
-- explicit rather than relying on BYPASSRLS.
DROP POLICY IF EXISTS "Service role can manage csp violations" ON public.csp_violations;
CREATE POLICY "Service role can manage csp violations"
  ON public.csp_violations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
