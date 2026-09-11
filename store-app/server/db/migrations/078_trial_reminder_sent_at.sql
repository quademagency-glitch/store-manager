-- ============================================================
-- 078: remember that a trial-ending reminder was sent
--
-- A self-serve trial got no email at all as it ended. sendExpirationWarnings
-- and the suspension notice both read business_subscriptions, which a
-- self-serve trial never has, and processExpiredTrials only flips the row to
-- 'expired'. So every real signup reached day 30 with no warning before and
-- no notice after, and found itself narrowed to billing on its next sign-in.
-- The Billing page's countdown did not help: it reads the same empty table.
--
-- The reminder goes out once, when the trial has three days or fewer left.
-- The daily job runs on every one of those days, so without a record of
-- having sent, each trial would get three reminders. This column is that
-- record. The job claims it with a conditional UPDATE before sending, so a
-- second run cannot send the same reminder, and releases the claim if the
-- send fails so the next day retries.
--
-- The job SKIPS reminders entirely while this column is missing, rather than
-- sending without it. That is the opposite choice from migration 077, and
-- deliberately: falling back there meant one uncooled send the user had asked
-- for; falling back here would mean an unasked-for email every day for three
-- days.
--
-- No index: the sweep runs once a day over the businesses table, which is
-- small and already filtered by status.
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.businesses.trial_reminder_sent_at IS
  'When the "your free trial ends soon" email was sent by the daily '
  'subscription-checks job. Set by a conditional update before sending and '
  'cleared again if the send fails. Null means not sent.';
