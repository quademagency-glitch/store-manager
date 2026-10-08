-- An end-of-day summary email for owners: the day's sales and refunds, till
-- closes, low stock and pending work, sent at 20:00 Accra.
--
-- Off until each person switches it on for themselves. Each recipient gets
-- their own email (never a shared recipient list). The per-business,
-- per-day row is claimed before sending, so a restart or a second process
-- cannot send the same day's summary twice; a failed send releases it.

ALTER TABLE public.users ADD COLUMN daily_summary_email boolean NOT NULL DEFAULT false;

CREATE TABLE public.owner_daily_summaries (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  recipients integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, summary_date)
);
ALTER TABLE public.owner_daily_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_daily_summaries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_daily_summaries TO service_role;
