-- ============================================
-- Migration 013: Fix Users Primary Key & Constraints
-- Store Management App — Fix User Creation Bug
-- ============================================

-- If a unique constraint was accidentally added to role_id, drop it
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_id_key;

-- Ensure the primary key is correctly set to `id`
-- First drop the existing primary key if it's incorrect
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_pkey;

-- Re-add the primary key on `id`
ALTER TABLE public.users ADD PRIMARY KEY (id);

-- Also fix the trigger to fallback to 'Sales Executive' instead of 'Salesperson'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id UUID;
  v_role_name TEXT;
  v_business_id UUID;
  v_user_name TEXT;
BEGIN
  v_role_name := COALESCE(NEW.raw_user_meta_data->>'role', 'Sales Executive');
  v_user_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  
  -- Check if they provided a business_id (e.g., from an invite)
  IF NEW.raw_user_meta_data->>'business_id' IS NOT NULL THEN
    v_business_id := (NEW.raw_user_meta_data->>'business_id')::UUID;
  ELSE
    -- Instead of auto-creating, assign to the Pending Assignment business
    SELECT id INTO v_business_id FROM public.businesses WHERE name = 'Pending Assignment' LIMIT 1;
    -- Since they are not assigned to a real business, force role to Sales Executive
    v_role_name := 'Sales Executive';
  END IF;

  -- Try to find the exact role by name
  SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name LIMIT 1;
  
  -- Fallback to Sales Executive if not found
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Sales Executive' LIMIT 1;
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
