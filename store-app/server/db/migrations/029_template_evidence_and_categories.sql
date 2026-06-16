-- Migration 029: Add require_receipt, account_category, and gl_code to accounting templates
-- These fields enable mandatory evidence enforcement and financial categorization

ALTER TABLE public.accounting_templates
ADD COLUMN IF NOT EXISTS require_receipt BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS account_category TEXT,
ADD COLUMN IF NOT EXISTS gl_code TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN public.accounting_templates.require_receipt IS 'When true, entries created from this template must include a receipt/evidence document';
COMMENT ON COLUMN public.accounting_templates.account_category IS 'Financial category for grouping entries (e.g., Operating Expense, Utilities, Revenue)';
COMMENT ON COLUMN public.accounting_templates.gl_code IS 'Optional General Ledger code for chart of accounts mapping';
