-- ============================================
-- Migration 042: manage_financials permission
-- Backfill the new permission onto built-in admin roles, the same way
-- migration 024 backfilled view_till_balance/view_till_history.
-- Custom roles can have it toggled on later via Settings > Roles.
-- ============================================

UPDATE public.roles
SET permissions = array_append(permissions, 'manage_financials')
WHERE name = 'Platform Admin' AND NOT ('manage_financials' = ANY(permissions));

UPDATE public.roles
SET permissions = array_append(permissions, 'manage_financials')
WHERE name = 'Business Admin' AND NOT ('manage_financials' = ANY(permissions));
