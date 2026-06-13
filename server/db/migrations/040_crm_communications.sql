-- ============================================
-- Migration 040: CRM Communications
-- Business Admin Marketing & Communications
-- ============================================

-- 1. Add business_id to communication_gateways
ALTER TABLE public.communication_gateways 
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

-- Allow platform admin to see all gateways, and business admins to see their own
DROP POLICY IF EXISTS "Platform admins can read comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can read comms gateways"
  ON public.communication_gateways
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') 
    OR 
    (public.has_permission('manage_business') AND business_id = public.get_auth_business_id())
  );

DROP POLICY IF EXISTS "Platform admins can insert comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can insert comms gateways"
  ON public.communication_gateways
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR
    (public.has_permission('manage_business') AND business_id = public.get_auth_business_id())
  );

DROP POLICY IF EXISTS "Platform admins can update comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can update comms gateways"
  ON public.communication_gateways
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR
    (public.has_permission('manage_business') AND business_id = public.get_auth_business_id())
  );

DROP POLICY IF EXISTS "Platform admins can delete comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can delete comms gateways"
  ON public.communication_gateways
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR
    (public.has_permission('manage_business') AND business_id = public.get_auth_business_id())
  );

-- 2. Create crm_communication_templates
CREATE TABLE IF NOT EXISTS public.crm_communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'both')),
  subject TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business admins can read their templates"
  ON public.crm_communication_templates
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_auth_business_id());

CREATE POLICY "Business admins can insert templates"
  ON public.crm_communication_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (business_id = public.get_auth_business_id());

CREATE POLICY "Business admins can update templates"
  ON public.crm_communication_templates
  FOR UPDATE
  TO authenticated
  USING (business_id = public.get_auth_business_id());

CREATE POLICY "Business admins can delete templates"
  ON public.crm_communication_templates
  FOR DELETE
  TO authenticated
  USING (business_id = public.get_auth_business_id());
