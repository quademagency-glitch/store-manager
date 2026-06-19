-- ============================================
-- Migration 054: Setup Checklist Dismiss Flag
-- Every step's completion is computed live from existing data (see
-- GET /api/businesses/me/setup-status) — this is the one bit of state that
-- isn't derivable: whether the admin explicitly closed the summary banner.
-- Lives on businesses (not users) since it's a business-level onboarding
-- milestone, not a per-user preference.
-- ============================================

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS setup_checklist_dismissed_at TIMESTAMPTZ;
