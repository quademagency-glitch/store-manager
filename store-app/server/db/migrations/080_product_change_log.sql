-- ============================================
-- Migration 080: Product record change log
--
-- The product detail page answers "what happened to this product". Most of
-- that already has a home: stock_movements (004) is the quantity ledger,
-- price_change_log (034) is the price ledger, sale_items (003) is what sold.
-- One thing had no home at all — edits to the product record itself. Rename a
-- product, change its SKU, move it to another category, and nothing anywhere
-- remembers it happened or who did it.
--
-- WHY NOT audit_logs (070). That table's own comment draws the line: it holds
-- SECURITY and ADMINISTRATIVE events, and explicitly not business activity,
-- "sales, stock and price changes already have purpose-built tables, and
-- duplicating them here is exactly what would turn this into the largest and
-- least useful object in the database." Editing a product is business
-- activity, and it is written on a hot path a shop uses all day. It gets its
-- own narrow table, the same way stock and prices did.
--
-- WHY PRICES ARE NOT IN HERE. price_change_log already owns price history, and
-- this migration's companion change to routes/products.js starts writing
-- single-product edits there with change_type 'manual'. Until now only the
-- bulk repricing endpoint wrote to it, so a price typed into the Edit Product
-- form changed the shelf price and left no trace — the price history was real
-- but silently partial. Putting manual edits in a second table would have
-- preserved that split. This table therefore carries every product field
-- EXCEPT price and cost_price, and price history stays in one place.
--
-- ONE ROW PER FIELD. A single edit that renames a product and changes its SKU
-- writes two rows. The timeline renders each as its own line ("SKU changed
-- from WH-001 to WH-002"), and a query for "who has been touching SKUs" is a
-- WHERE rather than a JSONB dig.
--
-- changed_by_name IS DENORMALISED ON PURPOSE, the same reasoning as 070's
-- actor_email: routes/users.js hard-deletes users, and a log row must outlive
-- the person it describes or deleting a user becomes a way to erase what they
-- did.
--
-- WRITES ARE SERVICE-ROLE ONLY. No authenticated INSERT/UPDATE/DELETE policy,
-- by design — an append-only record the audited party can edit is not one.
-- The explicit service_role policy rather than relying on BYPASSRLS follows
-- 061 and 070, where inserts through the live server were observed failing
-- despite service_role having rolbypassrls.
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_change_log (
  id              BIGSERIAL PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field           TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  changed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_change_log IS
  'Append-only record of edits to the product row itself (name, sku, category, product_code, requires_serial, qr_code_data). Quantities live in stock_movements, prices in price_change_log.';
COMMENT ON COLUMN public.product_change_log.field IS
  'Product column that changed. Deliberately never price or cost_price — those go to price_change_log so price history has one home.';
COMMENT ON COLUMN public.product_change_log.old_value IS
  'Value before the edit, as text. NULL means the field was previously unset, which is not the same as an empty string.';
COMMENT ON COLUMN public.product_change_log.changed_by IS
  'Who edited it. SET NULL on user deletion so the row outlives the actor — changed_by_name retains the identity.';
COMMENT ON COLUMN public.product_change_log.changed_by_name IS
  'Denormalised copy of the editor name at the time of the edit, so the record survives deletion of the user row.';

-- "What happened to this product", newest first — the detail page's only query.
CREATE INDEX IF NOT EXISTS idx_product_change_log_product
  ON public.product_change_log (product_id, created_at DESC);

-- Tenant-wide sweep, for a future "recent edits" view and for export.
CREATE INDEX IF NOT EXISTS idx_product_change_log_business
  ON public.product_change_log (business_id, created_at DESC);

ALTER TABLE public.product_change_log ENABLE ROW LEVEL SECURITY;

-- Read: own tenant, and only for staff who can already see the inventory.
DROP POLICY IF EXISTS "Staff can read own product change log" ON public.product_change_log;
CREATE POLICY "Staff can read own product change log"
  ON public.product_change_log FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id()
    AND (
      public.has_permission('view_inventory')
      OR public.has_permission('manage_inventory')
      OR public.has_permission('manage_products')
    )
  );

DROP POLICY IF EXISTS "Service role can write product change log" ON public.product_change_log;
CREATE POLICY "Service role can write product change log"
  ON public.product_change_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
