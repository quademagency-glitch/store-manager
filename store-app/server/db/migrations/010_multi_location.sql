-- ============================================
-- Migration 010: Multi-Location & Business Profile
-- Store Management App — Groundwork for branches
-- ============================================

-- 1. Update businesses table with profile and billing fields
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS billing_plan TEXT DEFAULT 'Free';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'Active';

-- 2. Create locations table
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  tax_rate DECIMAL(5, 2) DEFAULT 0.00,
  receipt_header TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for locations
DROP POLICY IF EXISTS "Users can read locations in their business" ON public.locations;
CREATE POLICY "Users can read locations in their business or platform read all"
  ON public.locations
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    business_id = public.get_user_business_id()
  );

DROP POLICY IF EXISTS "Managers can insert locations in their business" ON public.locations;
CREATE POLICY "Managers can insert locations in their business or platform anywhere"
  ON public.locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

DROP POLICY IF EXISTS "Managers can update locations in their business" ON public.locations;
CREATE POLICY "Managers can update locations in their business or platform anywhere"
  ON public.locations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

DROP POLICY IF EXISTS "Managers can delete locations in their business" ON public.locations;
CREATE POLICY "Managers can delete locations in their business or platform anywhere"
  ON public.locations
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_business'))
  );

-- 4. Create a default location for existing businesses
DO $$ 
DECLARE
  b_record RECORD;
BEGIN
  FOR b_record IN SELECT id, name FROM public.businesses LOOP
    IF NOT EXISTS (SELECT 1 FROM public.locations WHERE business_id = b_record.id) THEN
      INSERT INTO public.locations (business_id, name, address) 
      VALUES (b_record.id, b_record.name || ' - Main Location', '123 Default St.');
    END IF;
  END LOOP;
END $$;
