-- ============================================
-- Migration 046: AR/AP Payment RPCs
-- Atomically records a payment, optionally posts a linked business_ledger
-- entry (for cash/mobile_money methods, so till reconciliation stays
-- accurate), and updates the invoice/bill's running balance and status.
-- Same rationale as process_sale_transaction (migration 022): multiple
-- table writes that must not partially commit.
-- ============================================

CREATE OR REPLACE FUNCTION public.record_ar_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_location_id UUID,
  p_notes TEXT,
  p_user_id UUID,
  p_business_id UUID,
  p_post_to_ledger BOOLEAN,
  p_ledger_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice RECORD;
  v_outstanding NUMERIC;
  v_new_amount_paid NUMERIC;
  v_new_status TEXT;
  v_ledger_entry_id UUID;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM public.ar_invoices WHERE id = p_invoice_id AND business_id = p_business_id FOR UPDATE;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'Cannot record a payment against a voided invoice';
  END IF;

  v_outstanding := v_invoice.total_amount - v_invoice.amount_paid;
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, v_outstanding;
  END IF;

  IF p_post_to_ledger THEN
    INSERT INTO public.business_ledger (
      business_id, location_id, user_id, type, amount, description,
      status, date, metadata, approved_by, approved_at
    ) VALUES (
      p_business_id, p_location_id, p_user_id, 'pay_in', p_amount,
      'AR payment received — Invoice ' || v_invoice.invoice_number,
      p_ledger_status, p_payment_date,
      jsonb_build_object('ar_invoice_id', p_invoice_id),
      CASE WHEN p_ledger_status = 'approved' THEN p_user_id ELSE NULL END,
      CASE WHEN p_ledger_status = 'approved' THEN now() ELSE NULL END
    ) RETURNING id INTO v_ledger_entry_id;
  END IF;

  INSERT INTO public.ar_payments (
    business_id, invoice_id, amount, payment_method, payment_date,
    location_id, notes, ledger_entry_id, created_by
  ) VALUES (
    p_business_id, p_invoice_id, p_amount, p_payment_method, p_payment_date,
    p_location_id, p_notes, v_ledger_entry_id, p_user_id
  ) RETURNING id INTO v_payment_id;

  v_new_amount_paid := v_invoice.amount_paid + p_amount;
  v_new_status := CASE WHEN v_new_amount_paid >= v_invoice.total_amount THEN 'paid' ELSE 'partial' END;

  UPDATE public.ar_invoices
  SET amount_paid = v_new_amount_paid, status = v_new_status, updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'ledger_entry_id', v_ledger_entry_id,
    'new_amount_paid', v_new_amount_paid,
    'new_status', v_new_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ap_payment(
  p_bill_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_location_id UUID,
  p_notes TEXT,
  p_user_id UUID,
  p_business_id UUID,
  p_post_to_ledger BOOLEAN,
  p_ledger_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill RECORD;
  v_outstanding NUMERIC;
  v_new_amount_paid NUMERIC;
  v_new_status TEXT;
  v_ledger_entry_id UUID;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_bill FROM public.ap_bills WHERE id = p_bill_id AND business_id = p_business_id FOR UPDATE;

  IF v_bill IS NULL THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_bill.status = 'void' THEN
    RAISE EXCEPTION 'Cannot record a payment against a voided bill';
  END IF;

  v_outstanding := v_bill.amount - v_bill.amount_paid;
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, v_outstanding;
  END IF;

  IF p_post_to_ledger THEN
    INSERT INTO public.business_ledger (
      business_id, location_id, user_id, type, amount, description,
      status, date, metadata, approved_by, approved_at
    ) VALUES (
      p_business_id, p_location_id, p_user_id, 'ap_payment', p_amount,
      'AP payment made — Bill ' || v_bill.bill_number,
      p_ledger_status, p_payment_date,
      jsonb_build_object('ap_bill_id', p_bill_id),
      CASE WHEN p_ledger_status = 'approved' THEN p_user_id ELSE NULL END,
      CASE WHEN p_ledger_status = 'approved' THEN now() ELSE NULL END
    ) RETURNING id INTO v_ledger_entry_id;
  END IF;

  INSERT INTO public.ap_payments (
    business_id, bill_id, amount, payment_method, payment_date,
    location_id, notes, ledger_entry_id, created_by
  ) VALUES (
    p_business_id, p_bill_id, p_amount, p_payment_method, p_payment_date,
    p_location_id, p_notes, v_ledger_entry_id, p_user_id
  ) RETURNING id INTO v_payment_id;

  v_new_amount_paid := v_bill.amount_paid + p_amount;
  v_new_status := CASE WHEN v_new_amount_paid >= v_bill.amount THEN 'paid' ELSE 'partial' END;

  UPDATE public.ap_bills
  SET amount_paid = v_new_amount_paid, status = v_new_status, updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'ledger_entry_id', v_ledger_entry_id,
    'new_amount_paid', v_new_amount_paid,
    'new_status', v_new_status
  );
END;
$$;
