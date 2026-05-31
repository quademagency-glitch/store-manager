-- ============================================
-- Migration 005: Modify Sales Table (Voids and Discounts)
-- Store Management App — Reconciliation Features
-- ============================================

-- 1. Add discount_amount and status columns to sales table
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided'));

-- 2. Add an UPDATE policy for sales to allow managers to void sales
DROP POLICY IF EXISTS "Managers can update sales" ON public.sales;
CREATE POLICY "Managers can update sales"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'manager');

-- 3. Modify stock_movements check constraint to include 'VOID'
-- To modify a check constraint, we must drop it and recreate it.
-- First, find the constraint name dynamically or try the default generated one.
-- In PostgreSQL, modifying an enum constraint is tricky if it was created without a name.
-- We can add 'VOID' as a valid movement_type.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
  CHECK (movement_type IN ('SALE', 'RECEIPT', 'ADJUSTMENT', 'RETURN', 'SHRINKAGE', 'VOID'));
