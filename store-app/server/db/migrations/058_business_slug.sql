-- ============================================
-- Migration 058: Business Slug (per-business subdomain link)
-- Adds a unique, URL-safe slug to businesses, auto-derived from their
-- name, used to brand the login page at slug.quaderp.app.
-- ============================================

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Normalizes a business name into a URL-safe slug: lowercase, non-alphanumeric
-- runs collapsed to single hyphens, leading/trailing hyphens trimmed.
CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Generates a unique slug for a business, appending -2, -3, ... on collision.
CREATE OR REPLACE FUNCTION public.generate_unique_business_slug(p_name TEXT, p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INT := 1;
BEGIN
  v_base := public.slugify(p_name);
  IF v_base = '' THEN
    v_base := 'business';
  END IF;

  v_candidate := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.businesses
    WHERE slug = v_candidate AND id IS DISTINCT FROM p_business_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Auto-assigns a slug on insert. The slug is intentionally stable after
-- that — renaming a business later does not change its URL.
CREATE OR REPLACE FUNCTION public.set_business_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.generate_unique_business_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_business_slug ON public.businesses;
CREATE TRIGGER trg_set_business_slug
  BEFORE INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_business_slug();

-- Backfill existing businesses that predate this migration.
UPDATE public.businesses
SET slug = public.generate_unique_business_slug(name, id)
WHERE slug IS NULL;

ALTER TABLE public.businesses ALTER COLUMN slug SET NOT NULL;

-- No RLS change here: the login-branding lookup goes through a server route
-- using the service-role client (server/routes/businesses.js), which returns
-- only {id, name, logo_url, status} rather than exposing the whole table to
-- anonymous clients via PostgREST.
