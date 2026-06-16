-- Migration 038: Platform Communications & Settings
-- Creates tables for storing platform-wide settings (like SMS API keys) and communication templates.

-- 1. Platform Settings Table
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default Arkesel setting keys if they don't exist
INSERT INTO platform_settings (key, value, description, is_secret)
VALUES 
  ('ARKESEL_API_KEY', '', 'Arkesel SMS API V2 Key', true),
  ('ARKESEL_SENDER_ID', 'QUADEM', 'Arkesel SMS Sender ID (max 11 chars)', false)
ON CONFLICT (key) DO NOTHING;

-- 2. Communication Templates Table
CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms')),
  subject VARCHAR(255), -- Only relevant for emails
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure RLS is enabled and only accessible by platform admins (assuming existing role checks, but for now we can bypass or set appropriate policies)
-- Given the current structure, backend usually bypasses RLS using service role key or specific RPCs.
-- Just basic RLS setup
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read communication templates (for the UI)
CREATE POLICY "Allow read access to templates for authenticated users" 
ON communication_templates FOR SELECT 
TO authenticated 
USING (true);

-- Backend handles insert/update via service_role key, so we don't need extensive policies here unless needed by client.
