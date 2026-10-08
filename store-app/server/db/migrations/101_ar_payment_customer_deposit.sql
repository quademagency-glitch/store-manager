-- ============================================
-- Migration 101: allow paying an AR invoice from a customer's deposit
--
-- The Record Payment screen has offered "Customer Deposit" and the API has
-- accepted it, but ar_payments.payment_method (044) never allowed the value,
-- so every such payment failed at the last step. Before 097 the deposit had
-- already been debited by then, in a separate request, and stayed debited.
-- Found by the release check on 2026-10-08, where 097 rolled the debit back.
-- ============================================

ALTER TABLE public.ar_payments DROP CONSTRAINT IF EXISTS ar_payments_payment_method_check;
ALTER TABLE public.ar_payments ADD CONSTRAINT ar_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'customer_deposit', 'other'));
