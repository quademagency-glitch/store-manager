-- ============================================
-- Migration 016: Customers & Permissions
-- Store Management App
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Create the customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure a phone number is unique within a single business
  UNIQUE(business_id, phone)
);

-- 2. Add customer_id to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 3. Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for customers
-- Note: business_id filtering will be handled by the backend using service_role or regular policies

-- All authenticated users can read customers
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
CREATE POLICY "Authenticated users can read customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (true);

-- Managers and Sales can insert customers (backend logic will restrict to proper business_id)
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
CREATE POLICY "Authenticated users can insert customers"
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only Business Admins can update/delete customers (backend handles check, but we add a broad policy for DB)
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
CREATE POLICY "Authenticated users can update customers"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
CREATE POLICY "Authenticated users can delete customers"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (true);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_business ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
