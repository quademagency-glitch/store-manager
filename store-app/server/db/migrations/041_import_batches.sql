-- ============================================
-- Migration 041: Bulk Import Batches
-- Tracks CSV/Excel imports (products, customers, suppliers)
-- so a batch can be reported on and undone.
-- ============================================

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('products', 'customers', 'suppliers')),
  source_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'committing', 'committed', 'failed', 'undone')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  undo_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read import batches in their business" ON public.import_batches;
CREATE POLICY "Users can read import batches in their business"
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (
    business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

DROP POLICY IF EXISTS "Users with manage_financials can write import batches" ON public.import_batches;
CREATE POLICY "Users with manage_financials can write import batches"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials'))
  )
  WITH CHECK (
    public.has_permission('manage_platform')
    OR (business_id = public.get_user_business_id() AND public.has_permission('manage_financials'))
  );

CREATE INDEX IF NOT EXISTS idx_import_batches_business ON public.import_batches(business_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON public.import_batches(status);

-- Tag columns on every entity an importer can create. Nullable + ON DELETE SET NULL
-- so deleting/undoing a batch record never blocks deleting the entities it created
-- (and vice versa: deleting an entity never blocks deleting its batch record).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_import_batch ON public.products(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_import_batch ON public.customers(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_import_batch ON public.suppliers(import_batch_id) WHERE import_batch_id IS NOT NULL;
