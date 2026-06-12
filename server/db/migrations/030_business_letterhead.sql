-- Migration 030: Add new business fields and letterhead JSONB
-- Extends the businesses table for the Organization Settings redesign

ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS letterhead JSONB DEFAULT '{}'::jsonb;

-- Documentation
COMMENT ON COLUMN public.businesses.phone IS 'Business contact phone number';
COMMENT ON COLUMN public.businesses.address_line1 IS 'Business street address';
COMMENT ON COLUMN public.businesses.city IS 'Business city or town';
COMMENT ON COLUMN public.businesses.region IS 'Business region or state';
COMMENT ON COLUMN public.businesses.letterhead IS 'JSONB config for document letterhead (company_name, tagline, address, phone, email, registration_no, footer_text, show_logo, show_border, accent_color)';
