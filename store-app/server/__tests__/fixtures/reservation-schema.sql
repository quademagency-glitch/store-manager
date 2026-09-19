-- Additional deployed schema required for reservation tests; synthetic data only.
ALTER TABLE products ADD COLUMN requires_serial boolean NOT NULL DEFAULT true;
CREATE TABLE qr_code_pool(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,status text NOT NULL DEFAULT 'unassigned');
-- Previous RPC's signature exists in production; fixture stub ensures the
-- migration retires its service privilege without needing unrelated alert tables.
CREATE FUNCTION process_sale_transaction(uuid,uuid,uuid,uuid,numeric,numeric,text,text,jsonb,uuid[],numeric,numeric,numeric,boolean,text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,name text);
CREATE TABLE purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,supplier_id uuid REFERENCES suppliers(id),po_number text,status text DEFAULT 'draft',expected_date date,received_date date,notes text,total_amount numeric DEFAULT 0,currency text DEFAULT 'GHS',created_by uuid,received_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE purchase_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,product_id uuid REFERENCES products(id),quantity integer,received_quantity integer DEFAULT 0,unit_cost numeric,total numeric,notes text);

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  initial_balance NUMERIC(12, 2) NOT NULL CHECK (initial_balance > 0),
  current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  issued_to_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


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


CREATE FUNCTION public.snapshot_sale_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT cost_price INTO NEW.unit_cost FROM public.products
    WHERE id = NEW.product_id AND business_id = NEW.business_id;
  NEW.cost_basis := CASE WHEN NEW.unit_cost IS NULL THEN 'unavailable' ELSE 'recorded' END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_sale_item_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_sale_item_cost() TO service_role;
CREATE TRIGGER snapshot_sale_item_cost BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_sale_item_cost();

CREATE FUNCTION public.preserve_sale_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.cost_basis IS DISTINCT FROM OLD.cost_basis THEN
    RAISE EXCEPTION 'Recorded sale costs are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_sale_item_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_sale_item_cost() TO service_role;
CREATE TRIGGER preserve_sale_item_cost BEFORE UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.preserve_sale_item_cost();


CREATE FUNCTION public.pay_commissions(
  p_business_id uuid, p_location_id uuid, p_actor_id uuid,
  p_user_id uuid, p_commission_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_ids uuid[];
  v_total numeric;
  v_records jsonb;
  v_ledger_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'A valid payout location is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_actor_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'Invalid payout actor';
  END IF;
  PERFORM id FROM commission_ledger
    WHERE id = ANY(p_commission_ids) AND business_id = p_business_id AND user_id = p_user_id
    ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM commission_ledger WHERE id = ANY(p_commission_ids)
      AND business_id = p_business_id AND user_id = p_user_id)
      <> (SELECT count(DISTINCT id) FROM unnest(p_commission_ids) id) THEN
    RAISE EXCEPTION 'Commission selection does not belong to this employee and business';
  END IF;
  SELECT array_agg(id), COALESCE(sum(amount), 0) INTO v_ids, v_total
    FROM commission_ledger WHERE id = ANY(p_commission_ids)
    AND business_id = p_business_id AND user_id = p_user_id AND paid_at IS NULL;
  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('message', 'Commissions already paid', 'total_paid', 0, 'records', '[]'::jsonb);
  END IF;
  IF v_total > 0 THEN
    INSERT INTO business_ledger(business_id, location_id, user_id, type, amount,
      description, status, approved_by, approved_at, metadata)
    VALUES (p_business_id, p_location_id, p_actor_id, 'expense', v_total,
      'Commission payout', 'approved', p_actor_id, now(),
      jsonb_build_object('commission_ids', v_ids, 'employee_id', p_user_id, 'account_category', 'Staff commissions')) RETURNING id INTO v_ledger_id;
  END IF;
  WITH paid AS (
    UPDATE commission_ledger SET paid_at = now(), payout_ledger_id = v_ledger_id WHERE id = ANY(v_ids) RETURNING *
  ) SELECT jsonb_agg(to_jsonb(paid)) INTO v_records FROM paid;
  RETURN jsonb_build_object('message', cardinality(v_ids) || ' commission(s) paid', 'total_paid', v_total, 'records', v_records);
END;
$$;
REVOKE ALL ON FUNCTION public.pay_commissions(uuid, uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commissions(uuid, uuid, uuid, uuid, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
