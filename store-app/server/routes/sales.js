const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { resolveCurrency } = require('../utils/currency');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { apiCache, invalidateCachePrefix } = require('../middleware/apiCache');
const crypto = require('crypto');
const { computeTax } = require('../utils/tax');
const { reversePendingSale } = require('../services/pendingSales');
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
      unit_id: z.string().uuid().nullable().optional(),
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

    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.unit_price == null) item.unit_price = 0;
      }
    }

    const validPaymentMethods = ['cash', 'card', 'mobile'];
    if (!validPaymentMethods.includes(payment_method)) {
      console.log('400 Error: Invalid payment method', payment_method);
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}.`,
      });
    }

    let location_id = req.user.active_location_id;
    if (!location_id) {
       console.log('400 Error: Active location not set');
       return res.status(400).json({ error: 'Bad request', message: 'Active location not set. Please select a branch to process sales.' });
    }
    if (location_id === '00000000-0000-0000-0000-000000000000') {
      const { data: realLocation } = await supabaseAdmin.from('locations').select('id').eq('business_id', req.user.business_id).limit(1).maybeSingle();
      if (realLocation) {
        location_id = realLocation.id;
      } else {
        return res.status(400).json({ error: 'Bad request', message: 'No valid location found to process the sale.' });
      }
    }

    /* Fetch business settings to know QR tracking mode, and the tax settings
       if this database has them.

       Asked for in one round trip, with a fallback to the pre-074 column set.
       Code deploys before a migration is applied, and if the tax columns are
       missing PostgREST fails the whole select rather than returning the rest:
       `business` would come back null and qr_tracking_mode with it, which
       silently disables the serial-scanning enforcement that exists to stop
       stock walking out. A failed sale is loud. That would have been quiet. */
    let business = null;
    let taxSettings = null;
    {
      const withTax = await supabaseAdmin
        .from('businesses')
        .select('qr_tracking_mode, max_discount_percent, tax_enabled, tax_rate, tax_inclusive, tax_label')
        .eq('id', req.user.business_id)
        .single();

      if (!withTax.error) {
        business = withTax.data;
        taxSettings = withTax.data;
      } else {
        const basic = await supabaseAdmin
          .from('businesses')
          .select('qr_tracking_mode, max_discount_percent')
          .eq('id', req.user.business_id)
          .single();
        business = basic.data;
      }
    }

    const isDoubleMode = business?.qr_tracking_mode === 'double';

    /* Tax is derived from the business's own settings, and the `tax` field in
       the request body is ignored. It has been accepted by the schema and
       silently dropped since the beginning; now that the number reaches a
       receipt and a report, a value chosen by the browser is not one to write
       down.

       Under exclusive pricing this changes the amount charged, so `taxed.total`
       is what goes to the RPC rather than the total the till posted. The till
       shows the same figure because it applies the same rule for display. */
    const taxed = computeTax({
      total: total_amount || 0,
      rate: taxSettings?.tax_rate,
      enabled: taxSettings?.tax_enabled === true,
      inclusive: taxSettings?.tax_inclusive !== false,
    });

    const receipt_number = 'RCPT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // In double mode, whether a serial number must be scanned is a per-product
    // setting. Fetched in one round trip for the whole sale rather than one per
    // line item, a ten-product batch sale was issuing ten sequential queries
    // before anything was written.
    //
    // A product missing from the result stays required: absent means we could
    // not confirm it is serial-less, and defaulting the other way would let a
    // serial-tracked item leave without one.
    const requiresSerialByProduct = new Map();
    if (isDoubleMode) {
      const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: prodRows } = await supabaseAdmin
          .from('products')
          .select('id, requires_serial')
          .in('id', productIds);
        for (const row of prodRows || []) {
          requiresSerialByProduct.set(row.id, row.requires_serial !== false);
        }
      }
    }

    // Process unit validation and assignment
    const allUnitIds = [];

    for (const item of items) {
      if (item.unit_ids && Array.isArray(item.unit_ids)) {
        allUnitIds.push(...item.unit_ids);
      }

      const itemRequiresSerial = isDoubleMode
        ? (requiresSerialByProduct.get(item.product_id) ?? true)
        : true;

      if (item.scans && Array.isArray(item.scans)) {
        for (const scan of item.scans) {
          if (scan.unit_id) {
             allUnitIds.push(scan.unit_id);
             continue;
          }
          
          if (isDoubleMode) {
             if (!scan.pack_code || !scan.item_code || (itemRequiresSerial && !scan.serial_number)) {
               return res.status(400).json({ error: itemRequiresSerial
                 ? 'In double QR tracking mode, all scans must include pack_code, item_code, and serial_number.'
                 : 'In double QR tracking mode, all scans must include pack_code and item_code.' });
             }

             // Find the pack code in qr pool
             const { data: packQr } = await supabaseAdmin.from('qr_code_pool').select('id').eq('code', scan.pack_code).single();
             if (!packQr) return res.status(400).json({ error: `Invalid pack code: ${scan.pack_code}` });

             // Find the inventory unit by pack code (+ serial when the product
             // requires one). Serial-less products identify a unit by its pack
             // code alone, so match the first in-stock unit under that pack.
             let unitQuery = supabaseAdmin
               .from('inventory_units')
               .select('id, qr_code_id, status')
               .eq('pack_code_id', packQr.id)
               .eq('product_id', item.product_id);

             if (itemRequiresSerial) {
               unitQuery = unitQuery.eq('serial_number', scan.serial_number);
             } else {
               unitQuery = unitQuery.eq('status', 'in_stock').limit(1);
             }

             const { data: unit } = await unitQuery.maybeSingle();

             if (!unit) return res.status(400).json({ error: itemRequiresSerial
               ? `Unit not found for Pack Code: ${scan.pack_code} and Serial: ${scan.serial_number}`
               : `No in-stock unit found for Pack Code: ${scan.pack_code}` });
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
              
              // Dev testing bypass for simulated scans
              console.log('SCAN PAYLOAD:', scan);
              console.log('NODE_ENV:', process.env.NODE_ENV);
              if (scan.item_code.startsWith('TEST-QR-CODE-') && process.env.NODE_ENV !== 'production') {
                console.log('EXECUTING DEV BYPASS FOR:', scan.item_code);
                let testUnitId;
                const { data: unit } = await supabaseAdmin
                  .from('inventory_units')
                  .select('id')
                  .eq('product_id', item.product_id)
                  .eq('status', 'in_stock')
                  .limit(1)
                  .maybeSingle();
                if (unit) {
                  testUnitId = unit.id;
                } else {
                  const { data: newUnit, error: newUnitErr } = await supabaseAdmin.from('inventory_units').insert({
                    product_id: item.product_id,
                    location_id: location_id,
                    status: 'in_stock',
                    business_id: req.user.business_id,
                    assigned_by: req.user.id,
                  }).select('id').single();
                  if (newUnitErr || !newUnit) {
                    console.error('Failed to create test unit:', newUnitErr);
                    return res.status(400).json({ error: 'Failed to create test unit: ' + (newUnitErr ? newUnitErr.message : 'Unknown') });
                  }
                  testUnitId = newUnit.id;
                }
                
                // Add stock to product_inventory table to bypass insufficient stock check
                const { data: inv, error: invErr } = await supabaseAdmin.from('product_inventory').select('id, quantity').eq('product_id', item.product_id).eq('location_id', location_id).maybeSingle();
                if (invErr) console.error("DEV BYPASS INV SELECT ERR:", invErr);
                
                if (inv) {
                   const { error: updErr } = await supabaseAdmin.from('product_inventory').update({ quantity: inv.quantity + 10 }).eq('id', inv.id);
                   if (updErr) console.error("DEV BYPASS INV UPDATE ERR:", updErr);
                } else {
                   const { error: insErr } = await supabaseAdmin.from('product_inventory').insert({
                     product_id: item.product_id,
                     location_id: location_id,
                     quantity: 10
                   });
                   if (insErr) console.error("DEV BYPASS INV INSERT ERR:", insErr);
                }
                
                allUnitIds.push(testUnitId);
                continue;
              }

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
      p_total_amount: taxed.total,
      p_discount_amount: discount || 0,
      p_payment_method: payment_method,
      p_receipt_number: receipt_number,
      p_items: items,
      p_unit_ids: allUnitIds,
      /* Only sent when there is tax to record. Tax can only be switched on
         where the columns exist, so a database still on the ten-parameter
         function is never handed the five it does not have. */
      ...(taxed.tax > 0
        ? {
            p_subtotal: taxed.subtotal,
            p_tax_amount: taxed.tax,
            /* Snapshotted, so a rate change next month does not restate this sale. */
            p_tax_rate_applied: Number(taxSettings?.tax_rate),
            p_tax_inclusive_applied: taxSettings?.tax_inclusive !== false,
            p_tax_label_applied: taxSettings?.tax_label || 'VAT',
          }
        : {}),
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

      /* Alert notes are read by a manager on the Alerts page, so the amount
         has to be in the money they actually take. Hardcoding `$` made a
         Ghanaian shop's theft alerts quote a currency it does not trade in.
         Persisted text, so this only affects alerts raised from now on. */
      const alertCurrency = await resolveCurrency(supabaseAdmin, req.user.business_id, location_id);
      const alertMoney = new Intl.NumberFormat('en-GH', { style: 'currency', currency: alertCurrency });

      if (discountPercent > maxDiscount) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: req.user.business_id,
          location_id: location_id,
          type: 'HIGH_DISCOUNT',
          user_id: req.user.id,
          reference_id: saleId,
          note: `High discount of ${alertMoney.format(Number(discount) || 0)} (${discountPercent.toFixed(1)}%) applied to sale #${saleId}`
        }]);
      } else {
        await supabaseAdmin.from('alerts').insert([{
          business_id: req.user.business_id,
          location_id: location_id,
          type: 'DISCOUNT',
          user_id: req.user.id,
          reference_id: saleId,
          note: `Discount of ${alertMoney.format(Number(discount) || 0)} (${discountPercent.toFixed(1)}%) applied to sale #${saleId}`
        }]);
      }

      // Trigger detection engine for discount patterns
      runChecks('discount', { userId: req.user.id, businessId: req.user.business_id, locationId: location_id });
    }

    // Trigger after-hours check for the sale
    runChecks('sale', { userId: req.user.id, businessId: req.user.business_id, locationId: location_id });

    // ─── Commission Calculation (non-blocking) ───
    // Compute applicable commissions and insert into commission_ledger
    try {
      const { data: commRules } = await supabaseAdmin
        .from('commission_rules')
        .select('id, type, value, min_sale_amount, product_category')
        .eq('business_id', req.user.business_id)
        .eq('active', true);

      if (commRules && commRules.length > 0 && saleId) {
        const saleTotal = Number(total_amount) || 0;
        for (const rule of commRules) {
          if (saleTotal < Number(rule.min_sale_amount || 0)) continue;
          // TODO: product_category filtering can be added when category is tracked on sale_items
          const commAmount = rule.type === 'percentage'
            ? saleTotal * (Number(rule.value) / 100)
            : Number(rule.value);

          if (commAmount > 0) {
            await supabaseAdmin.from('commission_ledger').insert({
              user_id: req.user.id,
              sale_id: saleId,
              business_id: req.user.business_id,
              rule_id: rule.id,
              amount: Math.round(commAmount * 100) / 100,
            });
          }
        }
      }
    } catch (commErr) {
      // Commission calculation failure should not block the sale
      logger.error({ err: commErr }, 'Commission calculation failed (non-critical)');
    }

    // ─── Loyalty Points Earn (non-blocking) ───
    // Award loyalty points if customer is attached to the sale and rules exist
    try {
      if (customer_id && saleId) {
        const { data: loyaltyRules } = await supabaseAdmin
          .from('loyalty_rules')
          .select('points_per_currency_unit')
          .eq('business_id', req.user.business_id)
          .eq('active', true)
          .maybeSingle();

        if (loyaltyRules && loyaltyRules.points_per_currency_unit > 0) {
          /* Net of tax. Tax collected is not the shop's money, so it should
             not buy the customer loyalty points. Identical to the old figure
             for every business with tax switched off. */
          const saleTotal = taxed.subtotal;
          const pointsEarned = Math.floor(saleTotal * Number(loyaltyRules.points_per_currency_unit));

          if (pointsEarned > 0) {
            // Get current balance
            const { data: lastEntry } = await supabaseAdmin
              .from('loyalty_ledger')
              .select('balance_after')
              .eq('customer_id', customer_id)
              .eq('business_id', req.user.business_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const currentBalance = lastEntry?.balance_after || 0;

            await supabaseAdmin.from('loyalty_ledger').insert({
              customer_id,
              business_id: req.user.business_id,
              sale_id: saleId,
              type: 'earn',
              points: pointsEarned,
              balance_after: currentBalance + pointsEarned,
              note: `Earned from sale`,
            });
          }
        }
      }
    } catch (loyaltyErr) {
      logger.error({ err: loyaltyErr }, 'Loyalty points earn failed (non-critical)');
    }

    // Invalidate sales cache for this worker
    invalidateCachePrefix('/api/sales');

    return res.status(201).json({
      message: 'Sale recorded successfully',
      /* The body is echoed for the fields the till already knows, but the
         money comes from what was actually written. Echoing req.body alone
         printed the till's pre-tax total on the receipt under exclusive
         pricing, and its hardcoded `tax: 0` under either. */
      sale: {
        id: saleId,
        ...req.body,
        subtotal: taxed.subtotal,
        tax: taxed.tax,
        total_amount: taxed.total,
        tax_rate_applied: taxed.tax > 0 ? Number(taxSettings?.tax_rate) : null,
        tax_inclusive_applied: taxed.tax > 0 ? taxSettings?.tax_inclusive !== false : null,
        tax_label_applied: taxed.tax > 0 ? (taxSettings?.tax_label || 'VAT') : null,
      },
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

      const voidCurrency = await resolveCurrency(supabaseAdmin, sale.business_id, sale.location_id);
      const voidMoney = new Intl.NumberFormat('en-GH', { style: 'currency', currency: voidCurrency });

      await supabaseAdmin.from('alerts').insert([{
        business_id: sale.business_id,
        location_id: sale.location_id,
        type: 'VOID_REQUEST',
        severity: 'high',
        user_id: req.user.id,
        reference_id: sale.id,
        note: `Void requested for sale #${saleId} (${voidMoney.format(Number(sale.total_amount) || 0)}). Awaiting manager approval.`,
        metadata: { sale_id: saleId, amount: Number(sale.total_amount) }
      }]);

      runChecks('void', { userId: req.user.id, businessId: sale.business_id, locationId: sale.location_id });

      return res.json({ message: 'Void request submitted. Awaiting manager approval.', status: 'void_pending' });
    }

    // Manager or PIN verified → complete the void immediately
    await completeVoid(sale, req.user.id);

    // Trigger detection engine
    runChecks('void', { userId: req.user.id, businessId: sale.business_id, locationId: sale.location_id });
    // Invalidate sales cache for this worker
    invalidateCachePrefix('/api/sales');

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

    // Invalidate sales cache for this worker
    invalidateCachePrefix('/api/sales');

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

    /* Ownership is checked here rather than in the service, because the
       sweeper has no request and no user to check against. */
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('business_id, status')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
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
