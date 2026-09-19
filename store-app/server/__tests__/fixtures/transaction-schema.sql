-- Transaction test schema: deployed 082 column types/defaults/checks, captured 2026-09-19.

-- No production data. External auth, role, QR and batch foreign keys are omitted.

CREATE TABLE public."business_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "template_id" uuid,
  "status" text NOT NULL DEFAULT 'approved'::text,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "receipt_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "date" date NOT NULL DEFAULT CURRENT_DATE,
  "ref_number" text
);

CREATE TABLE public."businesses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "contact_email" text,
  "logo_url" text,
  "billing_plan" text DEFAULT 'Free'::text,
  "billing_status" text DEFAULT 'Active'::text,
  "subscription_plan_id" uuid,
  "max_discount_percent" numeric(5,2) DEFAULT 15.00,
  "manager_pin_required" boolean DEFAULT true,
  "business_hours_start" time without time zone DEFAULT '08:00:00'::time without time zone,
  "business_hours_end" time without time zone DEFAULT '18:00:00'::time without time zone,
  "business_timezone" text DEFAULT 'UTC'::text,
  "tax_rate" numeric DEFAULT 0.00,
  "return_policy" text,
  "till_clear_day" text DEFAULT 'Friday'::text,
  "phone" text,
  "address_line1" text,
  "city" text,
  "region" text,
  "letterhead" jsonb DEFAULT '{}'::jsonb,
  "currency" text NOT NULL DEFAULT 'GHS'::text,
  "qr_tracking_mode" text NOT NULL DEFAULT 'single'::text,
  "setup_checklist_dismissed_at" timestamp with time zone,
  "slug" text NOT NULL,
  "country" text,
  "trial_ends_at" timestamp with time zone,
  "is_demo" boolean NOT NULL DEFAULT false,
  "signup_attribution" jsonb,
  "tax_enabled" boolean NOT NULL DEFAULT false,
  "tax_inclusive" boolean NOT NULL DEFAULT true,
  "tax_label" text NOT NULL DEFAULT 'VAT'::text,
  "trial_reminder_sent_at" timestamp with time zone
);

CREATE TABLE public."commission_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "sale_id" uuid,
  "business_id" uuid NOT NULL,
  "rule_id" uuid,
  "amount" numeric(12,2) NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payout_ledger_id" uuid
);

CREATE TABLE public."commission_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "name" text NOT NULL DEFAULT 'Default Rule'::text,
  "type" text NOT NULL,
  "value" numeric(12,2) NOT NULL,
  "min_sale_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "product_category" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."customers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "is_verified" boolean DEFAULT false,
  "verification_code" text,
  "customer_code" text,
  "import_batch_id" uuid,
  "otp_expires_at" timestamp with time zone,
  "email" text,
  "credit_limit" numeric(12,2)
);

CREATE TABLE public."inventory_units" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "qr_code_id" uuid,
  "status" text NOT NULL DEFAULT 'in_stock'::text,
  "batch_id" uuid,
  "assigned_by" uuid NOT NULL,
  "assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sold_at" timestamp with time zone,
  "sold_in_sale_id" uuid,
  "notes" text,
  "pack_code_id" uuid,
  "serial_number" text,
  "product_code" text
);

CREATE TABLE public."locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "address" text,
  "tax_rate" numeric(5,2) DEFAULT 0.00,
  "receipt_header" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "latitude" double precision,
  "longitude" double precision,
  "geofence_radius_m" integer DEFAULT 200,
  "clock_in_start" time without time zone,
  "clock_in_end" time without time zone,
  "clock_out_start" time without time zone,
  "clock_out_end" time without time zone,
  "currency" text,
  "country" text
);

CREATE TABLE public."loyalty_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "sale_id" uuid,
  "type" text NOT NULL,
  "points" integer NOT NULL,
  "balance_after" integer NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."loyalty_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "points_per_currency_unit" numeric(10,2) NOT NULL DEFAULT 1,
  "min_points_to_redeem" integer NOT NULL DEFAULT 100,
  "point_value" numeric(10,4) NOT NULL DEFAULT 0.01,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."product_inventory" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "quantity" integer NOT NULL DEFAULT 0,
  "low_stock_threshold" integer NOT NULL DEFAULT 5,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "sku" text NOT NULL,
  "category" text NOT NULL DEFAULT 'Uncategorized'::text,
  "price" numeric(10,2) NOT NULL DEFAULT 0.00,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "business_id" uuid NOT NULL,
  "qr_code_data" text,
  "cost_price" numeric(10,2) DEFAULT 0.00,
  "product_code" text,
  "import_batch_id" uuid
);

CREATE TABLE public."return_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "return_id" uuid NOT NULL,
  "sale_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" numeric(10,2) NOT NULL,
  "returned_unit_ids" uuid[]
);

CREATE TABLE public."returns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "location_id" uuid,
  "original_sale_id" uuid NOT NULL,
  "customer_id" uuid,
  "processed_by" uuid NOT NULL,
  "total_refund_amount" numeric(10,2) NOT NULL DEFAULT 0.00,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."sale_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" numeric(10,2) NOT NULL,
  "business_id" uuid NOT NULL,
  "unit_cost" numeric(12,4),
  "cost_basis" text NOT NULL DEFAULT 'estimated'::text
);

CREATE TABLE public."sales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "salesperson_id" uuid NOT NULL,
  "total_amount" numeric(10,2) NOT NULL,
  "payment_method" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "discount_amount" numeric(10,2) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'completed'::text,
  "business_id" uuid NOT NULL,
  "location_id" uuid,
  "customer_id" uuid,
  "receipt_number" text,
  "return_status" text DEFAULT 'none'::text,
  "subtotal" numeric(10,2),
  "tax_amount" numeric(10,2) NOT NULL DEFAULT 0,
  "tax_rate_applied" numeric(6,3),
  "tax_inclusive_applied" boolean,
  "tax_label_applied" text
);

CREATE TABLE public."stock_movements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "quantity_change" integer NOT NULL,
  "movement_type" text NOT NULL,
  "reference_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "business_id" uuid NOT NULL,
  "location_id" uuid
);

CREATE TABLE public."store_credit_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "sale_id" uuid,
  "type" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "balance_after" numeric(12,2) NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."users" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "role_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "manager_pin" text,
  "scanner_session_token" uuid,
  "scanner_linked_at" timestamp with time zone,
  "confirmation_sent_at" timestamp with time zone
);

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_amount_check" CHECK ((amount > (0)::numeric));

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_type_check" CHECK ((type = ANY (ARRAY['expense'::text, 'deposit_to_bank'::text, 'pay_in'::text, 'ap_payment'::text])));

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_pkey" PRIMARY KEY (id);

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_qr_tracking_mode_check" CHECK ((qr_tracking_mode = ANY (ARRAY['single'::text, 'double'::text])));

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_slug_key" UNIQUE (slug);

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'banned'::text, 'trialing'::text, 'expired'::text])));

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_tax_label_length" CHECK (((char_length(btrim(tax_label)) >= 1) AND (char_length(btrim(tax_label)) <= 16)));

ALTER TABLE public."businesses" ADD CONSTRAINT "businesses_tax_rate_range" CHECK (((tax_rate IS NULL) OR ((tax_rate >= (0)::numeric) AND (tax_rate < (100)::numeric))));

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_amount_check" CHECK ((amount >= (0)::numeric));

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE public."commission_rules" ADD CONSTRAINT "commission_rules_pkey" PRIMARY KEY (id);

ALTER TABLE public."commission_rules" ADD CONSTRAINT "commission_rules_type_check" CHECK ((type = ANY (ARRAY['flat'::text, 'percentage'::text])));

ALTER TABLE public."commission_rules" ADD CONSTRAINT "commission_rules_value_check" CHECK ((value >= (0)::numeric));

ALTER TABLE public."customers" ADD CONSTRAINT "customers_business_id_phone_key" UNIQUE (business_id, phone);

ALTER TABLE public."customers" ADD CONSTRAINT "customers_credit_limit_non_negative" CHECK (((credit_limit IS NULL) OR (credit_limit >= (0)::numeric)));

ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_pkey" PRIMARY KEY (id);

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_status_check" CHECK ((status = ANY (ARRAY['in_stock'::text, 'sold'::text, 'damaged'::text, 'lost'::text, 'transferred'::text, 'returned'::text, 'pending_sale'::text])));

ALTER TABLE public."locations" ADD CONSTRAINT "locations_pkey" PRIMARY KEY (id);

ALTER TABLE public."loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE public."loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_type_check" CHECK ((type = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjust'::text, 'expire'::text])));

ALTER TABLE public."loyalty_rules" ADD CONSTRAINT "loyalty_rules_business_id_key" UNIQUE (business_id);

ALTER TABLE public."loyalty_rules" ADD CONSTRAINT "loyalty_rules_pkey" PRIMARY KEY (id);

ALTER TABLE public."product_inventory" ADD CONSTRAINT "product_inventory_pkey" PRIMARY KEY (id);

ALTER TABLE public."product_inventory" ADD CONSTRAINT "product_inventory_product_id_location_id_key" UNIQUE (product_id, location_id);

ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE public."products" ADD CONSTRAINT "products_price_check" CHECK ((price >= (0)::numeric));

ALTER TABLE public."products" ADD CONSTRAINT "products_sku_key" UNIQUE (sku);

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_pkey" PRIMARY KEY (id);

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_quantity_check" CHECK ((quantity > 0));

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_unit_price_check" CHECK ((unit_price >= (0)::numeric));

ALTER TABLE public."returns" ADD CONSTRAINT "returns_pkey" PRIMARY KEY (id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_total_refund_amount_check" CHECK ((total_refund_amount >= (0)::numeric));

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_cost_basis_check" CHECK ((cost_basis = ANY (ARRAY['recorded'::text, 'estimated'::text, 'unavailable'::text])));

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY (id);

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_quantity_check" CHECK ((quantity > 0));

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_unit_price_check" CHECK ((unit_price >= (0)::numeric));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_discount_amount_check" CHECK ((discount_amount >= (0)::numeric));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_payment_method_check" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'mobile'::text])));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_pkey" PRIMARY KEY (id);

ALTER TABLE public."sales" ADD CONSTRAINT "sales_return_status_check" CHECK ((return_status = ANY (ARRAY['none'::text, 'partial'::text, 'full'::text])));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_status_check" CHECK ((status = ANY (ARRAY['completed'::text, 'voided'::text, 'void_pending'::text, 'pending'::text])));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_tax_amount_check" CHECK ((tax_amount >= (0)::numeric));

ALTER TABLE public."sales" ADD CONSTRAINT "sales_total_amount_check" CHECK ((total_amount >= (0)::numeric));

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_movement_type_check" CHECK ((movement_type = ANY (ARRAY['SALE'::text, 'RECEIPT'::text, 'ADJUSTMENT'::text, 'RETURN'::text, 'SHRINKAGE'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'AUDIT'::text])));

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id);

ALTER TABLE public."store_credit_ledger" ADD CONSTRAINT "store_credit_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE public."store_credit_ledger" ADD CONSTRAINT "store_credit_ledger_type_check" CHECK ((type = ANY (ARRAY['issue'::text, 'redeem'::text, 'refund'::text])));

ALTER TABLE public."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

ALTER TABLE public."users" ADD CONSTRAINT "users_id_unique" UNIQUE (id);

ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

ALTER TABLE public."users" ADD CONSTRAINT "users_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'banned'::text])));

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;

ALTER TABLE public."business_ledger" ADD CONSTRAINT "business_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_payout_ledger_id_fkey" FOREIGN KEY (payout_ledger_id) REFERENCES business_ledger(id);

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL;

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE public."commission_ledger" ADD CONSTRAINT "commission_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE public."commission_rules" ADD CONSTRAINT "commission_rules_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES users(id);

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."inventory_units" ADD CONSTRAINT "inventory_units_sold_in_sale_id_fkey" FOREIGN KEY (sold_in_sale_id) REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE public."locations" ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public."loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE public."loyalty_rules" ADD CONSTRAINT "loyalty_rules_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."product_inventory" ADD CONSTRAINT "product_inventory_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;

ALTER TABLE public."product_inventory" ADD CONSTRAINT "product_inventory_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE;

ALTER TABLE public."return_items" ADD CONSTRAINT "return_items_sale_item_id_fkey" FOREIGN KEY (sale_item_id) REFERENCES sale_items(id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_original_sale_id_fkey" FOREIGN KEY (original_sale_id) REFERENCES sales(id);

ALTER TABLE public."returns" ADD CONSTRAINT "returns_processed_by_fkey" FOREIGN KEY (processed_by) REFERENCES users(id);

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE public."sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE public."sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE public."sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE public."sales" ADD CONSTRAINT "sales_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE public."sales" ADD CONSTRAINT "sales_salesperson_id_fkey" FOREIGN KEY (salesperson_id) REFERENCES users(id);

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE public."store_credit_ledger" ADD CONSTRAINT "store_credit_ledger_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE public."store_credit_ledger" ADD CONSTRAINT "store_credit_ledger_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public."store_credit_ledger" ADD CONSTRAINT "store_credit_ledger_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE public."users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);
