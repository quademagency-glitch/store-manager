-- ============================================
-- Migration 074: make the tax rate mean something
--
-- businesses.tax_rate has existed since 023 and has never been read. Both
-- paths that create a sale wrote the tax line as zero, this RPC had no
-- parameter to carry one, and the sales table had nowhere to put it. The
-- settings box was removed from the client rather than left sitting there
-- doing nothing. This puts it back, wired.
--
-- Three deliberate choices:
--
-- 1. tax_enabled defaults to FALSE, and it is the switch, not "tax_rate > 0".
--    tax_rate does not start empty: a business may have typed a number into
--    the old dead field at any point in the last year, believing it did
--    something. Keying off the rate would start charging every one of those
--    shops on the day this deploys, with nobody deciding to. Numbers already
--    in that column are not consent. The switch is new, so nobody has flipped
--    it by accident.
--
-- 2. tax_inclusive defaults TRUE. Ghanaian shelf prices normally include VAT,
--    and a till that adds tax on top of the marked price is a till that argues
--    with customers. Exclusive is there for businesses that price that way.
--
-- 3. The rate, the flag and the label are copied onto each sale as it is
--    written. A sale records what was actually charged, and a business that
--    changes its rate in March must not find February's receipts have
--    restated themselves. Reports and reprints read the snapshot; the settings
--    only ever affect the next sale.
--
-- Additive and safe on a live database: every column is nullable or defaulted,
-- no existing row changes meaning, and with tax_enabled false everywhere the
-- behaviour after this migration is identical to before it.
-- ============================================

-- ── 1. Settings, on the business ────────────────────────────────────────────
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tax_label TEXT NOT NULL DEFAULT 'VAT';

-- The label prints on receipts, so it can be neither empty nor an essay.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_tax_label_length;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_tax_label_length
  CHECK (char_length(btrim(tax_label)) BETWEEN 1 AND 16);

-- tax_rate predates this and is an unbounded DECIMAL. A negative rate refunds
-- tax on every sale, and 100 or more makes the inclusive arithmetic divide by
-- zero or go negative.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_tax_rate_range;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_tax_rate_range
  CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate < 100));

-- ── 2. What was actually charged, on the sale ───────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_rate_applied DECIMAL(6, 3),
  ADD COLUMN IF NOT EXISTS tax_inclusive_applied BOOLEAN,
  ADD COLUMN IF NOT EXISTS tax_label_applied TEXT;

COMMENT ON COLUMN public.sales.total_amount IS
  'What the customer paid. Unchanged by migration 074: tax is carved out of it, never added to it, so everything that already reads this column keeps its meaning.';
COMMENT ON COLUMN public.sales.subtotal IS
  'Net of tax. NULL on sales written before migration 074.';
COMMENT ON COLUMN public.sales.tax_rate_applied IS
  'The rate at the moment of sale. Reports and reprints read this, never businesses.tax_rate.';

-- ── 3. The RPC learns to carry it ───────────────────────────────────────────
--
-- Replaced rather than overloaded. Adding a second signature would leave the
-- old ten-argument function in place, and a ten-argument call could then match
-- both it and this one through the defaults, which Postgres rejects as
-- ambiguous: every sale in the app would start failing. Dropping first also
-- matters for security. A newly created function carries EXECUTE to PUBLIC by
-- default, and migration 072 exists precisely because this function being
-- reachable by `anon` is a complete bypass of RLS. The grants are restated at
-- the bottom.
--
-- The body below is migration 022's, unchanged except for the tax columns in
-- the INSERT. It still checks stock before selling, writes the stock_movements
-- row, raises the LOW_STOCK alert on threshold crossing, stamps inventory_units
-- as pending_sale and returns the same shape. The search_path pin that
-- migration 072 applied to every SECURITY DEFINER function is carried over; a
-- plain recreate would have silently dropped it.
--
-- New parameters are appended and defaulted, so a server still running the
-- previous build during the deploy window writes a valid, untaxed sale.
DROP FUNCTION IF EXISTS public.process_sale_transaction(
    UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, TEXT, TEXT, JSONB, UUID[]
);

CREATE OR REPLACE FUNCTION process_sale_transaction(
    p_business_id UUID,
    p_location_id UUID,
    p_salesperson_id UUID,
    p_customer_id UUID,
    p_total_amount DECIMAL,
    p_discount_amount DECIMAL,
    p_payment_method TEXT,
    p_receipt_number TEXT,
    p_items JSONB,
    p_unit_ids UUID[],
    p_subtotal DECIMAL DEFAULT NULL,
    p_tax_amount DECIMAL DEFAULT 0,
    p_tax_rate_applied DECIMAL DEFAULT NULL,
    p_tax_inclusive_applied BOOLEAN DEFAULT NULL,
    p_tax_label_applied TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_unit_price DECIMAL;
    v_current_stock INT;
    v_threshold INT;
    v_new_stock INT;
BEGIN
    -- 1. Create the sale record
    INSERT INTO sales (
        business_id, location_id, salesperson_id, customer_id,
        total_amount, discount_amount, payment_method, receipt_number, status,
        subtotal, tax_amount, tax_rate_applied, tax_inclusive_applied, tax_label_applied
    ) VALUES (
        p_business_id, p_location_id, p_salesperson_id, p_customer_id,
        p_total_amount, p_discount_amount, p_payment_method, p_receipt_number, 'pending',
        COALESCE(p_subtotal, p_total_amount - COALESCE(p_tax_amount, 0)),
        COALESCE(p_tax_amount, 0), p_tax_rate_applied, p_tax_inclusive_applied, p_tax_label_applied
    ) RETURNING id INTO v_sale_id;

    -- 2. Process each item in the sale
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_unit_price := (v_item->>'unit_price')::DECIMAL;

        -- Check current stock
        SELECT quantity, COALESCE(low_stock_threshold, 5)
        INTO v_current_stock, v_threshold
        FROM product_inventory
        WHERE product_id = v_product_id AND location_id = p_location_id
        FOR UPDATE; -- Lock the row for update

        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
        END IF;

        v_new_stock := v_current_stock - v_quantity;

        -- Insert sale item
        INSERT INTO sale_items (sale_id, business_id, product_id, quantity, unit_price)
        VALUES (v_sale_id, p_business_id, v_product_id, v_quantity, v_unit_price);

        -- Update product inventory
        UPDATE product_inventory
        SET quantity = v_new_stock
        WHERE product_id = v_product_id AND location_id = p_location_id;

        -- Record stock movement
        INSERT INTO stock_movements (
            business_id, location_id, product_id, quantity_change,
            movement_type, user_id, reference_id, notes
        ) VALUES (
            p_business_id, p_location_id, v_product_id, -v_quantity,
            'SALE', p_salesperson_id, v_sale_id, 'Sale #' || v_sale_id
        );

        -- Create alert if crossed low stock threshold
        IF v_new_stock <= v_threshold AND v_current_stock > v_threshold THEN
            INSERT INTO alerts (
                business_id, location_id, type, user_id, reference_id, note
            ) VALUES (
                p_business_id, p_location_id, 'LOW_STOCK', p_salesperson_id, v_product_id,
                'Stock fell to ' || v_new_stock || ' (Threshold: ' || v_threshold || ') due to sale #' || v_sale_id
            );
        END IF;
    END LOOP;

    -- 3. Update specific inventory units if provided (QR Code tracking)
    IF array_length(p_unit_ids, 1) > 0 THEN
        UPDATE inventory_units
        SET status = 'pending_sale', sold_in_sale_id = v_sale_id
        WHERE id = ANY(p_unit_ids);
    END IF;

    -- Return success with the new sale ID
    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
EXCEPTION
    WHEN OTHERS THEN
        -- The transaction will automatically rollback
        -- Re-raise the error to be caught by the client
        RAISE;
END;
$$;

-- Restated, because a dropped and recreated function comes back with EXECUTE
-- granted to PUBLIC. This is the hole migration 072 was written to close: the
-- anon key ships in the browser bundle, and this function is SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.process_sale_transaction(
    UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, TEXT, TEXT, JSONB, UUID[],
    DECIMAL, DECIMAL, DECIMAL, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_sale_transaction(
    UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, TEXT, TEXT, JSONB, UUID[],
    DECIMAL, DECIMAL, DECIMAL, BOOLEAN, TEXT
) TO service_role;

-- Prove it, rather than assume it: fail the migration if the function came
-- back reachable by anon.
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'process_sale_transaction'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'process_sale_transaction is executable by anon or authenticated after 074';
  END IF;
END
$verify$;
