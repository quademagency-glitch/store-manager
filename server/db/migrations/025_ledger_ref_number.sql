-- ============================================
-- Migration 025: Add reference number to ledger
-- ============================================

ALTER TABLE public.business_ledger ADD COLUMN IF NOT EXISTS reference_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 100000);
