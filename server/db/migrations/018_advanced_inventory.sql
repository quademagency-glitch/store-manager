-- ============================================
-- Migration 018: Advanced Inventory & Warehouse Operations
-- Store Management App — Transfers, Audits, Batches, QR Codes
-- ============================================

-- 1. Update stock_movements CHECK constraint to include new types
-- Drop the old constraint and recreate with new values
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('SALE', 'RECEIPT', 'ADJUSTMENT', 'RETURN', 'SHRINKAGE', 'TRANSFER_OUT', 'TRANSFER_IN', 'AUDIT'));

-- 2. Add qr_code_data to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS qr_code_data TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_qr_code_data ON public.products(qr_code_data) WHERE qr_code_data IS NOT NULL;

-- Auto-populate qr_code_data for existing products from their SKU
UPDATE public.products SET qr_code_data = sku WHERE qr_code_data IS NULL;

-- 3. Create stock_transfers table
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  from_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  to_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  initiated_by UUID NOT NULL REFERENCES public.users(id),
  completed_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT different_locations CHECK (from_location_id != to_location_id)
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read transfers in their business
DROP POLICY IF EXISTS "Users can read stock transfers in their business" ON public.stock_transfers;
CREATE POLICY "Users can read stock transfers in their business"
  ON public.stock_transfers
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR
    business_id = public.get_user_business_id()
  );

-- RLS: Inventory managers can create transfers
DROP POLICY IF EXISTS "Managers can create stock transfers" ON public.stock_transfers;
CREATE POLICY "Managers can create stock transfers"
  ON public.stock_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR
    (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- RLS: Inventory managers can update transfers (complete/cancel)
DROP POLICY IF EXISTS "Managers can update stock transfers" ON public.stock_transfers;
CREATE POLICY "Managers can update stock transfers"
  ON public.stock_transfers
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR
    (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_transfers_business ON public.stock_transfers(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_product ON public.stock_transfers(product_id);

-- 4. Create inventory_audits table
CREATE TABLE IF NOT EXISTS public.inventory_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_quantity INTEGER NOT NULL DEFAULT 0,
  counted_quantity INTEGER NOT NULL DEFAULT 0,
  discrepancy INTEGER NOT NULL GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  audited_by UUID NOT NULL REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read audits in their business
DROP POLICY IF EXISTS "Users can read inventory audits in their business" ON public.inventory_audits;
CREATE POLICY "Users can read inventory audits in their business"
  ON public.inventory_audits
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR
    business_id = public.get_user_business_id()
  );

-- RLS: Inventory managers can create audits
DROP POLICY IF EXISTS "Managers can create inventory audits" ON public.inventory_audits;
CREATE POLICY "Managers can create inventory audits"
  ON public.inventory_audits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR
    (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_audits_business ON public.inventory_audits(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_location ON public.inventory_audits(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_created ON public.inventory_audits(created_at DESC);

-- 5. Create product_batches table
CREATE TABLE IF NOT EXISTS public.product_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expiry_date DATE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  notes TEXT,
  UNIQUE(business_id, product_id, location_id, batch_number)
);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read batches in their business
DROP POLICY IF EXISTS "Users can read product batches in their business" ON public.product_batches;
CREATE POLICY "Users can read product batches in their business"
  ON public.product_batches
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR
    business_id = public.get_user_business_id()
  );

-- RLS: Inventory managers can create batches
DROP POLICY IF EXISTS "Managers can create product batches" ON public.product_batches;
CREATE POLICY "Managers can create product batches"
  ON public.product_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform') OR
    (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- RLS: Inventory managers can update batches (deduct quantities)
DROP POLICY IF EXISTS "Managers can update product batches" ON public.product_batches;
CREATE POLICY "Managers can update product batches"
  ON public.product_batches
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('manage_platform') OR
    (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_batches_business ON public.product_batches(business_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_product_batches_product_location ON public.product_batches(product_id, location_id);
