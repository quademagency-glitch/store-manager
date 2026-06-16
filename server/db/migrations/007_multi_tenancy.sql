-- ============================================
-- Migration 007: Multi-Tenancy (Businesses)
-- Store Management App — Data Isolation
-- ============================================

-- 1. Create businesses table
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on businesses
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- 2. Create a default business for existing records (Migration fallback)
DO $$ 
DECLARE
  default_business_id UUID;
BEGIN
  INSERT INTO public.businesses (name) VALUES ('Default Business') 
  RETURNING id INTO default_business_id;

  -- 3. Add business_id to users
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
  UPDATE public.users SET business_id = default_business_id WHERE business_id IS NULL;
  ALTER TABLE public.users ALTER COLUMN business_id SET NOT NULL;

  -- Add business_id to products
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
  UPDATE public.products SET business_id = default_business_id WHERE business_id IS NULL;
  ALTER TABLE public.products ALTER COLUMN business_id SET NOT NULL;

  -- Add business_id to sales
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
  UPDATE public.sales SET business_id = default_business_id WHERE business_id IS NULL;
  ALTER TABLE public.sales ALTER COLUMN business_id SET NOT NULL;

  -- Add business_id to sale_items
  ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
  UPDATE public.sale_items SET business_id = default_business_id WHERE business_id IS NULL;
  ALTER TABLE public.sale_items ALTER COLUMN business_id SET NOT NULL;

  -- Add business_id to stock_movements
  ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
  UPDATE public.stock_movements SET business_id = default_business_id WHERE business_id IS NULL;
  ALTER TABLE public.stock_movements ALTER COLUMN business_id SET NOT NULL;
END $$;

-- 4. Create Helper Function
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM public.users WHERE id = auth.uid();
$$;

-- 5. Update auth trigger to handle businesses
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
    -- Auto-create a new business for them
    INSERT INTO public.businesses (name) VALUES (v_user_name || '''s Business') RETURNING id INTO v_business_id;
    -- Since they created the business, they should probably be a Manager, but let's stick to the requested role or default
    -- If no role was explicitly provided, and they are creating a new business, make them a Manager
    IF NEW.raw_user_meta_data->>'role' IS NULL THEN
        v_role_name := 'Manager';
    END IF;
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

-- 6. Update RLS Policies

-- Businesses
DROP POLICY IF EXISTS "Users can read own business" ON public.businesses;
CREATE POLICY "Users can read own business"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (id = public.get_user_business_id());

DROP POLICY IF EXISTS "Managers can update own business" ON public.businesses;
CREATE POLICY "Managers can update own business"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (id = public.get_user_business_id() AND public.has_permission('manage_users'));

-- Users (Replace existing policies)
DROP POLICY IF EXISTS "Users can read own record" ON public.users;
CREATE POLICY "Users can read own record"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Managers can read all users" ON public.users;
CREATE POLICY "Managers can read all users in same business"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id() AND public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can insert users" ON public.users;
CREATE POLICY "Managers can insert users in same business"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (business_id = public.get_user_business_id() AND public.has_permission('manage_users'));

DROP POLICY IF EXISTS "Managers can update users" ON public.users;
CREATE POLICY "Managers can update users in same business"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (business_id = public.get_user_business_id() AND public.has_permission('manage_users'));

-- Products
DROP POLICY IF EXISTS "Anyone can read products" ON public.products;
CREATE POLICY "Users can read products in their business"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Managers can insert products" ON public.products;
CREATE POLICY "Managers can insert products in their business"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (business_id = public.get_user_business_id() AND public.has_permission('manage_products'));

DROP POLICY IF EXISTS "Managers can update products" ON public.products;
CREATE POLICY "Managers can update products in their business"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (business_id = public.get_user_business_id() AND public.has_permission('manage_products'));

DROP POLICY IF EXISTS "Managers can delete products" ON public.products;
CREATE POLICY "Managers can delete products in their business"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (business_id = public.get_user_business_id() AND public.has_permission('manage_products'));

-- Sales
DROP POLICY IF EXISTS "Authenticated users can read sales" ON public.sales;
CREATE POLICY "Users can read sales in their business"
  ON public.sales
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
CREATE POLICY "Users can insert sales in their business"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id() AND 
    auth.uid() = salesperson_id AND 
    public.has_permission('create_sales')
  );

DROP POLICY IF EXISTS "Managers can update sales" ON public.sales;
CREATE POLICY "Managers can update sales in their business"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (business_id = public.get_user_business_id() AND public.has_permission('manage_sales'));

-- Sale Items
DROP POLICY IF EXISTS "Authenticated users can read sale_items" ON public.sale_items;
CREATE POLICY "Users can read sale items in their business"
  ON public.sale_items
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Authenticated users can insert sale_items" ON public.sale_items;
CREATE POLICY "Users can insert sale items in their business"
  ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id() AND
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND s.salesperson_id = auth.uid()
    )
  );

-- Stock Movements
DROP POLICY IF EXISTS "Anyone can read stock movements" ON public.stock_movements;
CREATE POLICY "Users can read stock movements in their business"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements in their business"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id() AND
    user_id = auth.uid() AND
    public.has_permission('manage_inventory')
  );
