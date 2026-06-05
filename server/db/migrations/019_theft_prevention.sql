-- ============================================
-- Migration 019: Theft Prevention & Unit-Level Inventory Tracking
-- QR Code Pool, Inventory Units, Stock Take, Business Settings
-- ============================================

-- ============================================
-- 1. QR CODE POOL (Platform Admin generates in bulk)
-- ============================================

-- Batch metadata
CREATE TABLE IF NOT EXISTS public.qr_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  prefix TEXT NOT NULL DEFAULT 'QR',
  generated_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_batches ENABLE ROW LEVEL SECURITY;

-- Only Platform Admins can see/create QR batches (they're global, not business-scoped)
DROP POLICY IF EXISTS "Platform Admins can read qr_batches" ON public.qr_batches;
CREATE POLICY "Platform Admins can read qr_batches"
  ON public.qr_batches FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform Admins can create qr_batches" ON public.qr_batches;
CREATE POLICY "Platform Admins can create qr_batches"
  ON public.qr_batches FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

-- QR code pool (individual codes)
CREATE TABLE IF NOT EXISTS public.qr_code_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  batch_id UUID NOT NULL REFERENCES public.qr_batches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'assigned', 'voided')),
  generated_by UUID NOT NULL REFERENCES public.users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_code_pool ENABLE ROW LEVEL SECURITY;

-- Platform Admins can read all QR codes
DROP POLICY IF EXISTS "Platform Admins can read qr_code_pool" ON public.qr_code_pool;
CREATE POLICY "Platform Admins can read qr_code_pool"
  ON public.qr_code_pool FOR SELECT TO authenticated
  USING (public.has_permission('manage_platform'));

-- Business users can read unassigned codes (for assignment) and assigned codes in their units
DROP POLICY IF EXISTS "Users can read unassigned qr codes" ON public.qr_code_pool;
CREATE POLICY "Users can read unassigned qr codes"
  ON public.qr_code_pool FOR SELECT TO authenticated
  USING (
    status = 'unassigned'
    OR EXISTS (
      SELECT 1 FROM public.inventory_units iu
      WHERE iu.qr_code_id = qr_code_pool.id
      AND iu.business_id = public.get_user_business_id()
    )
  );

DROP POLICY IF EXISTS "Platform Admins can create qr_code_pool" ON public.qr_code_pool;
CREATE POLICY "Platform Admins can create qr_code_pool"
  ON public.qr_code_pool FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('manage_platform'));

DROP POLICY IF EXISTS "Platform Admins can update qr_code_pool" ON public.qr_code_pool;
CREATE POLICY "Platform Admins can update qr_code_pool"
  ON public.qr_code_pool FOR UPDATE TO authenticated
  USING (public.has_permission('manage_platform'));

-- Business users can update QR status to 'assigned' when assigning to units
DROP POLICY IF EXISTS "Users can assign qr codes" ON public.qr_code_pool;
CREATE POLICY "Users can assign qr codes"
  ON public.qr_code_pool FOR UPDATE TO authenticated
  USING (status = 'unassigned');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qr_code_pool_batch ON public.qr_code_pool(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_pool_status ON public.qr_code_pool(status);
CREATE INDEX IF NOT EXISTS idx_qr_code_pool_code ON public.qr_code_pool(code);

-- ============================================
-- 2. INVENTORY UNITS (Unit-level tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS public.inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  qr_code_id UUID NOT NULL REFERENCES public.qr_code_pool(id),
  status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock', 'sold', 'damaged', 'lost', 'transferred', 'returned')),
  batch_id UUID REFERENCES public.product_batches(id),
  assigned_by UUID NOT NULL REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at TIMESTAMPTZ,
  sold_in_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  notes TEXT
);

ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read inventory units in their business" ON public.inventory_units;
CREATE POLICY "Users can read inventory units in their business"
  ON public.inventory_units FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR business_id = public.get_user_business_id()
  );

DROP POLICY IF EXISTS "Users can create inventory units" ON public.inventory_units;
CREATE POLICY "Users can create inventory units"
  ON public.inventory_units FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

DROP POLICY IF EXISTS "Users can update inventory units" ON public.inventory_units;
CREATE POLICY "Users can update inventory units"
  ON public.inventory_units FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_units_business ON public.inventory_units(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_product ON public.inventory_units(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_location ON public.inventory_units(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_status ON public.inventory_units(status);
CREATE INDEX IF NOT EXISTS idx_inventory_units_qr ON public.inventory_units(qr_code_id);

-- ============================================
-- 3. STOCK TAKE SESSIONS & SCANS
-- ============================================

CREATE TABLE IF NOT EXISTS public.stock_take_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_by UUID NOT NULL REFERENCES public.users(id),
  completed_at TIMESTAMPTZ,
  expected_count INTEGER NOT NULL DEFAULT 0,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_take_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read stock take sessions in their business" ON public.stock_take_sessions;
CREATE POLICY "Users can read stock take sessions in their business"
  ON public.stock_take_sessions FOR SELECT TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR business_id = public.get_user_business_id()
  );

DROP POLICY IF EXISTS "Managers can create stock take sessions" ON public.stock_take_sessions;
CREATE POLICY "Managers can create stock take sessions"
  ON public.stock_take_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

DROP POLICY IF EXISTS "Managers can update stock take sessions" ON public.stock_take_sessions;
CREATE POLICY "Managers can update stock take sessions"
  ON public.stock_take_sessions FOR UPDATE TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_inventory'))
  );

-- Scans
CREATE TABLE IF NOT EXISTS public.stock_take_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.stock_take_sessions(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.inventory_units(id),
  qr_code TEXT NOT NULL,
  scan_result TEXT NOT NULL DEFAULT 'found'
    CHECK (scan_result IN ('found', 'unknown', 'wrong_location', 'already_sold')),
  scanned_by UUID NOT NULL REFERENCES public.users(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_take_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read stock take scans in their business" ON public.stock_take_scans;
CREATE POLICY "Users can read stock take scans in their business"
  ON public.stock_take_scans FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_take_sessions s
      WHERE s.id = stock_take_scans.session_id
      AND (public.has_permission('manage_platform') OR s.business_id = public.get_user_business_id())
    )
  );

DROP POLICY IF EXISTS "Users can create stock take scans" ON public.stock_take_scans;
CREATE POLICY "Users can create stock take scans"
  ON public.stock_take_scans FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_take_sessions s
      WHERE s.id = stock_take_scans.session_id
      AND s.status = 'in_progress'
      AND (public.has_permission('manage_platform') OR s.business_id = public.get_user_business_id())
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_take_sessions_business ON public.stock_take_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_sessions_location ON public.stock_take_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_sessions_status ON public.stock_take_sessions(status);
CREATE INDEX IF NOT EXISTS idx_stock_take_scans_session ON public.stock_take_scans(session_id);

-- ============================================
-- 4. BUSINESS SETTINGS (Theft Prevention Config)
-- ============================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS max_discount_percent NUMERIC(5,2) DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS manager_pin_required BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_hours_start TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS business_hours_end TIME DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS business_timezone TEXT DEFAULT 'UTC';

-- Manager PIN on users (bcrypt hashed, nullable — only set for managers)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS manager_pin TEXT;

-- ============================================
-- 5. EXPAND ALERT TYPES & ADD SEVERITY
-- ============================================

ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN (
    'VOID', 'VOID_REQUEST', 'DISCOUNT', 'HIGH_DISCOUNT',
    'SHRINKAGE', 'CASH_OVERRIDE', 'LOW_STOCK',
    'SUSPICIOUS_PATTERN', 'AUDIT_DISCREPANCY',
    'STOCK_TAKE_MISSING', 'AFTER_HOURS'
  ));

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
-- Add check constraint for severity (separate to be safe with IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_severity_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE public.alerts ADD CONSTRAINT alerts_severity_check
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================
-- 6. ADD void_pending SALE STATUS
-- ============================================

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
-- Only add if there is a check constraint to replace (some schemas may use enum)
DO $$
BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
    CHECK (status IN ('completed', 'voided', 'void_pending'));
EXCEPTION WHEN OTHERS THEN
  NULL; -- Constraint may already exist or column may be unconstrained
END $$;
