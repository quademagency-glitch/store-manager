-- Checkout commits tender, rewards, commission earnings and tracked units together.
-- Generated using `supabase migration new atomic_checkout`; numbered for our runner.
ALTER TABLE public.sales
  ADD COLUMN settlement_id uuid,
  ADD COLUMN settlement_request jsonb,
  ADD COLUMN settlement_result jsonb,
  ADD COLUMN settled_at timestamptz,
  ADD COLUMN amount_paid numeric(12,2) CHECK (amount_paid >= 0),
  ADD COLUMN change_due numeric(12,2) CHECK (change_due >= 0),
  ADD COLUMN cash_received numeric(12,2) CHECK (cash_received >= 0),
  ADD COLUMN store_credit_used numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN loyalty_points_used integer NOT NULL DEFAULT 0,
  ADD COLUMN loyalty_value_used numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN accounting_at timestamptz GENERATED ALWAYS AS (coalesce(settled_at, created_at)) STORED;
ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'mobile', 'transfer'));
CREATE INDEX sales_accounting_at_idx ON public.sales(business_id, accounting_at);
ALTER TABLE public.sale_items ADD COLUMN tracked_quantity integer;
ALTER TABLE public.commission_ledger
  ADD COLUMN original_amount numeric(12,2),
  ADD COLUMN eligible_sale_item_ids uuid[],
  ADD COLUMN reversed_amount numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.commission_ledger SET original_amount=amount;

-- These writes must pass through server authorization and transactional services.
REVOKE INSERT, UPDATE, DELETE ON public.sales, public.sale_items,
  public.loyalty_ledger, public.store_credit_ledger FROM anon, authenticated;

-- Every reward writer (including the existing administrative endpoints) takes
-- the same customer lock. A concurrent redemption cannot spend the same balance.
CREATE FUNCTION public.lock_reward_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_balance numeric;
BEGIN
  PERFORM id FROM customers WHERE id=NEW.customer_id AND business_id=NEW.business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this business' USING ERRCODE='P0001'; END IF;
  IF NEW.sale_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sales WHERE id=NEW.sale_id AND business_id=NEW.business_id AND customer_id=NEW.customer_id
  ) THEN RAISE EXCEPTION 'Reward sale does not belong to this customer'; END IF;
  IF TG_TABLE_NAME='loyalty_ledger' THEN
    SELECT coalesce(sum(points),0) INTO v_balance FROM loyalty_ledger
      WHERE customer_id=NEW.customer_id AND business_id=NEW.business_id;
    NEW.balance_after := v_balance + NEW.points;
  ELSE
    SELECT coalesce(sum(amount),0) INTO v_balance FROM store_credit_ledger
      WHERE customer_id=NEW.customer_id AND business_id=NEW.business_id;
    NEW.balance_after := v_balance + NEW.amount;
  END IF;
  IF NEW.type='redeem' AND NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'Insufficient customer reward balance' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lock_loyalty_balance BEFORE INSERT ON public.loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION public.lock_reward_balance();
CREATE TRIGGER lock_credit_balance BEFORE INSERT ON public.store_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.lock_reward_balance();

CREATE FUNCTION public.customer_reward_balances(p_business_id uuid, p_customer_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'points', (SELECT coalesce(sum(points),0) FROM loyalty_ledger WHERE business_id=p_business_id AND customer_id=p_customer_id),
    'credit', (SELECT coalesce(sum(amount),0) FROM store_credit_ledger WHERE business_id=p_business_id AND customer_id=p_customer_id)
  );
$$;

CREATE FUNCTION public.sale_receipt(p_sale_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT to_jsonb(s) - 'settlement_request' - 'settlement_result' || jsonb_build_object(
    'rewards_applied', s.store_credit_used+s.loyalty_value_used,
    'customer', (SELECT jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone) FROM customers c WHERE c.id=s.customer_id),
    'salesperson', (SELECT jsonb_build_object('id',u.id,'name',u.name) FROM users u WHERE u.id=s.salesperson_id),
    'sale_items', (SELECT coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('product',
      jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku)) ORDER BY i.id),'[]'::jsonb)
      FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=s.id)
  ) FROM sales s WHERE s.id=p_sale_id;
$$;

CREATE FUNCTION public.finalize_sale_transaction(
  p_business_id uuid, p_location_id uuid, p_actor_id uuid, p_sale_id uuid,
  p_settlement_id uuid, p_payment_method text, p_amount_paid numeric,
  p_store_credit numeric DEFAULT 0, p_points integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_rule loyalty_rules%ROWTYPE;
  v_comm commission_rules%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_points_value numeric := 0;
  v_due numeric;
  v_earned integer;
  v_basis numeric;
  v_lines_total numeric;
BEGIN
  IF p_location_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id=p_actor_id AND business_id=p_business_id) THEN
    RAISE EXCEPTION 'Select an authorized branch and operator';
  END IF;
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id AND business_id=p_business_id
    AND location_id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found in this branch' USING ERRCODE='P0002'; END IF;
  IF p_settlement_id IS NULL OR p_payment_method IS NULL OR p_payment_method NOT IN ('cash','card','mobile','transfer')
    OR p_amount_paid IS NULL OR p_amount_paid NOT BETWEEN 0 AND 9999999999.99 OR p_amount_paid <> round(p_amount_paid,2)
    OR p_store_credit IS NULL OR p_store_credit NOT BETWEEN 0 AND 9999999999.99 OR p_store_credit <> round(p_store_credit,2)
    OR p_points IS NULL OR p_points < 0 THEN
    RAISE EXCEPTION 'Invalid payment details';
  END IF;
  v_request := jsonb_build_object('method',p_payment_method,'tender',p_amount_paid,'credit',p_store_credit,'points',p_points);
  IF v_sale.settlement_id IS NOT NULL THEN
    IF v_sale.settlement_id=p_settlement_id AND v_sale.settlement_request=v_request THEN
      RETURN v_sale.settlement_result;
    END IF;
    RAISE EXCEPTION 'Sale was already settled with different payment details' USING ERRCODE='P0003';
  END IF;
  IF v_sale.status <> 'pending' THEN RAISE EXCEPTION 'Sale is no longer pending' USING ERRCODE='P0003'; END IF;
  IF NOT EXISTS(SELECT 1 FROM sale_items WHERE sale_id=p_sale_id) OR EXISTS(
    SELECT 1 FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=p_sale_id
      AND (i.business_id<>p_business_id OR p.business_id<>p_business_id)
  ) THEN RAISE EXCEPTION 'Sale lines do not belong to this business'; END IF;
  PERFORM id FROM inventory_units WHERE sold_in_sale_id=p_sale_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM inventory_units WHERE sold_in_sale_id=p_sale_id AND
    (status<>'pending_sale' OR business_id<>p_business_id OR location_id<>p_location_id)) THEN
    RAISE EXCEPTION 'Reserved inventory no longer matches this checkout';
  END IF;
  IF EXISTS(SELECT 1 FROM inventory_units u WHERE u.sold_in_sale_id=p_sale_id
    AND NOT EXISTS(SELECT 1 FROM sale_items i WHERE i.sale_id=p_sale_id AND i.product_id=u.product_id))
    OR EXISTS(SELECT 1 FROM inventory_units u WHERE u.sold_in_sale_id=p_sale_id GROUP BY u.product_id
      HAVING count(*)<>(SELECT sum(i.quantity) FROM sale_items i WHERE i.sale_id=p_sale_id AND i.product_id=u.product_id)) THEN
    RAISE EXCEPTION 'Reserved unit quantities do not match this checkout';
  END IF;
  IF v_sale.customer_id IS NOT NULL THEN
    PERFORM id FROM customers WHERE id=v_sale.customer_id AND business_id=p_business_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this business'; END IF;
  ELSIF p_store_credit > 0 OR p_points > 0 THEN
    RAISE EXCEPTION 'A customer is required to redeem rewards';
  END IF;
  SELECT * INTO v_rule FROM loyalty_rules WHERE business_id=p_business_id AND active=true;
  IF p_points > 0 THEN
    IF v_rule.id IS NULL OR v_rule.point_value <= 0 OR p_points < v_rule.min_points_to_redeem THEN
      RAISE EXCEPTION 'Loyalty redemption does not meet the active reward rules';
    END IF;
    v_points_value := round(p_points*v_rule.point_value,2);
    IF v_points_value=0 THEN RAISE EXCEPTION 'Redeem enough points to have a monetary value'; END IF;
  END IF;
  v_due := v_sale.total_amount-p_store_credit-v_points_value;
  IF v_due < 0 THEN RAISE EXCEPTION 'Rewards exceed the sale total'; END IF;
  IF p_amount_paid < v_due THEN RAISE EXCEPTION 'Payment is below the amount due'; END IF;
  IF p_payment_method <> 'cash' AND p_amount_paid <> v_due THEN
    RAISE EXCEPTION 'Non-cash payment must equal the amount due';
  END IF;
  IF EXISTS (SELECT 1 FROM store_credit_ledger WHERE sale_id=p_sale_id AND type='redeem') OR EXISTS (SELECT 1 FROM loyalty_ledger WHERE sale_id=p_sale_id AND type='redeem') THEN
    RAISE EXCEPTION 'This older checkout already deducted rewards. Cancel it to restore the rewards, then start again.';
  END IF;
  IF p_store_credit > 0 THEN
    INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount,note)
      VALUES(v_sale.customer_id,p_business_id,p_sale_id,'redeem',-p_store_credit,'Redeemed at checkout');
  END IF;
  IF p_points > 0 THEN
    INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points,note)
      VALUES(v_sale.customer_id,p_business_id,p_sale_id,'redeem',-p_points,'Redeemed at checkout');
  END IF;
  UPDATE inventory_units SET status='sold',sold_at=clock_timestamp()
    WHERE sold_in_sale_id=p_sale_id AND status='pending_sale' AND business_id=p_business_id;
  UPDATE sale_items i SET tracked_quantity=CASE WHEN EXISTS(SELECT 1 FROM inventory_units u
    WHERE u.sold_in_sale_id=p_sale_id AND u.product_id=i.product_id) THEN i.quantity ELSE 0 END WHERE i.sale_id=p_sale_id;
  UPDATE sales SET status='completed',settlement_id=p_settlement_id,settlement_request=v_request,
    settled_at=clock_timestamp(),payment_method=p_payment_method,amount_paid=p_amount_paid,
    change_due=p_amount_paid-v_due,cash_received=CASE WHEN p_payment_method='cash' THEN v_due ELSE 0 END,
    store_credit_used=p_store_credit,loyalty_points_used=p_points,loyalty_value_used=v_points_value
    WHERE id=p_sale_id;

  -- Replace unpaid provisional commissions created by the old checkout. Paid
  -- historical entries are preserved for reconciliation, never silently undone.
  DELETE FROM commission_ledger WHERE sale_id=p_sale_id AND paid_at IS NULL;
  SELECT coalesce(sum(quantity*unit_price),0) INTO v_lines_total FROM sale_items WHERE sale_id=p_sale_id;
  FOR v_comm IN SELECT * FROM commission_rules WHERE business_id=p_business_id AND active=true ORDER BY id LOOP
    SELECT coalesce(sum(i.quantity*i.unit_price),0) INTO v_basis FROM sale_items i
      JOIN products p ON p.id=i.product_id WHERE i.sale_id=p_sale_id
      AND (nullif(v_comm.product_category,'') IS NULL OR p.category=v_comm.product_category);
    v_basis := CASE WHEN v_lines_total > 0 THEN round(v_basis/v_lines_total*(v_sale.total_amount-coalesce(v_sale.tax_amount,0)),2) ELSE 0 END;
    IF v_basis > 0 AND v_basis >= v_comm.min_sale_amount AND NOT EXISTS (
      SELECT 1 FROM commission_ledger WHERE sale_id=p_sale_id AND rule_id=v_comm.id
    ) THEN
      INSERT INTO commission_ledger(user_id,sale_id,business_id,rule_id,amount,original_amount,eligible_sale_item_ids)
        VALUES(v_sale.salesperson_id,p_sale_id,p_business_id,v_comm.id,
          round(CASE WHEN v_comm.type='percentage' THEN v_basis*v_comm.value/100 ELSE v_comm.value END,2),
          round(CASE WHEN v_comm.type='percentage' THEN v_basis*v_comm.value/100 ELSE v_comm.value END,2),
          ARRAY(SELECT i.id FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=p_sale_id
            AND (nullif(v_comm.product_category,'') IS NULL OR p.category=v_comm.product_category)));
    END IF;
  END LOOP;
  IF v_sale.customer_id IS NOT NULL AND v_rule.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM loyalty_ledger WHERE sale_id=p_sale_id AND type='earn'
  ) THEN
    v_earned := floor((v_sale.total_amount-coalesce(v_sale.tax_amount,0))*v_rule.points_per_currency_unit);
    IF v_earned <> 0 THEN
      INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points,note)
        VALUES(v_sale.customer_id,p_business_id,p_sale_id,'earn',v_earned,'Earned from completed sale');
    END IF;
  END IF;
  v_result := jsonb_build_object('message','Sale finalized successfully','sale',sale_receipt(p_sale_id));
  UPDATE sales SET settlement_result=v_result WHERE id=p_sale_id;
  RETURN v_result;
END;
$$;

-- Cancellation and the expiry worker lock the same row as finalization before
-- touching stock. A second caller sees the committed outcome and does no work.
CREATE FUNCTION public.cancel_pending_sale(p_sale_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_sale sales%ROWTYPE; v_item record; v_earned numeric; v_credit numeric;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('reversed',false,'skipped','not-found'); END IF;
  IF v_sale.status <> 'pending' THEN RETURN jsonb_build_object('reversed',false,'skipped',v_sale.status); END IF;
  IF v_sale.customer_id IS NOT NULL THEN
    PERFORM id FROM customers WHERE id=v_sale.customer_id FOR UPDATE;
    SELECT coalesce(sum(points),0) INTO v_earned FROM loyalty_ledger WHERE sale_id=p_sale_id;
    IF v_earned <> 0 THEN
      INSERT INTO loyalty_ledger(customer_id,business_id,sale_id,type,points,note)
        VALUES(v_sale.customer_id,v_sale.business_id,p_sale_id,'adjust',-v_earned,'Cancelled provisional sale rewards');
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_credit FROM store_credit_ledger WHERE sale_id=p_sale_id;
    IF v_credit < 0 THEN
      INSERT INTO store_credit_ledger(customer_id,business_id,sale_id,type,amount,note)
        VALUES(v_sale.customer_id,v_sale.business_id,p_sale_id,'refund',-v_credit,'Restored cancelled checkout credit');
    END IF;
  END IF;
  FOR v_item IN SELECT product_id,sum(quantity)::integer AS quantity FROM sale_items
    WHERE sale_id=p_sale_id GROUP BY product_id ORDER BY product_id LOOP
    UPDATE product_inventory SET quantity=quantity+v_item.quantity
      WHERE product_id=v_item.product_id AND location_id=v_sale.location_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory record is missing'; END IF;
    INSERT INTO stock_movements(business_id,location_id,product_id,quantity_change,movement_type,user_id,reference_id,notes)
      VALUES(v_sale.business_id,v_sale.location_id,v_item.product_id,v_item.quantity,'ADJUSTMENT',v_sale.salesperson_id,p_sale_id,'Cancelled pending sale');
  END LOOP;
  UPDATE inventory_units SET status='in_stock',sold_in_sale_id=null,sold_at=null
    WHERE sold_in_sale_id=p_sale_id AND status='pending_sale';
  DELETE FROM commission_ledger WHERE sale_id=p_sale_id AND paid_at IS NULL;
  UPDATE sales SET status='voided' WHERE id=p_sale_id;
  RETURN jsonb_build_object('reversed',true);
END;
$$;

REVOKE ALL ON FUNCTION public.lock_reward_balance(), public.customer_reward_balances(uuid,uuid),
  public.sale_receipt(uuid), public.finalize_sale_transaction(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,integer),
  public.cancel_pending_sale(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lock_reward_balance(), public.customer_reward_balances(uuid,uuid),
  public.sale_receipt(uuid), public.finalize_sale_transaction(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,integer),
  public.cancel_pending_sale(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
