-- Add verification columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_code TEXT;
