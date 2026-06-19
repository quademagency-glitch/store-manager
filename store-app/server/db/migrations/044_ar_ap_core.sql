-- ============================================
-- Migration 044: Accounts Receivable / Accounts Payable Core
-- Customer invoices and supplier bills, with partial/full payments
-- and opening-balance entries for pre-existing debt carried over
-- from a business's previous bookkeeping.
-- ============================================

-- ============== ACCOUNTS RECEIVABLE ==============

CREATE TABLE IF NOT EXISTS public.ar_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  is_opening_balance BOOLEAN NOT NULL DEFAULT false,
  as_of_date DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'void')),
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, invoice_number),
  CONSTRAINT ar_opening_requires_asof CHECK (NOT is_opening_balance OR as_of_date IS NOT NULL),
  CONSTRAINT ar_paid_not_over_amount CHECK (amount_paid <= amount)
);

CREATE TABLE IF NOT EXISTS public.ar_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.ar_invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id UUID REFERENCES public.locations(id),
  notes TEXT,
  ledger_entry_id UUID REFERENCES public.business_ledger(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ar_payment_till_method_requires_location CHECK (payment_method NOT IN ('cash', 'mobile_money') OR location_id IS NOT NULL)
);

-- ============== ACCOUNTS PAYABLE ==============

CREATE TABLE IF NOT EXISTS public.ap_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  bill_number TEXT NOT NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  is_opening_balance BOOLEAN NOT NULL DEFAULT false,
  as_of_date DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'void')),
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, bill_number),
  CONSTRAINT ap_opening_requires_asof CHECK (NOT is_opening_balance OR as_of_date IS NOT NULL),
  CONSTRAINT ap_paid_not_over_amount CHECK (amount_paid <= amount)
);

CREATE TABLE IF NOT EXISTS public.ap_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES public.ap_bills(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id UUID REFERENCES public.locations(id),
  notes TEXT,
  ledger_entry_id UUID REFERENCES public.business_ledger(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ap_payment_till_method_requires_location CHECK (payment_method NOT IN ('cash', 'mobile_money') OR location_id IS NOT NULL)
);

-- ============== business_ledger: add ap_payment type ==============
-- (AR cash receipts reuse the existing 'pay_in' type — same balance-increasing
-- semantics as a sale, already handled correctly everywhere pay_in is read.)

ALTER TABLE public.business_ledger DROP CONSTRAINT IF EXISTS business_ledger_type_check;
ALTER TABLE public.business_ledger ADD CONSTRAINT business_ledger_type_check
  CHECK (type IN ('expense', 'deposit_to_bank', 'pay_in', 'ap_payment'));

-- ============== RLS ==============

ALTER TABLE public.ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read ar_invoices in their business" ON public.ar_invoices;
CREATE POLICY "Users can read ar_invoices in their business"
  ON public.ar_invoices FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Users with manage_financials can write ar_invoices" ON public.ar_invoices;
CREATE POLICY "Users with manage_financials can write ar_invoices"
  ON public.ar_invoices FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')))
  WITH CHECK (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')));

DROP POLICY IF EXISTS "Users can read ar_payments in their business" ON public.ar_payments;
CREATE POLICY "Users can read ar_payments in their business"
  ON public.ar_payments FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Users with manage_financials can write ar_payments" ON public.ar_payments;
CREATE POLICY "Users with manage_financials can write ar_payments"
  ON public.ar_payments FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')))
  WITH CHECK (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')));

DROP POLICY IF EXISTS "Users can read ap_bills in their business" ON public.ap_bills;
CREATE POLICY "Users can read ap_bills in their business"
  ON public.ap_bills FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Users with manage_financials can write ap_bills" ON public.ap_bills;
CREATE POLICY "Users with manage_financials can write ap_bills"
  ON public.ap_bills FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')))
  WITH CHECK (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')));

DROP POLICY IF EXISTS "Users can read ap_payments in their business" ON public.ap_payments;
CREATE POLICY "Users can read ap_payments in their business"
  ON public.ap_payments FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id() OR public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Users with manage_financials can write ap_payments" ON public.ap_payments;
CREATE POLICY "Users with manage_financials can write ap_payments"
  ON public.ap_payments FOR ALL TO authenticated
  USING (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')))
  WITH CHECK (public.has_permission('manage_platform') OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials')));

-- ============== Indexes ==============

CREATE INDEX IF NOT EXISTS idx_ar_invoices_business ON public.ar_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_customer ON public.ar_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_status ON public.ar_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_due_date ON public.ar_invoices(due_date) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_ar_invoices_import_batch ON public.ar_invoices(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ar_payments_business ON public.ar_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_ar_payments_invoice ON public.ar_payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_ap_bills_business ON public.ap_bills(business_id);
CREATE INDEX IF NOT EXISTS idx_ap_bills_supplier ON public.ap_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_bills_status ON public.ap_bills(status);
CREATE INDEX IF NOT EXISTS idx_ap_bills_due_date ON public.ap_bills(due_date) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_ap_bills_import_batch ON public.ap_bills(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ap_payments_business ON public.ap_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_bill ON public.ap_payments(bill_id);
