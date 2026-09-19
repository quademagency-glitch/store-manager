const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { apiCache, invalidateCachePrefix } = require('../middleware/apiCache');
const { reversePendingSale } = require('../services/pendingSales');

const { reportRange, applyReportRange } = require('../utils/reportDates');
const { fetchAllRows } = require('../utils/fetchAllRows');
const { transactionError } = require('../utils/transactionError');
const { runChecks } = require('../services/lossPreventionEngine');

const router = express.Router();

function scopeSales(query, user) {
  if (user.role !== 'Platform Admin') query = query.eq('business_id', user.business_id);
  if (user.active_location_id) return query.eq('location_id', user.active_location_id);
  if (!['Platform Admin', 'Business Admin'].includes(user.role)) return query.in('location_id', user.location_ids?.length ? user.location_ids : ['00000000-0000-0000-0000-000000000000']);
  return query;
}


const createSaleSchema = z.object({
  operation_id: z.string().uuid(),
  expected_total: z.number().finite().min(0).max(9999999999.99),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive().max(100000),
    /* Declared, because Zod strips what it does not declare. The till has
       always sent this and it was always thrown away here, so every sale_items
       row ever written holds a unit_price of 0. */
    unit_price: z.number().finite().min(0),
    unit_ids: z.array(z.string().uuid()).optional(),
    scans: z.array(z.object({
      pack_code: z.string().optional(),
      item_code: z.string().optional(),
      serial_number: z.string().optional(),
      product_code: z.string().optional(),
      unit_id: z.string().uuid().nullable().optional(),
    })).optional()
  })).min(1, 'A sale must contain at least one item.').max(500),
  payment_method: z.enum(['cash', 'card', 'mobile', 'transfer']),
  total_amount: z.number().min(0),
  subtotal: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  customer_id: z.string().uuid('A customer must be selected for the sale.').optional().nullable(),
});

const verifyPinSchema = z.object({
  pin: z.string().min(1, 'PIN is required'),
});

const finalizeSaleSchema = z.object({
  settlement_id: z.string().uuid(),
  payment_method: z.enum(['cash', 'card', 'mobile', 'transfer']),
  amount_paid: z.number().finite().min(0).max(9999999999.99),
  store_credit: z.number().finite().min(0).max(9999999999.99).default(0),
  points: z.number().int().min(0).max(2147483647).default(0),
});

/**
 * GET /api/sales
 * Fetch all sales with line items and product names.
 * Access: All authenticated staff
 */
router.get('/', authGuard, permissionCheck('view_sales'), apiCache(5), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { customer_id } = req.query;

    let query = supabaseAdmin
      .from('sales')
      .select(`
        *,
        salesperson:users!salesperson_id(id, name, email),
        customer:customers!customer_id(id, name, phone),
        sale_items(
          id,
          quantity,
          unit_price,
          product:products!product_id(id, name, sku)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    if (req.user.active_location_id) {
      query = query.eq('location_id', req.user.active_location_id);
    } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (req.user.location_ids && req.user.location_ids.length > 0) {
        query = query.in('location_id', req.user.location_ids);
      } else {
        query = query.eq('location_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error, count } = await query;

    if (error) throw error;
    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching sales:');
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

/**
 * GET /api/sales/history
 * Fetch historical sales with date range filtering.
 * Access: All authenticated staff (scoped to their location)
 */
router.get('/export', authGuard, permissionCheck('view_sales'), async (req, res) => {
  try {
    const range = reportRange(req.query.startDate, req.query.endDate, { defaults: true });
    const sales = await fetchAllRows(() => applyReportRange(scopeSales(supabaseAdmin.from('sales')
      .select('id, created_at, accounting_at, receipt_number, status, total_amount, payment_method, customer:customers!customer_id(name), salesperson:users!salesperson_id(name)'), req.user), range, 'accounting_at')
      .order('accounting_at', { ascending: false }).order('id'));
    // Quote every cell and neutralize spreadsheet formulas from user-entered names.
    const cell = value => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [['Sale ID', 'Date', 'Receipt #', 'Customer', 'Status', 'Total', 'Payment Method', 'Salesperson'],
      ...sales.map(sale => [sale.id, sale.accounting_at || sale.created_at, sale.receipt_number, sale.customer?.name, sale.status,
        Number(sale.total_amount).toFixed(2), sale.payment_method, sale.salesperson?.name])];
    res.attachment(`sales_${range.startDate.slice(0, 10)}_${range.endDate.slice(0, 10)}.csv`);
    res.type('text/csv').send('\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'));
  } catch (err) {
    logger.error({ err }, 'Sales export failed');
    res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? err.message : 'Failed to export sales' });
  }
});

router.get('/history', authGuard, permissionCheck('view_sales'), apiCache(5), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    let query = supabaseAdmin
      .from('sales')
      .select(`
        *,
        salesperson:users!salesperson_id(id, name, email),
        customer:customers!customer_id(id, name, phone, customer_code),
        sale_items(
          id,
          quantity,
          unit_price,
          product:products!product_id(id, name, sku)
        )
      `, { count: 'exact' })
      .order('accounting_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (req.user.active_location_id) {
      query = query.eq('location_id', req.user.active_location_id);
    } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (req.user.location_ids && req.user.location_ids.length > 0) {
        query = query.in('location_id', req.user.location_ids);
      } else {
        query = query.eq('location_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    query = applyReportRange(query, reportRange(startDate, endDate), 'accounting_at');

    const { data, error, count } = await query;

    if (error) throw error;
    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching sales history:');
    res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? err.message : 'Failed to fetch sales history' });
  }
});

/**
 * GET /api/sales/:id
 * Fetch a single sale's details
 * Access: All authenticated staff
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;

    let query = supabaseAdmin
      .from('sales')
      .select(`
        *,
        salesperson:users!salesperson_id(id, name, email),
        customer:customers!customer_id(id, name, phone),
        sale_items(
          id,
          quantity,
          unit_price,
          product:products!product_id(id, name, sku)
        )
      `)
      .eq('id', saleId)
      .single();

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (req.user.active_location_id) {
      query = query.eq('location_id', req.user.active_location_id);
    } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (req.user.location_ids && req.user.location_ids.length > 0) {
        query = query.in('location_id', req.user.location_ids);
      } else {
        query = query.eq('location_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching sale:');
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

/**
 * POST /api/sales
 * Create a new sale and update product inventory.
 * Access: Must have create_sales permission
 */
router.post('/', authGuard, permissionCheck('create_sales'), validateBody(createSaleSchema), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('reserve_sale_transaction', {
      p_business_id: req.user.business_id, p_location_id: req.user.active_location_id,
      p_actor_id: req.user.id, p_request: req.body,
    });
    if (error) return transactionError(res, error, 'Checkout could not be reserved. Retry the same checkout.');
    if (!data.replayed) {
      const context = {userId:req.user.id,businessId:req.user.business_id,locationId:req.user.active_location_id};
      runChecks('sale', context);
      if (req.body.discount > 0) runChecks('discount', context);
    }
    for (const prefix of ['/api/sales','/api/products','/api/inventory']) invalidateCachePrefix(prefix);
    res.status(data.replayed ? 200 : 201).json(data);
  } catch (err) { return transactionError(res, err, 'Checkout could not be reserved. Retry the same checkout.'); }
});

router.post('/reservations/:operationId/cancel', authGuard, permissionCheck('create_sales'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.operationId).success) return res.status(400).json({ error: 'Invalid checkout reference' });
  const { data, error } = await supabaseAdmin.rpc('cancel_checkout_reservation', {
    p_business_id: req.user.business_id, p_location_id: req.user.active_location_id,
    p_actor_id: req.user.id, p_operation_id: req.params.operationId,
  });
  if (error) return transactionError(res, error, 'Could not confirm checkout cancellation. Retry the saved cancellation.');
  for (const prefix of ['/api/products', '/api/inventory', '/api/sales']) invalidateCachePrefix(prefix);
  res.json(data);
});

router.post('/offline-sync', authGuard, permissionCheck('create_sales'),
  validateBody(z.object({ stage1: createSaleSchema, stage2: finalizeSaleSchema })), async (req, res) => {
    const { data, error } = await supabaseAdmin.rpc('sync_offline_sale', {
      p_business_id: req.user.business_id, p_location_id: req.user.active_location_id,
      p_actor_id: req.user.id, p_request: req.body.stage1, p_payment: req.body.stage2,
    });
    if (error) return transactionError(res, error, 'Saved payment could not be synced. Retry the same payment.');
    for (const prefix of ['/api/sales','/api/products','/api/inventory','/api/ledger','/api/analytics','/api/loyalty','/api/hr']) invalidateCachePrefix(prefix);
    res.json(data);
  });

/**
 * PUT /api/sales/:id/void
 * Void a sale and return stock to inventory.
 */
router.put('/:id/void', authGuard, permissionCheck('create_sales'), async (req, res) => {
  const { data: sale, error } = await supabaseAdmin.from('sales').select('id,status')
    .eq('id',req.params.id).eq('business_id',req.user.business_id).eq('location_id',req.user.active_location_id).maybeSingle();
  if (error) return transactionError(res,error,'Could not load checkout');
  if (!sale) return res.status(404).json({error:'Sale not found in this branch'});
  if (sale.status !== 'pending') return res.status(409).json({error:'Use Returns to reverse a completed sale. Historical void requests require reconciliation.'});
  const result = await reversePendingSale(sale.id,{reason:'Cancelled checkout'});
  invalidateCachePrefix('/api/sales'); invalidateCachePrefix('/api/products');
  return res.status(result.reversed ? 200 : 409).json({message:result.reversed ? 'Pending sale cancelled' : 'Sale changed; reload before continuing'});
});
for (const action of ['approve-void','reject-void']) {
  router.put(`/:id/${action}`,authGuard,permissionCheck('manage_returns'),(_req,res)=>res.status(409).json({error:'This historical void request requires reconciliation. Use Returns for completed sales.'}));
}

/**
 * POST /api/sales/verify-pin
 * Verify a manager PIN (for POS terminal use).
 */
router.post('/verify-pin', authGuard, validateBody(verifyPinSchema), async (req, res) => {
  try {
    const { pin } = req.body;

    const { data: managers } = await supabaseAdmin
      .from('users')
      .select('id, name, manager_pin')
      .eq('business_id', req.user.business_id)
      .not('manager_pin', 'is', null);

    if (!managers) return res.status(403).json({ error: 'No managers with PINs found.' });

    for (const mgr of managers) {
      if (await bcrypt.compare(pin, mgr.manager_pin)) {
        return res.json({ valid: true, manager_name: mgr.name });
      }
    }

    return res.status(403).json({ valid: false, error: 'Invalid PIN' });
  } catch (err) {
    logger.error({ err: err }, 'Error verifying PIN:');
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

/**
 * DELETE /api/sales/:id
 * Hard delete a sale and return stock to inventory.
 * Access: Business Admins only.
 */
router.delete('/:id', authGuard, permissionCheck('create_sales'), (_req, res) => {
  res.status(409).json({ error: 'Sales and stock history are retained. Cancel a pending checkout or use Returns for a completed sale.' });
});

/**
 * POST /api/sales/:id/finalize
 * Stage 2 of POS: Finalize a pending sale
 */
router.post('/:id/finalize', authGuard, permissionCheck('create_sales'), validateBody(finalizeSaleSchema), async (req, res) => {
  try {
    if (!req.user.active_location_id) return res.status(400).json({ error: 'Select a branch before completing payment.' });
    const { settlement_id, payment_method, amount_paid, store_credit, points } = req.body;
    const { data, error } = await supabaseAdmin.rpc('finalize_sale_transaction', {
      p_business_id: req.user.business_id,
      p_location_id: req.user.active_location_id,
      p_actor_id: req.user.id,
      p_sale_id: req.params.id,
      p_settlement_id: settlement_id,
      p_payment_method: payment_method,
      p_amount_paid: amount_paid,
      p_store_credit: store_credit,
      p_points: points,
    });
    if (error) return transactionError(res, error, 'Payment could not be completed. Retry the same payment.');
    invalidateCachePrefix('/api/sales');
    for (const prefix of ['/api/analytics','/api/ledger','/api/loyalty','/api/hr','/api/inventory']) invalidateCachePrefix(prefix);
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error finalizing sale');
    return transactionError(res, err, 'Payment could not be completed. Retry the same payment.');
  }
});

/**
 * POST /api/sales/:id/cancel
 * Cancel a pending sale and restore inventory
 */
router.post('/:id/cancel', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const saleId = req.params.id;

    /* Ownership is checked here rather than in the service, because the
       sweeper has no request and no user to check against. */
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('business_id, status, location_id')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.business_id !== req.user.business_id || !req.user.active_location_id || sale.location_id !== req.user.active_location_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await reversePendingSale(saleId, { reason: 'cancelled at the till' });

    /* Already reversed, or finalised while the request was in flight. Neither
       is an error worth showing a cashier who has moved on. */
    if (!result.reversed && result.skipped !== 'not-found') {
      return res.json({ message: 'Sale is no longer pending', status: result.skipped });
    }

    invalidateCachePrefix('/api/sales');
    res.json({ message: 'Sale cancelled and inventory restored' });
  } catch (err) {
    logger.error({ err }, 'Error cancelling sale:');
    res.status(500).json({ error: 'Failed to cancel sale' });
  }
});

module.exports = router;
