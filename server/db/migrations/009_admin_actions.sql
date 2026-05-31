-- ============================================
-- Migration 009: Admin Actions (Edit, Ban, Delete)
-- Store Management App
-- ============================================

-- 1. Add Status Columns
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned'));

-- 2. Add Platform Admin Delete Policy for Users
DROP POLICY IF EXISTS "Platform Admins can delete users" ON public.users;
CREATE POLICY "Platform Admins can delete users"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_platform'));

-- 3. Update Helper Functions to Enforce Bans globally
-- By updating these, banned users (or users in banned businesses) will automatically
-- lose their permissions and their business_id context, blocking RLS access everywhere.

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

CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.business_id 
  FROM public.users u
  LEFT JOIN public.businesses b ON u.business_id = b.id
  WHERE u.id = auth.uid()
  AND u.status = 'active'
  AND (b.id IS NULL OR b.status = 'active');
$$;

-- 4. Enable cascade delete on auth user if we delete from public.users
-- Supabase auth.users doesn't cascade to public.users automatically if we just delete public.users.
-- To completely delete a user from the system, it requires calling Supabase Admin API.
-- For now, deleting from public.users will remove their access to the ERP.
