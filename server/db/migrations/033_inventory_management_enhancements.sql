-- ============================================
-- Migration 033: Inventory Management System Enhancements
-- Fully idempotent — safe to re-run.
-- Builds on 031's base suppliers/purchase_orders/purchase_order_items tables.
-- ============================================

-- ─── 1. Extend suppliers with procurement metadata ───
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7;

COMMENT ON COLUMN public.suppliers.payment_terms IS 'Payment terms e.g. Net 30, COD, Net 60';
COMMENT ON COLUMN public.suppliers.lead_time_days IS 'Average delivery lead time in days for reorder calculations';

-- ─── 2. Add total column + auto-compute trigger on purchase_order_items ───
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_po_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total := NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_item_total ON public.purchase_order_items;
CREATE TRIGGER trg_po_item_total
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_po_item_total();

-- ─── 3. Auto-recompute purchase_orders.total_amount from line items ───
CREATE OR REPLACE FUNCTION public.update_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.purchase_orders
  SET total_amount = COALESCE((
    SELECT SUM(quantity * unit_cost)
    FROM public.purchase_order_items
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
  ), 0),
  updated_at = now()
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_po_total ON public.purchase_order_items;
CREATE TRIGGER trg_update_po_total
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_po_total();

-- ─── 4. Auto-generate PO numbers per business ───
CREATE TABLE IF NOT EXISTS public.po_number_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.po_number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_seq_tenant_isolation" ON public.po_number_sequences;
CREATE POLICY "po_seq_tenant_isolation" ON public.po_number_sequences
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.generate_po_number(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO public.po_number_sequences (business_id, last_number)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
  SET last_number = po_number_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'PO-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ─── 5. RLS policies for purchase_order_items (missing from 031) ───
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_items_tenant_read" ON public.purchase_order_items;
CREATE POLICY "po_items_tenant_read" ON public.purchase_order_items
  FOR SELECT
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE business_id IN (
        SELECT business_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "po_items_tenant_write" ON public.purchase_order_items;
CREATE POLICY "po_items_tenant_write" ON public.purchase_order_items
  FOR ALL
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE business_id IN (
        SELECT business_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

-- ─── 6. Inventory Reorder Configuration ───
CREATE TABLE IF NOT EXISTS public.inventory_reorder_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  reorder_point INTEGER NOT NULL DEFAULT 10,
  reorder_quantity INTEGER NOT NULL DEFAULT 50,
  preferred_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  auto_create_po BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, location_id)
);

ALTER TABLE public.inventory_reorder_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reorder_config_tenant_isolation" ON public.inventory_reorder_config;
CREATE POLICY "reorder_config_tenant_isolation" ON public.inventory_reorder_config
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM public.users WHERE id = auth.uid()
  ));

-- ─── 7. Additional indexes ───
CREATE INDEX IF NOT EXISTS idx_po_items_product ON public.purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_reorder_config_business ON public.inventory_reorder_config(business_id);
CREATE INDEX IF NOT EXISTS idx_reorder_config_product_loc ON public.inventory_reorder_config(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(business_id, is_active);
