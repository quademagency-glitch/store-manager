-- ============================================
-- Migration 006: Roles and Permissions System
-- Store Management App — Dynamic RBAC
-- ============================================

-- 1. Create the roles table
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- 2. Insert default roles
INSERT INTO public.roles (name, description, permissions)
VALUES
  ('Manager', 'Full access to all modules', ARRAY['manage_users', 'manage_products', 'view_sales', 'create_sales', 'manage_sales', 'manage_inventory', 'view_analytics']),
  ('Salesperson', 'Can create sales and view basic data', ARRAY['view_sales', 'create_sales'])
ON CONFLICT (name) DO NOTHING;

-- 3. Update users table
-- Add role_id column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id);

-- Map existing roles only if the role column still exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role') THEN
    EXECUTE 'UPDATE public.users SET role_id = (SELECT id FROM public.roles WHERE name = ''Manager'') WHERE role = ''manager''';
    EXECUTE 'UPDATE public.users SET role_id = (SELECT id FROM public.roles WHERE name = ''Salesperson'') WHERE role = ''salesperson'' OR role IS NULL';
  END IF;
END $$;

-- Make role_id NOT NULL and drop the old role column
ALTER TABLE public.users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- 4. Create Helper Functions
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;

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
    WHERE u.id = auth.uid() 
    AND p_permission = ANY(r.permissions)
  );
$$;

-- 5. Update RLS on Users
DROP POLICY IF EXISTS "Managers can read all users" ON public.users;
CREATE POLICY "Managers can read all users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can insert users" ON public.users;
CREATE POLICY "Managers can insert users"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can update users" ON public.users;
CREATE POLICY "Managers can update users"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_users'));

-- 6. Add RLS on Roles
DROP POLICY IF EXISTS "Anyone can read roles" ON public.roles;
CREATE POLICY "Anyone can read roles"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Managers can insert roles" ON public.roles;
CREATE POLICY "Managers can insert roles"
  ON public.roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can update roles" ON public.roles;
CREATE POLICY "Managers can update roles"
  ON public.roles
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can delete roles" ON public.roles;
CREATE POLICY "Managers can delete roles"
  ON public.roles
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_users'));

-- 7. Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id UUID;
  v_role_name TEXT;
BEGIN
  v_role_name := COALESCE(NEW.raw_user_meta_data->>'role', 'Salesperson');
  
  -- Try to find the exact role by name
  SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name LIMIT 1;
  
  -- Fallback to Salesperson if not found
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Salesperson' LIMIT 1;
  END IF;

  INSERT INTO public.users (id, name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Update RLS on Products
DROP POLICY IF EXISTS "Managers can insert products" ON public.products;
CREATE POLICY "Managers can insert products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_products'));

DROP POLICY IF EXISTS "Managers can update products" ON public.products;
CREATE POLICY "Managers can update products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_products'));

DROP POLICY IF EXISTS "Managers can delete products" ON public.products;
CREATE POLICY "Managers can delete products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_products'));

-- 9. Update RLS on Sales
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
CREATE POLICY "Authenticated users can insert sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = salesperson_id AND public.has_permission('create_sales'));

DROP POLICY IF EXISTS "Managers can update sales" ON public.sales;
CREATE POLICY "Managers can update sales"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_sales'));

-- 10. Update RLS on Stock Movements
DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    public.has_permission('manage_inventory')
  );
