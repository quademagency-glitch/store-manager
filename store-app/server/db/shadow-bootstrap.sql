-- ============================================
-- Shadow-database bootstrap — TEST SCAFFOLD ONLY
--
-- NEVER run this against production. It fabricates the parts of Supabase's
-- managed surface that our migrations reference, so that a plain Postgres
-- cluster can accept them. On a real Supabase project these objects already
-- exist and are managed by the platform.
--
-- Needed because the migrations are Supabase-coupled: 32 of the 64 files
-- reference the `authenticated` role, 6 reference `auth.users`, 3 reference
-- `service_role`, and 1 references the `storage` schema. Without these a
-- rebuild fails on the first GRANT.
--
-- Used by db/schema-drift.js. See db/README.md.
-- ============================================

-- Supabase's three API roles. NOLOGIN: nothing authenticates as them here,
-- they exist purely so GRANT and RLS policy statements resolve.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- Only the columns our migrations actually touch. This is not GoTrue's real
-- table and is not meant to be — foreign keys to auth.users need a target,
-- and triggers on it need it to exist.
CREATE TABLE IF NOT EXISTS auth.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text,
  raw_user_meta_data jsonb,
  created_at    timestamptz DEFAULT now()
);

-- Migrations call auth.uid() inside RLS policies. Returns NULL here; policies
-- only need it to exist so the expression parses and the policy is recorded.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

-- Migrations call uuid_generate_v4(); Supabase ships uuid-ossp enabled.
--
-- Installed into a dedicated `extensions` schema, as Supabase does, NOT into
-- public. Installing them in public adds ~46 functions and ~22 grants there,
-- all of which then show up as drift against production and bury the real
-- signal. The search_path below keeps the bare function names resolvable.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   SCHEMA extensions;
-- Dynamic: the database is `shadow` when this script creates the cluster, but
-- an arbitrary name when SHADOW_DATABASE_URL points at an existing one.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO public, extensions', current_database());
END
$$;
-- ALTER DATABASE only affects new sessions, and the migrations run in this one.
SET search_path TO public, extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Migration 026 attaches storage policies to storage.buckets.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id      text PRIMARY KEY,
  name    text NOT NULL,
  public  boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name      text,
  owner     uuid
);

GRANT USAGE ON SCHEMA public  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- Supabase's default privilege posture on a new project. Without this the
-- shadow starts locked down while production starts open, and every table
-- would show as a grant difference — drowning the real signal. Migration 063
-- is precisely the work of *narrowing* these, so the baseline has to match or
-- the comparison is meaningless.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
