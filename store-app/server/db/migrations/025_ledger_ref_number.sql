-- ============================================
-- Migration 025: Ledger Reference Numbers
-- Adds a human-readable, race-safe reference number to business_ledger
-- entries (expenses, bank deposits, pay-ins), modeled on the
-- generate_po_number() sequence pattern used elsewhere in this codebase.
-- ============================================

CREATE TABLE IF NOT EXISTS public.ledger_ref_number_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_ledger_ref_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO public.ledger_ref_number_sequences (business_id, last_number)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
  SET last_number = ledger_ref_number_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'LDG-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.business_ledger ADD COLUMN IF NOT EXISTS ref_number TEXT;

CREATE OR REPLACE FUNCTION public.set_ledger_ref_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ref_number IS NULL THEN
    NEW.ref_number := public.generate_ledger_ref_number(NEW.business_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ledger_ref_number ON public.business_ledger;
CREATE TRIGGER trg_set_ledger_ref_number
  BEFORE INSERT ON public.business_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ledger_ref_number();
