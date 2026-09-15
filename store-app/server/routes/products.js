const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { apiCache, invalidateCachePrefix } = require('../middleware/apiCache');
const { getPagination } = require('../utils/paginate');

const router = express.Router();

/**
 * Fields whose edits are recorded in product_change_log.
 *
 * price and cost_price are deliberately absent: price_change_log (034) owns
 * price history, and recordProductEdit writes there instead, so a price edit
 * shows up once rather than in two different logs.
 */
const LOGGED_PRODUCT_FIELDS = ['name', 'sku', 'category', 'product_code', 'qr_code_data', 'requires_serial'];

/** Compare as the log stores them: text, with unset distinguished from empty. */
function asLogValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/**
 * Same rule as permissionCheck, for routes that vary their RESPONSE by
 * permission rather than refusing outright.
 */
function can(req, ...perms) {
  if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin') return true;
  const held = req.user.permissions || [];
  return perms.some(p => held.includes(p));
}

/**
 * Record an edit to a product row.
 *
 * Price and cost go to price_change_log with change_type 'manual'. Until this
 * existed only the bulk repricing endpoint wrote to that table, so a price
 * typed into the Edit Product form left no trace at all and the price history
 * was silently partial.
 */
async function recordProductEdit(before, after, req) {
  const oldPrice = Number(before.price) || 0;
  const newPrice = Number(after.price) || 0;
  const oldCost = Number(before.cost_price) || 0;
  const newCost = Number(after.cost_price) || 0;

  if (oldPrice !== newPrice || oldCost !== newCost) {
    const { error } = await supabaseAdmin.from('price_change_log').insert({
      business_id: after.business_id || req.user.business_id,
      product_id: after.id,
      old_price: oldPrice,
      new_price: newPrice,
      old_cost_price: oldCost,
      new_cost_price: newCost,
      change_type: 'manual',
      changed_by: req.user.id,
    });
    if (error) throw error;
  }

  const rows = [];
  for (const field of LOGGED_PRODUCT_FIELDS) {
    const from = asLogValue(before[field]);
    const to = asLogValue(after[field]);
    if (from === to) continue;
    rows.push({
      business_id: after.business_id || req.user.business_id,
      product_id: after.id,
      field,
      old_value: from,
      new_value: to,
      changed_by: req.user.id,
      changed_by_name: req.user.name,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('product_change_log').insert(rows);
    if (error) throw error;
  }
}

/**
 * Restrict a query on a table with a location_id to what this user may see.
 *
 * Lifted from routes/stock.js so the product timeline and the stock ledger
 * agree: a cashier scoped to one branch must not learn what the other branch
 * did by opening a product.
 */
function scopeToUserLocations(query, req) {
  if (req.user.active_location_id) return query.eq('location_id', req.user.active_location_id);
  if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin') return query;
  if (req.user.location_ids && req.user.location_ids.length > 0) {
    return query.in('location_id', req.user.location_ids);
  }
  return query.eq('location_id', '00000000-0000-0000-0000-000000000000');
}

/**
 * GET /api/products
 * Fetch all products
 * Access: All authenticated staff
 */
router.get('/', authGuard, apiCache(5), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .order('name');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching products:');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/lookup
 * Look up a product by its QR code data.
 * Access: All authenticated staff
 */
router.get('/lookup', authGuard, apiCache(5), async (req, res) => {
  try {
    const { qr } = req.query;
    if (!qr) return res.status(400).json({ error: 'Missing qr query parameter.' });

    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .eq('qr_code_data', qr);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: 'Product not found for this QR code.' });
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error looking up product by QR:');
    res.status(500).json({ error: 'Failed to look up product' });
  }
});

/**
 * GET /api/products/:id
 * Fetch a single product
 * Access: All authenticated staff
 */
router.get('/:id', authGuard, apiCache(5), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });
    
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product:');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * POST /api/products
 * Create a new product
 * Access: Managers only
 */
router.post('/', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { name, sku, category, price, cost_price, initialQuantity, locationId, qr_code_data, product_code, requires_serial } = req.body;

    if (!name || !sku) {
      return res.status(400).json({ error: 'Name and SKU are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([
        {
          name,
          sku,
          category,
          price,
          cost_price: cost_price || 0,
          qr_code_data: qr_code_data || sku,
          product_code,
          requires_serial: requires_serial === undefined ? true : !!requires_serial,
          business_id: req.body.business_id || req.user.business_id
        }
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation for SKU
        return res.status(409).json({ error: 'A product with this SKU already exists.' });
      }
      throw error;
    }

    if (locationId) {
      const qty = parseInt(initialQuantity, 10) || 0;
      const { error: invError } = await supabaseAdmin
        .from('product_inventory')
        .insert({
          product_id: data.id,
          location_id: locationId,
          quantity: qty,
          low_stock_threshold: 5
        });

      if (invError) {
        logger.error({ err: invError }, 'Error creating initial inventory:');
      } else if (qty > 0) {
        await supabaseAdmin
          .from('stock_movements')
          .insert({
            product_id: data.id,
            user_id: req.user.id,
            business_id: req.body.business_id || req.user.business_id,
            location_id: locationId,
            quantity_change: qty,
            movement_type: 'RECEIPT',
            notes: 'Initial stock on product creation'
          });
      }
    }

    invalidateCachePrefix('/api/products');
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating product:');
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * PUT /api/products/:id
 * Update a product
 * Access: Managers only
 */
router.put('/:id', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { name, sku, category, price, cost_price, qr_code_data, product_code, requires_serial } = req.body;

    const updatePayload = { name, sku, category, price };
    if (cost_price !== undefined) updatePayload.cost_price = cost_price;
    if (qr_code_data !== undefined) updatePayload.qr_code_data = qr_code_data;
    if (product_code !== undefined) updatePayload.product_code = product_code;
    if (requires_serial !== undefined) updatePayload.requires_serial = !!requires_serial;

    // Read the row before overwriting it. The history is a diff, and after the
    // UPDATE the old values are gone — there is nothing to diff against.
    let beforeQuery = supabaseAdmin
      .from('products')
      .select('name, sku, category, price, cost_price, qr_code_data, product_code, requires_serial')
      .eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') {
      beforeQuery = beforeQuery.eq('business_id', req.user.business_id);
    }
    const { data: before } = await beforeQuery.maybeSingle();

    let query = supabaseAdmin
      .from('products')
      .update(updatePayload)
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A product with this SKU already exists.' });
      }
      throw error;
    }
    
    if (!data) return res.status(404).json({ error: 'Product not found' });

    // History is a side effect of the edit, never a reason to fail it: the
    // product IS updated by this point, and a 500 here would tell the user
    // their edit did not save when it did.
    if (before) {
      try {
        await recordProductEdit(before, data, req);
      } catch (logErr) {
        logger.error({ err: logErr, productId: req.params.id }, 'Product updated but history not recorded:');
      }
    }

    invalidateCachePrefix('/api/products');
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating product:');
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product
 * Access: Managers only
 */
router.delete('/:id', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { error, count } = await query;

    if (error) throw error;
    if (count === 0) return res.status(404).json({ error: 'Product not found' });

    invalidateCachePrefix('/api/products');
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting product:');
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/**
 * GET /api/products/:id/history
 * One merged, newest-first timeline of everything that happened to a product.
 * Access: anyone who can see the inventory. Price events additionally require
 *         manage_products, matching GET /api/pricing/history.
 *
 * Three tables, one list. Each is queried for the newest (offset + limit + 1)
 * rows, then merged and sliced: taking the top N of each source guarantees the
 * top N of the merge, and the spare row tells us whether more exists without a
 * second round trip.
 */
router.get('/:id/history', authGuard, permissionCheck('view_inventory', 'manage_inventory', 'manage_products'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const reach = offset + limit + 1;
    const businessId = req.user.business_id;
    const showPrices = can(req, 'manage_products');

    // Confirm the product is this tenant's before reporting anything about it,
    // otherwise the timeline becomes a way to probe other businesses' data.
    let productQuery = supabaseAdmin
      .from('products')
      .select('id, name, sku, business_id')
      .eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') productQuery = productQuery.eq('business_id', businessId);
    const { data: product } = await productQuery.maybeSingle();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let movementQuery = supabaseAdmin
      .from('stock_movements')
      .select(`
        id, quantity_change, movement_type, notes, reference_id, created_at, location_id,
        user:users!user_id(id, name),
        location:locations!location_id(id, name)
      `)
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(reach);
    if (req.user.role !== 'Platform Admin') movementQuery = movementQuery.eq('business_id', businessId);
    movementQuery = scopeToUserLocations(movementQuery, req);

    const editQuery = supabaseAdmin
      .from('product_change_log')
      .select('id, field, old_value, new_value, created_at, changed_by_name, user:users!changed_by(id, name)')
      .eq('product_id', product.id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(reach);

    /* No `users!changed_by` embed here, deliberately: price_change_log.changed_by
       is a foreign key to auth.users, not public.users, so PostgREST answers
       PGRST200 and fails the WHOLE select rather than just the embed. The
       author is stitched on below from public.users, whose id IS the auth id.
       See __tests__/postgrestEmbeds.test.js. */
    const priceQuery = showPrices
      ? supabaseAdmin
          .from('price_change_log')
          .select('id, old_price, new_price, old_cost_price, new_cost_price, change_type, reason, batch_id, created_at, changed_by')
          .eq('product_id', product.id)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(reach)
      : Promise.resolve({ data: [] });

    const [movements, edits, prices] = await Promise.all([movementQuery, editQuery, priceQuery]);
    for (const r of [movements, edits, prices]) {
      if (r && r.error) throw r.error;
    }

    const priceRows = prices.data || [];
    const authorIds = [...new Set(priceRows.map(r => r.changed_by).filter(Boolean))];
    const authors = {};
    if (authorIds.length > 0) {
      const { data: users } = await supabaseAdmin.from('users').select('id, name').in('id', authorIds);
      for (const u of users || []) authors[u.id] = u.name;
    }

    const events = [
      ...(movements.data || []).map(m => ({
        id: `stock:${m.id}`,
        kind: 'stock',
        at: m.created_at,
        actor: m.user ? m.user.name : null,
        movement_type: m.movement_type,
        quantity_change: m.quantity_change,
        location: m.location ? m.location.name : null,
        reference_id: m.reference_id,
        notes: m.notes,
      })),
      ...(edits.data || []).map(e => ({
        id: `edit:${e.id}`,
        kind: 'edit',
        at: e.created_at,
        // changed_by_name is the copy taken at write time; it is what survives
        // the editor being deleted, so it wins over the (possibly null) join.
        actor: e.changed_by_name || (e.user ? e.user.name : null),
        field: e.field,
        old_value: e.old_value,
        new_value: e.new_value,
      })),
      ...priceRows.map(p => ({
        id: `price:${p.id}`,
        kind: 'price',
        at: p.created_at,
        actor: authors[p.changed_by] || null,
        old_price: p.old_price,
        new_price: p.new_price,
        old_cost_price: p.old_cost_price,
        new_cost_price: p.new_cost_price,
        change_type: p.change_type,
        reason: p.reason,
        // A batch id means it came from a bulk repricing run rather than from
        // someone editing this one product.
        is_bulk: !!p.batch_id,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    const pageEvents = events.slice(offset, offset + limit);

    res.json({
      data: pageEvents,
      page,
      limit,
      hasMore: events.length > offset + limit,
      // Says why a timeline looks thin, rather than leaving the reader to
      // guess whether nothing happened or they are not allowed to see it.
      includes: { stock: true, edits: true, prices: showPrices },
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product history:');
    res.status(500).json({ error: 'Failed to fetch product history' });
  }
});

/**
 * GET /api/products/:id/stats
 * Sales performance, stock per branch and batches for one product.
 * Access: anyone who can see the inventory. Money figures additionally require
 *         view_sales, view_analytics or manage_products.
 */
const STATS_WINDOW_DAYS = 90;

router.get('/:id/stats', authGuard, permissionCheck('view_inventory', 'manage_inventory', 'manage_products'), async (req, res) => {
  try {
    const businessId = req.user.business_id;
    const showMoney = can(req, 'view_sales', 'view_analytics', 'manage_products');

    let productQuery = supabaseAdmin
      .from('products')
      .select('id, business_id')
      .eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') productQuery = productQuery.eq('business_id', businessId);
    const { data: product } = await productQuery.maybeSingle();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    /* Bounded on purpose. Supabase's JS client cannot SUM server-side without
       an RPC, so these rows are added up here; a window keeps that from
       growing without limit as a shop accumulates years of sales. Anything
       older is deliberately out of scope rather than silently truncated,
       which is why the response names the window it covers.

       void_pending counts as revenue and voided does not, matching
       routes/reports.js. */
    const { data: soldRows, error: soldErr } = await supabaseAdmin
      .from('sale_items')
      .select('quantity, unit_price, sales!inner(id, created_at, status, business_id)')
      .eq('product_id', product.id)
      .eq('sales.business_id', businessId)
      .in('sales.status', ['completed', 'void_pending'])
      .gte('sales.created_at', since)
      .limit(5000);
    if (soldErr) throw soldErr;

    let unitsSold = 0;
    let revenue = 0;
    const saleIds = new Set();
    for (const row of soldRows || []) {
      unitsSold += row.quantity || 0;
      revenue += (row.quantity || 0) * (Number(row.unit_price) || 0);
      if (row.sales) saleIds.add(row.sales.id);
    }

    // Exact for all time, and one row rather than a scan.
    const { data: lastSale } = await supabaseAdmin
      .from('sale_items')
      .select('sales!inner(created_at, status, business_id)')
      .eq('product_id', product.id)
      .eq('sales.business_id', businessId)
      .in('sales.status', ['completed', 'void_pending'])
      .order('created_at', { foreignTable: 'sales', ascending: false })
      .limit(1)
      .maybeSingle();

    let inventoryQuery = supabaseAdmin
      .from('product_inventory')
      .select('location_id, quantity, low_stock_threshold, location:locations!location_id(id, name)')
      .eq('product_id', product.id);
    inventoryQuery = scopeToUserLocations(inventoryQuery, req);
    const { data: inventory, error: invErr } = await inventoryQuery;
    if (invErr) throw invErr;

    let batchQuery = supabaseAdmin
      .from('product_batches')
      .select('id, batch_number, quantity, expiry_date, location:locations!location_id(id, name)')
      .eq('product_id', product.id)
      .eq('business_id', businessId)
      .order('expiry_date', { ascending: true });
    batchQuery = scopeToUserLocations(batchQuery, req);
    const { data: batches } = await batchQuery;

    res.json({
      window_days: STATS_WINDOW_DAYS,
      units_sold: unitsSold,
      sale_count: saleIds.size,
      revenue: showMoney ? Number(revenue.toFixed(2)) : null,
      last_sold_at: lastSale && lastSale.sales ? lastSale.sales.created_at : null,
      stock_by_location: (inventory || []).map(i => ({
        location_id: i.location_id,
        location: i.location ? i.location.name : null,
        quantity: i.quantity,
        low_stock_threshold: i.low_stock_threshold,
      })),
      batches: batches || [],
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product stats:');
    res.status(500).json({ error: 'Failed to fetch product stats' });
  }
});

module.exports = router;
