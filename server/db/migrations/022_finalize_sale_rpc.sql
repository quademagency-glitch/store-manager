-- Migration 022: Finalize Sale RPC
-- Creates a secure, ACID-compliant transaction for processing sales

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
    p_unit_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
        total_amount, discount_amount, payment_method, receipt_number, status
    ) VALUES (
        p_business_id, p_location_id, p_salesperson_id, p_customer_id,
        p_total_amount, p_discount_amount, p_payment_method, p_receipt_number, 'pending'
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
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price)
        VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price);

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
