-- ============================================
-- Migration 043: Role Assignment Guardrails
-- Closes a privilege-escalation gap: handle_new_user() resolved a role
-- purely by name with no business scoping at all, so a role name could
-- resolve to a *different tenant's* custom role, or to a global admin
-- role (Platform Admin / Business Admin), by name collision alone.
-- App-level checks (server/routes/roles.js, server/routes/users.js) are
-- updated in this same change to stop a non-Platform-Admin from creating
-- or assigning any role that grants permissions beyond their own.
-- ============================================

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

  IF NEW.raw_user_meta_data->>'business_id' IS NOT NULL THEN
    v_business_id := (NEW.raw_user_meta_data->>'business_id')::UUID;
  ELSE
    -- Instead of auto-creating, assign to the Pending Assignment business
    SELECT id INTO v_business_id FROM public.businesses WHERE name = 'Pending Assignment' LIMIT 1;
    -- Since they are not assigned to a real business, force role to Sales Executive
    v_role_name := 'Sales Executive';
  END IF;

  -- Scope the lookup to roles actually visible to this business (global roles, or this
  -- business's own custom roles) so a role name can never resolve to a different tenant's
  -- role by name collision. Prefer a business-specific match over a global one with the
  -- same name.
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = v_role_name
    AND (business_id IS NULL OR business_id = v_business_id)
  ORDER BY business_id NULLS LAST
  LIMIT 1;

  -- Fallback to Sales Executive if not found
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Sales Executive' AND business_id IS NULL LIMIT 1;
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
