-- ============================================
-- Migration 069: Payment idempotency + cron run locks
--
-- Two independent correctness fixes that both come down to "this operation can
-- run twice and nothing stops it".
--
-- 1. DUPLICATE INVOICES
-- A successful Paystack payment is applied by two separate code paths: the
-- webhook (routes/paystackWebhook.js) and POST /api/subscriptions/verify-paystack,
-- which the client calls on the Paystack redirect callback. Both insert into
-- billing_invoices. verify-paystack does a SELECT-then-INSERT to avoid this,
-- but that is a check-then-act race — the webhook can land between the two
-- statements — and Paystack retries any non-2xx, so the webhook alone can also
-- fire more than once for one payment. paystack_reference has been nullable and
-- unconstrained since 015, so every one of those races has been writing a second
-- invoice row. The partial unique index below makes the second write fail
-- loudly with 23505, which both call sites now treat as "already recorded,
-- succeed". Partial (WHERE NOT NULL) because manually-recorded invoices
-- legitimately have no Paystack reference and several may be NULL at once.
--
-- Note: if duplicates already exist in production this index will fail to
-- create. That is deliberate — see the verification query at the bottom of this
-- file; dedupe first, then re-run. A silent CREATE INDEX ... ON CONFLICT DO
-- NOTHING equivalent would leave the corruption in place.
--
-- 2. DUPLICATE CRON RUNS
-- cluster.js runs the three cron jobs in the primary process, which is correct
-- for one Railway replica and wrong for more than one: each replica has its own
-- primary, so each would run its own copy. For subscriptionCron that means
-- duplicate suspension emails; for demoResetCron it means two concurrent
-- teardown-and-reseed cycles of the demo tenant, which is destructive. Postgres
-- advisory locks are not usable here — the Supabase client goes through
-- PostgREST and every request may land on a different connection, so a session
-- lock cannot be held for the duration of a job. Instead each job INSERTs a row
-- keyed by (job_name, scheduled_for) before doing any work: whoever's INSERT
-- succeeds owns the run, and a 23505 means someone else already has it.
-- ============================================

-- --------------------------------------------
-- 1. Invoice idempotency
-- --------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoices_paystack_reference
  ON public.billing_invoices (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

COMMENT ON INDEX public.idx_billing_invoices_paystack_reference IS
  'One invoice per Paystack transaction. Enforces idempotency between the webhook and the verify-paystack callback, which race each other on every payment. Partial because manually-recorded invoices have no reference.';

-- --------------------------------------------
-- 2. Cron run locks
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS public.cron_runs (
  job_name      TEXT        NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  instance      TEXT,
  PRIMARY KEY (job_name, scheduled_for)
);

COMMENT ON TABLE public.cron_runs IS
  'Claim table that makes scheduled jobs run exactly once across processes and replicas. A job INSERTs before working; 23505 means another instance already owns that run.';
COMMENT ON COLUMN public.cron_runs.job_name IS
  'Stable identifier for the job, e.g. subscription-checks, webhook-retry-sweep, demo-reset.';
COMMENT ON COLUMN public.cron_runs.scheduled_for IS
  'The run slot being claimed, bucketed to the job cadence (day for daily jobs, 5-minute bucket for the webhook sweep). Two instances computing the same bucket collide on the primary key, which is the point.';
COMMENT ON COLUMN public.cron_runs.started_at IS
  'When the winning instance claimed the slot.';
COMMENT ON COLUMN public.cron_runs.instance IS
  'Best-effort identifier of the claiming process (hostname:pid), for debugging which replica ran a job.';

-- Supports the retention sweep below; the PK already covers claim lookups.
CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at
  ON public.cron_runs (started_at);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- Written only by the crons, which run as service_role. There is deliberately
-- no authenticated-role policy of any kind: this table is operational
-- bookkeeping and no tenant should be able to read, let alone write, it.
-- The explicit service_role policy rather than relying on BYPASSRLS follows
-- 061_webhook_deliveries_service_role_policy.sql, where inserts through the
-- live server were observed failing despite service_role having rolbypassrls.
DROP POLICY IF EXISTS "Service role can manage cron runs" ON public.cron_runs;
CREATE POLICY "Service role can manage cron runs"
  ON public.cron_runs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------
-- Verification / troubleshooting
--
-- If the index above fails with "could not create unique index", duplicates
-- already exist. Find them with:
--
--   SELECT paystack_reference, count(*), array_agg(id ORDER BY created_at)
--   FROM public.billing_invoices
--   WHERE paystack_reference IS NOT NULL
--   GROUP BY paystack_reference HAVING count(*) > 1;
--
-- Keep the earliest row per reference and delete the rest, then re-run. Check
-- against Paystack before deleting anything — a repeated reference with
-- different amounts is not a duplicate, it is a data problem.
-- --------------------------------------------
