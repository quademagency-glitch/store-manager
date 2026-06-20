-- ============================================
-- Migration 057: Per-location currency override
-- NULL means "inherit the business's currency" — most locations will
-- leave this unset. Lets a multi-location business run branches in
-- different currencies (e.g. a Ghana branch and a Nigeria branch) without
-- a manual currency switch; the active location's currency is resolved
-- server-side (see server/utils/currency.js).
-- ============================================

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS currency TEXT;
