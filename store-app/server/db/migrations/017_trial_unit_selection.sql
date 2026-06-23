-- ============================================
-- Migration 017: Trial unit selection (days vs months)
-- IDEMPOTENT: Safe to re-run
-- ============================================

ALTER TABLE public.platform_plans
ADD COLUMN IF NOT EXISTS trial_unit_monthly TEXT NOT NULL DEFAULT 'days',
ADD COLUMN IF NOT EXISTS trial_unit_yearly TEXT NOT NULL DEFAULT 'days';
