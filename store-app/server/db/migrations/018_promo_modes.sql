-- ============================================
-- Migration 018: Promo Mode (True Trial vs Intro Price)
-- IDEMPOTENT: Safe to re-run
-- ============================================

ALTER TABLE public.platform_plans
ADD COLUMN IF NOT EXISTS promo_mode TEXT NOT NULL DEFAULT 'none' CHECK (promo_mode IN ('none', 'trial', 'intro')),
ADD COLUMN IF NOT EXISTS intro_price_monthly DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS intro_price_yearly DECIMAL(10, 2);
