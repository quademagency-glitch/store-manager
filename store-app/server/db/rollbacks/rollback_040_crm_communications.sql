-- Rollback for Migration 040: CRM Communications
-- Run BEFORE rollback_039 if rolling back both.

-- 1. Drop crm_communication_templates table and its policies
DROP TABLE IF EXISTS public.crm_communication_templates CASCADE;

-- 2. Remove business_id column from communication_gateways
--    (restore original platform-admin-only policies from migration 039)
ALTER TABLE public.communication_gateways
  DROP COLUMN IF EXISTS business_id;

DROP POLICY IF EXISTS "Platform admins can read comms gateways" ON public.communication_gateways;
DROP POLICY IF EXISTS "Platform admins can insert comms gateways" ON public.communication_gateways;
DROP POLICY IF EXISTS "Platform admins can update comms gateways" ON public.communication_gateways;
DROP POLICY IF EXISTS "Platform admins can delete comms gateways" ON public.communication_gateways;

-- Restore original platform-admin-only policies
CREATE POLICY "Platform admins can read comms gateways"
  ON public.communication_gateways FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform'));

CREATE POLICY "Platform admins can insert comms gateways"
  ON public.communication_gateways FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

CREATE POLICY "Platform admins can update comms gateways"
  ON public.communication_gateways FOR UPDATE TO authenticated
  USING (public.has_permission('manage_platform'));

CREATE POLICY "Platform admins can delete comms gateways"
  ON public.communication_gateways FOR DELETE TO authenticated
  USING (public.has_permission('manage_platform'));
