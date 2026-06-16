-- ============================================
-- Migration 008: Super Admin System
-- Store Management App — Two-Tiered Admins
-- ============================================

-- 1. Create a "Pending Assignment" business for unassigned users
DO $$ 
DECLARE
  pending_business_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE name = 'Pending Assignment') THEN
    INSERT INTO public.businesses (name) VALUES ('Pending Assignment') RETURNING id INTO pending_business_id;
  END IF;
END $$;

-- 2. Insert New Roles
INSERT INTO public.roles (name, description, permissions)
VALUES
  ('Platform Admin', 'Super Super Admin with global access', ARRAY['manage_platform', 'manage_business', 'manage_users', 'manage_products', 'view_sales', 'create_sales', 'manage_sales', 'manage_inventory', 'view_analytics']),
  ('Business Admin', 'Super Admin for a specific business', ARRAY['manage_business', 'manage_users', 'manage_products', 'view_sales', 'create_sales', 'manage_sales', 'manage_inventory', 'view_analytics'])
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions, description = EXCLUDED.description;

-- 3. Update auth trigger to NOT auto-create businesses
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id UUID;
  v_role_name TEXT;
  v_business_id UUID;
  v_user_name TEXT;
BEGIN
  v_role_name := COALESCE(NEW.raw_user_meta_data->>'role', 'Salesperson');
  v_user_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  
  -- Check if they provided a business_id (e.g., from an invite)
  IF NEW.raw_user_meta_data->>'business_id' IS NOT NULL THEN
    v_business_id := (NEW.raw_user_meta_data->>'business_id')::UUID;
  ELSE
    -- Instead of auto-creating, assign to the Pending Assignment business
    SELECT id INTO v_business_id FROM public.businesses WHERE name = 'Pending Assignment' LIMIT 1;
    -- Since they are not assigned to a real business, force role to Salesperson so they have minimal access
    v_role_name := 'Salesperson';
  END IF;

  -- Try to find the exact role by name
  SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name LIMIT 1;
  
  -- Fallback to Salesperson if not found
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Salesperson' LIMIT 1;
  END IF;

  INSERT INTO public.users (id, name, email, role_id, business_id)
  VALUES (
    NEW.id,
    v_user_name,
    NEW.email,
    v_role_id,
    v_business_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Update RLS Policies to allow Platform Admin to bypass business_id

-- Businesses
DROP POLICY IF EXISTS "Users can read own business" ON public.businesses;
CREATE POLICY "Users can read own business or all if platform admin"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform') OR id = public.get_user_business_id());

DROP POLICY IF EXISTS "Managers can update own business" ON public.businesses;
CREATE POLICY "Managers can update own business or all if platform admin"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (public.has_permission('manage_platform') OR (id = public.get_user_business_id() AND public.has_permission('manage_business')));

DROP POLICY IF EXISTS "Platform Admins can insert businesses" ON public.businesses;
CREATE POLICY "Platform Admins can insert businesses"
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform Admins can delete businesses" ON public.businesses;
CREATE POLICY "Platform Admins can delete businesses"
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (public.has_permission('manage_platform'));


-- Users
DROP POLICY IF EXISTS "Users can read own record" ON public.users;
DROP POLICY IF EXISTS "Managers can read all users in same business" ON public.users;
CREATE POLICY "Users can read own record or managers read business or platform read all"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_users')) OR
    auth.uid() = id
  );

DROP POLICY IF EXISTS "Managers can insert users in same business" ON public.users;
CREATE POLICY "Managers can insert users in same business or platform anywhere"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );

DROP POLICY IF EXISTS "Managers can update users in same business" ON public.users;
CREATE POLICY "Managers can update users in same business or platform anywhere"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_users'))
  );


-- Products
DROP POLICY IF EXISTS "Users can read products in their business" ON public.products;
CREATE POLICY "Users can read products in their business or platform read all"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Managers can insert products in their business" ON public.products;
CREATE POLICY "Managers can insert products in their business or platform anywhere"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_products'))
  );

DROP POLICY IF EXISTS "Managers can update products in their business" ON public.products;
CREATE POLICY "Managers can update products in their business or platform anywhere"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_products'))
  );

DROP POLICY IF EXISTS "Managers can delete products in their business" ON public.products;
CREATE POLICY "Managers can delete products in their business or platform anywhere"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_products'))
  );


-- Sales
DROP POLICY IF EXISTS "Users can read sales in their business" ON public.sales;
CREATE POLICY "Users can read sales in their business or platform read all"
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Users can insert sales in their business" ON public.sales;
CREATE POLICY "Users can insert sales in their business or platform anywhere"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND auth.uid() = salesperson_id AND public.has_permission('create_sales'))
  );

DROP POLICY IF EXISTS "Managers can update sales in their business" ON public.sales;
CREATE POLICY "Managers can update sales in their business or platform anywhere"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND public.has_permission('manage_sales'))
  );


-- Sale Items
DROP POLICY IF EXISTS "Users can read sale items in their business" ON public.sale_items;
CREATE POLICY "Users can read sale items in their business or platform read all"
  ON public.sale_items
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Users can insert sale items in their business" ON public.sale_items;
CREATE POLICY "Users can insert sale items in their business or platform anywhere"
  ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND s.salesperson_id = auth.uid()
    ))
  );


-- Stock Movements
DROP POLICY IF EXISTS "Users can read stock movements in their business" ON public.stock_movements;
CREATE POLICY "Users can read stock movements in their business or platform read all"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (public.has_permission('manage_platform') OR business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Staff can insert stock movements in their business" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements in their business or platform anywhere"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR 
    (business_id = public.get_user_business_id() AND user_id = auth.uid() AND public.has_permission('manage_inventory'))
  );
