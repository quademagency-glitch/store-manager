-- ============================================
-- Migration 066: Business and per-location country
--
-- Phone numbers are entered without a country code — staff type what is
-- written on the receipt. The country that turns `024 123 4567` into
-- `+233241234567` comes from here.
--
-- Mirrors the currency pattern from migration 057: a business-level default
-- with an optional per-location override, because a multi-location business
-- can genuinely span countries (a Ghana branch and a Nigeria branch). NULL on
-- a location means "inherit the business's country".
--
-- ISO 3166-1 alpha-2, which is what libphonenumber expects.
-- ============================================

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS country TEXT;

-- Seed from the currency already on record, so existing businesses get a
-- sensible default without anyone editing settings. Only fills rows where
-- country is still unset, so it is safe to re-run and never overwrites a
-- deliberate choice.
UPDATE public.businesses
SET country = CASE currency
  WHEN 'GHS' THEN 'GH'
  WHEN 'NGN' THEN 'NG'
  WHEN 'KES' THEN 'KE'
  WHEN 'ZAR' THEN 'ZA'
  WHEN 'USD' THEN 'US'
  WHEN 'GBP' THEN 'GB'
  WHEN 'EUR' THEN 'DE'
  ELSE NULL
END
WHERE country IS NULL;

-- XOF and XAF are shared by several countries each, so currency cannot imply
-- one — those businesses are left NULL and fall back to the device locale
-- until someone sets it explicitly.

UPDATE public.locations l
SET country = CASE l.currency
  WHEN 'GHS' THEN 'GH'
  WHEN 'NGN' THEN 'NG'
  WHEN 'KES' THEN 'KE'
  WHEN 'ZAR' THEN 'ZA'
  WHEN 'USD' THEN 'US'
  WHEN 'GBP' THEN 'GB'
  WHEN 'EUR' THEN 'DE'
  ELSE NULL
END
WHERE l.country IS NULL AND l.currency IS NOT NULL;

COMMENT ON COLUMN public.businesses.country IS
  'ISO 3166-1 alpha-2. Default country for parsing phone numbers entered without a country code.';
COMMENT ON COLUMN public.locations.country IS
  'ISO 3166-1 alpha-2. Overrides the business country for this location; NULL inherits.';
