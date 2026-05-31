-- ============================================
-- Migration 004: Stock Movements Table
-- Store Management App — Inventory Ledger
-- ============================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  quantity_change INTEGER NOT NULL, -- positive or negative
  movement_type TEXT NOT NULL CHECK (movement_type IN ('SALE', 'RECEIPT', 'ADJUSTMENT', 'RETURN', 'SHRINKAGE')),
  reference_id UUID, -- Optional: links to a sale_id or other transaction
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read stock movements
DROP POLICY IF EXISTS "Anyone can read stock movements" ON public.stock_movements;
CREATE POLICY "Anyone can read stock movements"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Managers and salespeople can insert stock movements
DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    public.get_user_role() IN ('manager', 'salesperson')
  );

-- No update or delete policies (immutable ledger)

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
