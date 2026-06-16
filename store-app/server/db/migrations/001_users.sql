-- ============================================
-- Migration 001: Users Table
-- Store Management App — Auth Foundation
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Create the users table
-- This table mirrors auth.users and adds app-specific fields (role, name).
-- The `id` column references the Supabase auth user ID (UUID).
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'salesperson' CHECK (role IN ('manager', 'salesperson')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Helper Functions
-- Create helper function to check roles without infinite recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 4. RLS Policies

-- Users can read their own record
DROP POLICY IF EXISTS "Users can read own record" ON public.users;
CREATE POLICY "Users can read own record"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Managers can read all user records
DROP POLICY IF EXISTS "Managers can read all users" ON public.users;
CREATE POLICY "Managers can read all users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'manager');

-- Managers can insert new users
DROP POLICY IF EXISTS "Managers can insert users" ON public.users;
CREATE POLICY "Managers can insert users"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'manager');

-- Managers can update user records
DROP POLICY IF EXISTS "Managers can update users" ON public.users;
CREATE POLICY "Managers can update users"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'manager');

-- 4. Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 5. Create a function to automatically insert into public.users
--    when a new user is created via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'salesperson')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED DATA
-- ============================================
-- To create an initial manager account, run this AFTER the migration:
--
-- 1. Go to Supabase Dashboard > Authentication > Users > Add User
--    Email: manager@store.com
--    Password: Manager123!
--    (or use the SQL below)
--
-- 2. The trigger above will auto-create the public.users record
--    with role='salesperson'. Update it to 'manager':
--
-- UPDATE public.users
-- SET role = 'manager', name = 'Store Manager'
-- WHERE email = 'manager@store.com';
--
-- ============================================
