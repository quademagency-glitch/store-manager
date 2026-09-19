const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { invalidateCachePrefix } = require('../middleware/apiCache');
const { transactionError } = require('../utils/transactionError');
const router = express.Router();
const returnSchema = z.object({
  sale_id: z.uuid(), operation_id: z.uuid(), reason: z.string().trim().min(1).max(1000),
  items: z.array(z.object({
    sale_item_id: z.uuid(), quantity: z.number().int().positive().max(100000),
    unit_ids: z.array(z.uuid()).max(100000).default([]),
    scans: z.array(z.object({
      item_code: z.string().trim().min(1).max(250),
      pack_code: z.string().trim().max(250).optional(),
      serial_number: z.string().trim().max(250).optional(),
    })).max(100000).default([]),
  })).min(1).max(500),
});
router.use(authGuard, permissionCheck('manage_returns'));
router.use((req, res, next) => {
  if (!req.user.active_location_id) return res.status(400).json({ error: 'Select a branch to process returns.' });
  next();
});

router.get('/search', async (req, res) => {
  try {
    // Filter punctuation has meaning in PostgREST's OR grammar. Treat it as
    // whitespace here; never interpolate raw filter expressions from a search.
    const query = String(req.query.query || '').trim().slice(0,100).replace(/[,().%_"\\]/g, ' ');
    if (!query.trim()) return res.status(400).json({ error: 'Search query is required' });
    const { data: customers, error: customerError } = await supabaseAdmin.from('customers').select('id')
      .eq('business_id', req.user.business_id).or(`name.ilike.%${query}%,phone.ilike.%${query}%`).limit(100);
    if (customerError) throw customerError;
    let salesQuery = supabaseAdmin.from('sales')
      .select('id,created_at,receipt_number,total_amount,return_status,customers(id,name,phone)')
      .eq('business_id', req.user.business_id).eq('location_id', req.user.active_location_id).eq('status', 'completed');
    const customerIds = (customers || []).map(c => c.id);
    salesQuery = customerIds.length
      ? salesQuery.or(`receipt_number.ilike.%${query}%,customer_id.in.(${customerIds.join(',')})`)
      : salesQuery.ilike('receipt_number', `%${query}%`);
    const { data, error } = await salesQuery.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error searching returns');
    res.status(500).json({ error: 'Failed to search sales for return' });
  }
});

router.get('/sale/:id', async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid sale reference' });
  const { data, error } = await supabaseAdmin.rpc('returnable_sale', {
    p_business_id: req.user.business_id, p_location_id: req.user.active_location_id, p_sale_id: req.params.id,
  });
  if (error) return transactionError(res, error, 'Failed to load returnable items');
  res.json(data);
});

router.post('/', async (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a sale, return reference, reason and positive whole quantities.' });
  try {
    const { sale_id, operation_id, items, reason } = parsed.data;
    if (new Set(items.map(i => i.sale_item_id)).size !== items.length) return res.status(400).json({ error: 'Select each sale line only once.' });
    const { data: business, error: businessError } = await supabaseAdmin.from('businesses')
      .select('qr_tracking_mode').eq('id', req.user.business_id).single();
    if (businessError) throw businessError;
    const resolved = [];
    for (const item of items) {
      if (item.unit_ids.length && item.scans.length) return res.status(400).json({ error: 'Use scanned codes or unit references, not both.' });
      const units = [...item.unit_ids];
      for (const scan of item.scans) {
        if (business.qr_tracking_mode === 'double' && (!scan.pack_code || !scan.serial_number)) {
          return res.status(400).json({ error: 'Pack code, item code and serial number are required.' });
        }
        const { data: qr, error: qrError } = await supabaseAdmin.from('qr_code_pool').select('id').eq('code', scan.item_code).maybeSingle();
        if (qrError) throw qrError;
        if (!qr) return res.status(400).json({ error: 'Item code not found.' });
        // Resolve a stable identity even on a retry after the unit was restocked.
        // The transaction validates sale, product, branch and sold status before
        // its first write, and returns its saved result for an identical retry.
        const { data: unit, error: unitError } = await supabaseAdmin.from('inventory_units')
          .select('id,serial_number,pack_qr:qr_code_pool!pack_code_id(code)')
          .eq('business_id', req.user.business_id).eq('location_id', req.user.active_location_id)
          .eq('qr_code_id', qr.id).maybeSingle();
        if (unitError) throw unitError;
        if (!unit || (business.qr_tracking_mode === 'double' &&
          (unit.serial_number !== scan.serial_number || unit.pack_qr?.code !== scan.pack_code))) {
          return res.status(400).json({ error: 'Scanned codes do not match a unit in this branch.' });
        }
        units.push(unit.id);
      }
      resolved.push({ sale_item_id: item.sale_item_id, quantity: item.quantity, unit_ids: units.sort() });
    }
    resolved.sort((a,b) => a.sale_item_id.localeCompare(b.sale_item_id));
    const { data, error } = await supabaseAdmin.rpc('process_return_transaction', {
      p_business_id: req.user.business_id, p_location_id: req.user.active_location_id, p_actor_id: req.user.id,
      p_sale_id: sale_id, p_operation_id: operation_id, p_items: resolved, p_reason: reason,
    });
    if (error) return transactionError(res, error, 'Return could not be completed. Retry the same return.');
    for (const prefix of ['/api/sales','/api/analytics','/api/ledger','/api/products','/api/inventory','/api/loyalty','/api/hr']) invalidateCachePrefix(prefix);
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error processing return');
    return transactionError(res, err, 'Return could not be completed. Retry the same return.');
  }
});
module.exports = router;
