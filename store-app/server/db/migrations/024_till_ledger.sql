-- ============================================
-- Migration 024: Till Ledger & Balances
-- ============================================

-- 1. Add till_clear_day to businesses table
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS till_clear_day TEXT DEFAULT 'Friday';

-- 2. Create business_ledger table for expenses and deposits
CREATE TABLE IF NOT EXISTS public.business_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  type TEXT NOT NULL CHECK (type IN ('expense', 'deposit_to_bank', 'pay_in')),
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS on business_ledger
ALTER TABLE public.business_ledger ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for business_ledger
DROP POLICY IF EXISTS "Authenticated users can read ledger" ON public.business_ledger;
CREATE POLICY "Authenticated users can read ledger"
  ON public.business_ledger
  FOR SELECT
  TO authenticated
  USING (
    business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

DROP POLICY IF EXISTS "Users can insert ledger" ON public.business_ledger;
CREATE POLICY "Users can insert ledger"
  ON public.business_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id()
    OR public.has_permission('manage_platform')
  );

-- 5. Inject new permissions into available permissions enum or list if necessary
-- The system doesn't use a strict ENUM for permissions, it uses an array of text.
-- However, we should just document that 'view_till_balance' and 'view_till_history' are now valid permissions.
-- We can add them to existing Roles (like Platform Admin and Business Admin)

-- Add permissions to Platform Admin
UPDATE public.roles 
SET permissions = array_append(array_append(permissions, 'view_till_balance'), 'view_till_history') 
WHERE name = 'Platform Admin' AND NOT ('view_till_balance' = ANY(permissions));

-- Add permissions to Business Admin
UPDATE public.roles 
SET permissions = array_append(array_append(permissions, 'view_till_balance'), 'view_till_history') 
WHERE name = 'Business Admin' AND NOT ('view_till_balance' = ANY(permissions));

-- Add view_till_balance to Manager and Salesperson by default (can be removed by Admin later)
UPDATE public.roles 
SET permissions = array_append(permissions, 'view_till_balance') 
WHERE name IN ('Manager', 'Salesperson') AND NOT ('view_till_balance' = ANY(permissions));

-- Add view_till_history to Manager by default
UPDATE public.roles 
SET permissions = array_append(permissions, 'view_till_history') 
WHERE name = 'Manager' AND NOT ('view_till_history' = ANY(permissions));
