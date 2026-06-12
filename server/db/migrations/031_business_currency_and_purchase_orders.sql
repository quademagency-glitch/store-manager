-- Migration 031: Add currency field to businesses table
-- Allows each business to configure their operating currency for
-- consistent formatting across receipts, invoices, reports, and all documents.
-- Also future-proofs purchase order workflow with suppliers and PO tables.

-- ─── 1. Add currency column to businesses ───
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GHS';

COMMENT ON COLUMN public.businesses.currency IS 'ISO 4217 currency code for this business (e.g. GHS, USD, NGN, EUR)';

-- ─── 2. Suppliers table (future PO workflow) ───
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_tenant_isolation" ON public.suppliers
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

-- ─── 3. Purchase Orders table (future PO workflow) ───
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  expected_date DATE,
  received_date DATE,
  notes TEXT,
  total_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GHS',
  created_by UUID REFERENCES auth.users(id),
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_tenant_isolation" ON public.purchase_orders
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

-- ─── 4. Purchase Order Items table (future PO workflow) ───
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT
);

-- ─── 5. Indexes ───
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON public.suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_business ON public.purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON public.purchase_order_items(purchase_order_id);
