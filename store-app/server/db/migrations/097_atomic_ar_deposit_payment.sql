-- ============================================
-- Migration 097: pay an AR invoice from a customer's deposit, atomically
--
-- routes/accountsReceivable.js debited store_credit_ledger and then called
-- record_ar_payment as a second, separate request. When the second step
-- failed (the invoice was voided, or a payment recorded a moment earlier
-- left less outstanding than this one), the deposit stayed spent and the
-- invoice stayed unpaid. Both now happen in one transaction.
--
-- Overdrafts are refused by the lock_credit_balance trigger (083), which
-- locks the customer row and recomputes the balance on every insert.
-- ============================================

CREATE OR REPLACE FUNCTION public.record_ar_deposit_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_notes TEXT,
  p_user_id UUID,
  p_business_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, customer_id, invoice_number INTO v_invoice
    FROM ar_invoices WHERE id = p_invoice_id AND business_id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0001'; END IF;
  IF v_invoice.customer_id IS NULL THEN
    RAISE EXCEPTION 'This invoice has no customer whose deposit could pay it' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO store_credit_ledger (customer_id, business_id, type, amount, note)
  VALUES (v_invoice.customer_id, p_business_id, 'redeem', -p_amount,
          'Payment for AR Invoice #' || v_invoice.invoice_number);

  RETURN record_ar_payment(p_invoice_id, p_amount, 'customer_deposit', p_payment_date,
                           NULL, p_notes, p_user_id, p_business_id, false, 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.record_ar_deposit_payment(UUID, NUMERIC, DATE, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ar_deposit_payment(UUID, NUMERIC, DATE, TEXT, UUID, UUID) TO service_role;
