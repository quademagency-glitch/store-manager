-- ============================================
-- Migration 020: QR & POS Integration Foundation
-- Phase 1 - Scanner Link & Inventory Two-Stage Tracking
-- ============================================

-- 1. Users: Add scanner session tracking
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS scanner_session_token UUID,
  ADD COLUMN IF NOT EXISTS scanner_linked_at TIMESTAMPTZ;

-- 2. Customers: Add human-readable customer_code for privacy masking in Sold view
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- Index for quick lookups by customer code
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);

-- 3. Sales: Add receipt_number and allow 'pending' status
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- Drop and recreate the sales status check constraint to include 'pending'
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
DO $$
BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
    CHECK (status IN ('completed', 'voided', 'void_pending', 'pending'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Index for receipt numbers
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON public.sales(receipt_number);

-- 4. Inventory Units: Add 'pending_sale' status for temporary reservations
ALTER TABLE public.inventory_units DROP CONSTRAINT IF EXISTS inventory_units_status_check;
DO $$
BEGIN
  ALTER TABLE public.inventory_units ADD CONSTRAINT inventory_units_status_check
    CHECK (status IN ('in_stock', 'sold', 'damaged', 'lost', 'transferred', 'returned', 'pending_sale'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
