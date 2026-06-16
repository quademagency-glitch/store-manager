-- Rollback for Migration 038: Platform Communications & Settings
-- WARNING: This deletes all platform_settings data including API keys.

DROP TABLE IF EXISTS public.platform_settings CASCADE;
