const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const crypto = require('crypto');
const { runChecks } = require('../services/lossPreventionEngine');

const router = express.Router();

const createSaleSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_ids: z.array(z.string().uuid()).optional(),
    scans: z.array(z.object({
      pack_code: z.string().optional(),
      item_code: z.string().optional(),
      serial_number: z.string().optional(),
      product_code: z.string().optional(),
      unit_id: z.string().uuid().optional(),
    })).optional()
  })).min(1, 'A sale must contain at least one item.'),
  payment_method: z.enum(['cash', 'card', 'mobile']),
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
  amount_paid: z.number().min(0).optional(),
});

/**
 * GET /api/sales
 * Fetch all sales with line items and product names.
 * Access: All authenticated staff
 */
router.get('/', authGuard, permissionCheck('view_sales'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

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
router.get('/history', authGuard, permissionCheck('view_sales'), async (req, res) => {
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
      .order('created_at', { ascending: false })
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

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
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
    logger.error({ err: err }, 'Error fetching sales history:');
    res.status(500).json({ error: 'Failed to fetch sales history' });
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
    const { items, payment_method, total_amount, subtotal, tax, discount, customer_id } = req.body;

    const validPaymentMethods = ['cash', 'card', 'mobile'];
    if (!validPaymentMethods.includes(payment_method)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}.`,
      });
    }

    let location_id = req.user.active_location_id;
    if (!location_id) {
       return res.status(400).json({ error: 'Bad request', message: 'Active location not set. Please select a branch to process sales.' });
    }

    // Fetch business settings to know QR tracking mode
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('qr_tracking_mode, max_discount_percent')
      .eq('id', req.user.business_id)
      .single();

    const isDoubleMode = business?.qr_tracking_mode === 'double';

    const receipt_number = 'RCPT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Process unit validation and assignment
    const allUnitIds = [];
    
    for (const item of items) {
      if (item.unit_ids && Array.isArray(item.unit_ids)) {
        allUnitIds.push(...item.unit_ids);
      }
      
      if (item.scans && Array.isArray(item.scans)) {
        for (const scan of item.scans) {
          if (scan.unit_id) {
             allUnitIds.push(scan.unit_id);
             continue;
          }
          
          if (isDoubleMode) {
             if (!scan.pack_code || !scan.item_code || !scan.serial_number) {
               return res.status(400).json({ error: 'In double QR tracking mode, all scans must include pack_code, item_code, and serial_number.' });
             }

             // Find the pack code in qr pool
             const { data: packQr } = await supabaseAdmin.from('qr_code_pool').select('id').eq('code', scan.pack_code).single();
             if (!packQr) return res.status(400).json({ error: `Invalid pack code: ${scan.pack_code}` });

             // Find the inventory unit by pack code and serial
             const { data: unit } = await supabaseAdmin
               .from('inventory_units')
               .select('id, qr_code_id, status')
               .eq('pack_code_id', packQr.id)
               .eq('serial_number', scan.serial_number)
               .eq('product_id', item.product_id)
               .single();

             if (!unit) return res.status(400).json({ error: `Unit not found for Pack Code: ${scan.pack_code} and Serial: ${scan.serial_number}` });
             if (unit.status !== 'in_stock') return res.status(400).json({ error: `Unit with Pack Code ${scan.pack_code} is ${unit.status}, not in stock.` });

             // Check item code
             const { data: itemQr } = await supabaseAdmin.from('qr_code_pool').select('id, status').eq('code', scan.item_code).single();
             if (!itemQr) return res.status(400).json({ error: `Invalid item code: ${scan.item_code}` });

             if (!unit.qr_code_id) {
               // Assign item code to unit
               if (itemQr.status !== 'unassigned') return res.status(400).json({ error: `Item code ${scan.item_code} is already assigned.` });
               await supabaseAdmin.from('inventory_units').update({ qr_code_id: itemQr.id }).eq('id', unit.id);
               await supabaseAdmin.from('qr_code_pool').update({ status: 'assigned' }).eq('id', itemQr.id);
             } else if (unit.qr_code_id !== itemQr.id) {
               return res.status(400).json({ error: `Scanned item code does not match the unit's assigned item code.` });
             }

             allUnitIds.push(unit.id);
          } else {
             // Single mode
             if (!scan.item_code) return res.status(400).json({ error: 'Item code is required in single QR tracking mode.' });
             
             const { data: itemQr } = await supabaseAdmin.from('qr_code_pool').select('id').eq('code', scan.item_code).single();
             if (!itemQr) return res.status(400).json({ error: `Invalid item code: ${scan.item_code}` });

             const { data: unit } = await supabaseAdmin
               .from('inventory_units')
               .select('id, status')
               .eq('qr_code_id', itemQr.id)
               .eq('product_id', item.product_id)
               .single();

             if (!unit) return res.status(400).json({ error: `Unit not found for Item Code: ${scan.item_code}` });
             if (unit.status !== 'in_stock') return res.status(400).json({ error: `Unit with Item Code ${scan.item_code} is ${unit.status}.` });

             allUnitIds.push(unit.id);
          }
        }
      }
    }

    // Call the Postgres RPC function
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('process_sale_transaction', {
      p_business_id: req.user.business_id,
      p_location_id: location_id,
      p_salesperson_id: req.user.id,
      p_customer_id: customer_id || null,
      p_total_amount: total_amount || 0,
      p_discount_amount: discount || 0,
      p_payment_method: payment_method,
      p_receipt_number: receipt_number,
      p_items: items,
      p_unit_ids: allUnitIds
    });

    if (rpcError) {
      logger.error({ err: rpcError }, 'RPC Sale transaction error:');
      return res.status(500).json({ 
        error: 'Transaction failed', 
        message: rpcError.message || 'Could not finalize sale. Please check stock levels and try again.'
      });
    }

    const saleId = rpcResult.sale_id;

    if (Number(discount) > 0) {
      // Check against business discount cap asynchronously since it's non-critical to the transaction
      const subtotalBeforeDiscount = Number(total_amount) + Number(discount);
      const discountPercent = subtotalBeforeDiscount > 0 ? (Number(discount) / subtotalBeforeDiscount) * 100 : 0;

      const { data: bizSettings } = await supabaseAdmin
        .from('businesses')
        .select('max_discount_percent')
        .eq('id', req.user.business_id)
        .single();

      const maxDiscount = bizSettings?.max_discount_percent || 15;

      if (discountPercent > maxDiscount) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: req.user.business_id,
          location_id: location_id,
          type: 'HIGH_DISCOUNT',
          user_id: req.user.id,
          reference_id: saleId,
          note: `High discount of $${Number(discount).toFixed(2)} (${discountPercent.toFixed(1)}%) applied to sale #${saleId}`
        }]);
      } else {
        await supabaseAdmin.from('alerts').insert([{
          business_id: req.user.business_id,
          location_id: location_id,
          type: 'DISCOUNT',
          user_id: req.user.id,
          reference_id: saleId,
          note: `Discount of $${Number(discount).toFixed(2)} (${discountPercent.toFixed(1)}%) applied to sale #${saleId}`
        }]);
      }

      // Trigger detection engine for discount patterns
      runChecks('discount', { userId: req.user.id, businessId: req.user.business_id, locationId: location_id });
    }

    // Trigger after-hours check for the sale
    runChecks('sale', { userId: req.user.id, businessId: req.user.business_id, locationId: location_id });

    return res.status(201).json({
      message: 'Sale recorded successfully',
      sale: saleData,
    });
  } catch (err) {
    logger.error({ err: err }, 'POST /sales error:');
    return res.status(500).json({
      error: 'Internal server error',
      message: `An unexpected error occurred while processing the sale. ${err.message || ''}`,
    });
  }
});

/**
 * PUT /api/sales/:id/void
 * Void a sale and return stock to inventory.
 */
router.put('/:id/void', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const saleId = req.params.id;
    const { manager_pin } = req.body; // Optional: manager PIN for immediate void

    // Fetch sale and its items
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('id, status, location_id, business_id, total_amount, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status === 'voided') return res.status(400).json({ error: 'Sale already voided' });
    if (sale.status === 'void_pending') return res.status(400).json({ error: 'Void already pending approval' });

    // Enforce business isolation
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const isManager = ['Manager', 'Admin', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    let canVoidImmediately = isManager;

    // If not a manager, check if they provided a valid manager PIN
    if (!canVoidImmediately && manager_pin) {
      // Find a manager at this location with a matching PIN
      const { data: managers } = await supabaseAdmin
        .from('users')
        .select('id, manager_pin, name')
        .eq('business_id', sale.business_id)
        .not('manager_pin', 'is', null);

      if (managers) {
        for (const mgr of managers) {
          if (mgr.manager_pin && await bcrypt.compare(manager_pin, mgr.manager_pin)) {
            canVoidImmediately = true;
            break;
          }
        }
      }

      if (!canVoidImmediately) {
        return res.status(403).json({ error: 'Invalid manager PIN' });
      }
    }

    if (!canVoidImmediately) {
      // Non-manager without PIN → set to void_pending
      await supabaseAdmin
        .from('sales')
        .update({ status: 'void_pending' })
        .eq('id', saleId);

      await supabaseAdmin.from('alerts').insert([{
        business_id: sale.business_id,
        location_id: sale.location_id,
        type: 'VOID_REQUEST',
        severity: 'high',
        user_id: req.user.id,
        reference_id: sale.id,
        note: `Void requested for sale #${saleId} ($${Number(sale.total_amount).toFixed(2)}). Awaiting manager approval.`,
        metadata: { sale_id: saleId, amount: Number(sale.total_amount) }
      }]);

      runChecks('void', { userId: req.user.id, businessId: sale.business_id, locationId: sale.location_id });

      return res.json({ message: 'Void request submitted. Awaiting manager approval.', status: 'void_pending' });
    }

    // Manager or PIN verified → complete the void immediately
    await completeVoid(sale, req.user.id);

    // Trigger detection engine
    runChecks('void', { userId: req.user.id, businessId: sale.business_id, locationId: sale.location_id });

    res.json({ message: 'Sale voided successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error voiding sale:');
    res.status(500).json({ error: 'Failed to void sale' });
  }
});

/**
 * Helper: Complete a void (restore stock, create movements, fire alert)
 */
async function completeVoid(sale, userId) {
  await supabaseAdmin
    .from('sales')
    .update({ status: 'voided' })
    .eq('id', sale.id);

  for (const item of sale.sale_items) {
    const { data: inv } = await supabaseAdmin
      .from('product_inventory')
      .select('quantity')
      .eq('product_id', item.product_id)
      .eq('location_id', sale.location_id)
      .single();

    if (inv) {
      await supabaseAdmin
        .from('product_inventory')
        .update({ quantity: inv.quantity + item.quantity })
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id);
    }

    await supabaseAdmin.from('stock_movements').insert([{
      business_id: sale.business_id,
      location_id: sale.location_id,
      product_id: item.product_id,
      quantity_change: item.quantity,
      movement_type: 'ADJUSTMENT',
      user_id: userId,
      reference_id: sale.id,
      notes: `Voided Sale #${sale.id}`
    }]);
  }

  await supabaseAdmin.from('alerts').insert([{
    business_id: sale.business_id,
    location_id: sale.location_id,
    type: 'VOID',
    severity: 'medium',
    user_id: userId,
    reference_id: sale.id,
    note: `Sale #${sale.id} was voided`
  }]);
}

/**
 * PUT /api/sales/:id/approve-void
 * Manager approves a pending void.
 */
router.put('/:id/approve-void', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;
    const isManager = ['Manager', 'Admin', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!isManager) return res.status(403).json({ error: 'Only managers can approve voids.' });

    const { data: sale, error: fetchErr } = await supabaseAdmin
      .from('sales')
      .select('id, status, location_id, business_id, total_amount, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchErr || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status !== 'void_pending') return res.status(400).json({ error: 'Sale is not pending void approval.' });

    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await completeVoid(sale, req.user.id);

    // Resolve the VOID_REQUEST alert
    await supabaseAdmin
      .from('alerts')
      .update({ status: 'resolved', resolved_by: req.user.id, resolved_at: new Date().toISOString() })
      .eq('reference_id', saleId)
      .eq('type', 'VOID_REQUEST');

    res.json({ message: 'Void approved. Sale voided and stock restored.' });
  } catch (err) {
    logger.error({ err: err }, 'Error approving void:');
    res.status(500).json({ error: 'Failed to approve void' });
  }
});

/**
 * PUT /api/sales/:id/reject-void
 * Manager rejects a pending void.
 */
router.put('/:id/reject-void', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;
    const isManager = ['Manager', 'Admin', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!isManager) return res.status(403).json({ error: 'Only managers can reject voids.' });

    const { data: sale, error: fetchErr } = await supabaseAdmin
      .from('sales')
      .select('id, status, business_id')
      .eq('id', saleId)
      .single();

    if (fetchErr || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status !== 'void_pending') return res.status(400).json({ error: 'Sale is not pending void approval.' });

    // Revert to completed
    await supabaseAdmin
      .from('sales')
      .update({ status: 'completed' })
      .eq('id', saleId);

    // Resolve the VOID_REQUEST alert
    await supabaseAdmin
      .from('alerts')
      .update({ status: 'resolved', resolved_by: req.user.id, resolved_at: new Date().toISOString() })
      .eq('reference_id', saleId)
      .eq('type', 'VOID_REQUEST');

    res.json({ message: 'Void rejected. Sale remains completed.' });
  } catch (err) {
    logger.error({ err: err }, 'Error rejecting void:');
    res.status(500).json({ error: 'Failed to reject void' });
  }
});

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
router.delete('/:id', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;

    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can permanently delete sales.' });
    }

    // Fetch sale and its items
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('id, status, location_id, business_id, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });

    // Enforce business isolation
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // If sale wasn't voided before deleting, restore inventory and create stock movements
    if (sale.status !== 'voided') {
      for (const item of sale.sale_items) {
        // Get current inventory
        const { data: inv } = await supabaseAdmin
          .from('product_inventory')
          .select('quantity')
          .eq('product_id', item.product_id)
          .eq('location_id', sale.location_id)
          .single();
        
        if (inv) {
          await supabaseAdmin
            .from('product_inventory')
            .update({ quantity: inv.quantity + item.quantity })
            .eq('product_id', item.product_id)
            .eq('location_id', sale.location_id);
        }

        await supabaseAdmin.from('stock_movements').insert([{
          business_id: sale.business_id,
          location_id: sale.location_id,
          product_id: item.product_id,
          quantity_change: item.quantity,
          movement_type: 'ADJUSTMENT',
          user_id: req.user.id,
          reference_id: sale.id,
          notes: `Deleted Sale #${sale.id}`
        }]);
      }
    }

    // Delete stock movements referencing this sale (sales deletion itself doesn't cascade to stock_movements)
    await supabaseAdmin
      .from('stock_movements')
      .delete()
      .eq('reference_id', sale.id);

    // Delete alerts referencing this sale
    await supabaseAdmin
      .from('alerts')
      .delete()
      .eq('reference_id', sale.id);

    // Delete the sale (sale_items will cascade)
    const { error: deleteError } = await supabaseAdmin
      .from('sales')
      .delete()
      .eq('id', saleId);
    
    if (deleteError) throw deleteError;

    res.json({ message: 'Sale deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting sale:');
    res.status(500).json({ error: 'Failed to delete sale' });
  }
});

/**
 * POST /api/sales/:id/finalize
 * Stage 2 of POS: Finalize a pending sale
 */
router.post('/:id/finalize', authGuard, permissionCheck('create_sales'), validateBody(finalizeSaleSchema), async (req, res) => {
  try {
    const saleId = req.params.id;
    const { amount_paid } = req.body;

    // Verify ownership
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('business_id, status, total_amount')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (sale.status !== 'pending') {
      return res.status(400).json({ error: 'Sale is not in a pending state' });
    }

    // Update sale status
    const { data: updatedSale, error: updateError } = await supabaseAdmin
      .from('sales')
      .update({ status: 'completed' })
      .eq('id', saleId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update inventory units to sold
    await supabaseAdmin
      .from('inventory_units')
      .update({ status: 'sold' })
      .eq('sold_in_sale_id', saleId)
      .eq('status', 'pending_sale');

    res.json({ message: 'Sale finalized successfully', sale: updatedSale });
  } catch (err) {
    logger.error({ err: err }, 'Error finalizing sale:');
    res.status(500).json({ error: 'Failed to finalize sale' });
  }
});

/**
 * POST /api/sales/:id/cancel
 * Cancel a pending sale and restore inventory
 */
router.post('/:id/cancel', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const saleId = req.params.id;

    // Verify ownership
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('business_id, status, location_id, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (sale.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending sales can be cancelled' });
    }

    // 1. Restore product inventory
    for (const item of sale.sale_items) {
      const { data: inv } = await supabaseAdmin
        .from('product_inventory')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id)
        .single();
        
      if (inv) {
        await supabaseAdmin
          .from('product_inventory')
          .update({ quantity: inv.quantity + item.quantity })
          .eq('product_id', item.product_id)
          .eq('location_id', sale.location_id);
      }
    }

    // 2. Restore inventory units
    await supabaseAdmin
      .from('inventory_units')
      .update({ status: 'in_stock', sold_in_sale_id: null })
      .eq('sold_in_sale_id', saleId);

    // 3. Mark sale as voided
    const { error: voidError } = await supabaseAdmin
      .from('sales')
      .update({ status: 'void_pending' }) // or 'voided', but per schema constraints void_pending fits
      .eq('id', saleId);

    if (voidError) throw voidError;

    res.json({ message: 'Sale cancelled and inventory restored' });
  } catch (err) {
    logger.error({ err: err }, 'Error cancelling sale:');
    res.status(500).json({ error: 'Failed to cancel sale' });
  }
});

module.exports = router;
