-- ============================================
-- Migration 023: Custom Roles and Organization Settings
-- ============================================

-- 1. Add fields to businesses table
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS tax_rate DECIMAL DEFAULT 0.00;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS return_policy TEXT;

-- 2. Modify Roles table to support multi-tenancy
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

-- Drop the old unique constraint on name
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;

-- Add a new composite unique constraint
-- A role name must be unique within a business. If business_id is NULL, it's a platform generic role.
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_business_id_key;
ALTER TABLE public.roles ADD CONSTRAINT roles_name_business_id_key UNIQUE NULLS NOT DISTINCT (name, business_id);

-- Update RLS policies for Roles
DROP POLICY IF EXISTS "Anyone can read roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated users can read their roles" ON public.roles;
CREATE POLICY "Authenticated users can read their roles"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NULL 
    OR business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

DROP POLICY IF EXISTS "Managers can insert roles" ON public.roles;
DROP POLICY IF EXISTS "Managers can insert custom roles" ON public.roles;
CREATE POLICY "Managers can insert custom roles"
  ON public.roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_users') AND
    (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'))
  );

DROP POLICY IF EXISTS "Managers can update roles" ON public.roles;
DROP POLICY IF EXISTS "Managers can update custom roles" ON public.roles;
CREATE POLICY "Managers can update custom roles"
  ON public.roles
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_users') AND
    (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'))
  );

DROP POLICY IF EXISTS "Managers can delete roles" ON public.roles;
DROP POLICY IF EXISTS "Managers can delete custom roles" ON public.roles;
CREATE POLICY "Managers can delete custom roles"
  ON public.roles
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission('manage_users') AND
    (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'))
  );

-- Update has_permission to ensure it works properly with the new role scope
CREATE OR REPLACE FUNCTION public.has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.users u
    JOIN public.roles r ON u.role_id = r.id
    LEFT JOIN public.businesses b ON u.business_id = b.id
    WHERE u.id = auth.uid() 
    AND u.status = 'active'
    AND (b.id IS NULL OR b.status = 'active')
    AND p_permission = ANY(r.permissions)
  );
$$;
