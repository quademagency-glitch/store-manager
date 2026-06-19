-- ============================================
-- Migration 045: AR/AP Document Numbering
-- Race-safe sequential invoice/bill numbers, modeled directly on the
-- existing generate_po_number()/po_number_sequences pattern (migration 033).
-- ============================================

CREATE TABLE IF NOT EXISTS public.ar_invoice_number_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ap_bill_number_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_ar_invoice_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO public.ar_invoice_number_sequences (business_id, last_number)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
  SET last_number = ar_invoice_number_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'INV-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_ap_bill_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO public.ap_bill_number_sequences (business_id, last_number)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
  SET last_number = ap_bill_number_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'BILL-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
