-- ============================================
-- Migration 039: Communication Gateways
-- Store Management App — Communication Layer
-- IDEMPOTENT: Safe to re-run
-- ============================================

-- ============================================
-- 1. Communication Gateways
-- ============================================
CREATE TABLE IF NOT EXISTS public.communication_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- e.g., 'arkesel', 'twilio', 'sendgrid', 'smtp', 'mnotify', 'hubtel'
  type TEXT NOT NULL CHECK (type IN ('sms', 'email', 'both')),
  display_name TEXT NOT NULL,
  api_key TEXT,
  secret_key TEXT,
  sender_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can read comms gateways"
  ON public.communication_gateways
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can insert comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can insert comms gateways"
  ON public.communication_gateways
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can update comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can update comms gateways"
  ON public.communication_gateways
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform admins can delete comms gateways" ON public.communication_gateways;
CREATE POLICY "Platform admins can delete comms gateways"
  ON public.communication_gateways
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_platform'));

-- Migrate existing Arkesel setup from platform_settings if it exists
DO $$
DECLARE
  v_arkesel_api_key TEXT;
  v_arkesel_sender_id TEXT;
  v_count INT;
BEGIN
  -- Check if Arkesel already exists in communication_gateways
  SELECT COUNT(*) INTO v_count FROM public.communication_gateways WHERE provider = 'arkesel';
  
  IF v_count = 0 THEN
    -- Try to find existing settings
    SELECT value INTO v_arkesel_api_key FROM public.platform_settings WHERE key = 'ARKESEL_API_KEY' LIMIT 1;
    SELECT value INTO v_arkesel_sender_id FROM public.platform_settings WHERE key = 'ARKESEL_SENDER_ID' LIMIT 1;
    
    IF v_arkesel_api_key IS NOT NULL AND v_arkesel_api_key != '' THEN
      INSERT INTO public.communication_gateways (provider, type, display_name, api_key, sender_id, is_active, is_default)
      VALUES ('arkesel', 'sms', 'Arkesel (Legacy)', v_arkesel_api_key, COALESCE(v_arkesel_sender_id, 'QUADEM'), true, true);
    END IF;
  END IF;
END $$;
