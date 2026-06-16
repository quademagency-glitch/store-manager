-- Migration 026: Dynamic Accounting Templates

-- Create accounting_templates table
CREATE TABLE IF NOT EXISTS public.accounting_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('expense', 'deposit')),
  assigned_roles JSONB DEFAULT '[]'::jsonb, -- Array of role names
  fields_schema JSONB DEFAULT '[]'::jsonb, -- Array of field definitions
  conditional_logic JSONB DEFAULT '[]'::jsonb, -- Array of logic rules
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.accounting_templates;
CREATE POLICY "Authenticated users can read templates"
  ON public.accounting_templates
  FOR SELECT
  TO authenticated
  USING (
    business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

DROP POLICY IF EXISTS "Admins can manage templates" ON public.accounting_templates;
CREATE POLICY "Admins can manage templates"
  ON public.accounting_templates
  FOR ALL
  TO authenticated
  USING (
    business_id = public.get_user_business_id()
    AND (public.has_permission('manage_platform') OR public.has_permission('manage_business'))
  );

-- Modify business_ledger table
ALTER TABLE public.business_ledger 
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.accounting_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;

-- In case existing records don't have date set
UPDATE public.business_ledger SET date = DATE(created_at) WHERE date = CURRENT_DATE AND created_at IS NOT NULL;

-- Create Storage Bucket for Receipts if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket 'receipts'
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
CREATE POLICY "Authenticated users can upload receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
CREATE POLICY "Authenticated users can read receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');
