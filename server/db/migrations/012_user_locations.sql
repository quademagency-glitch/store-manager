-- ============================================
-- Migration 012: User Locations Junction
-- Store Management App — Multi-branch assignment
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);

-- Enable RLS
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Platform Admin can do anything
CREATE POLICY "Platform Admins can manage all user locations"
  ON public.user_locations
  FOR ALL
  TO authenticated
  USING (public.has_permission('manage_platform'));

-- Policy: Business Admins can manage user_locations within their business
CREATE POLICY "Business Admins can manage user locations for their business"
  ON public.user_locations
  FOR ALL
  TO authenticated
  USING (
    public.has_permission('manage_business') AND
    (SELECT business_id FROM public.locations WHERE id = location_id) = public.get_user_business_id()
  );

-- Policy: Users can read their own assigned locations
CREATE POLICY "Users can view their own locations"
  ON public.user_locations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('manage_users'));

-- Migrate existing data from users to user_locations
INSERT INTO public.user_locations (user_id, location_id)
SELECT id, location_id FROM public.users WHERE location_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop location_id from users since it's now many-to-many
ALTER TABLE public.users DROP COLUMN IF EXISTS location_id;
