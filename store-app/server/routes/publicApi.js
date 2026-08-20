const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const requireScope = require('../middleware/requireScope');
const { validateBody } = require('../middleware/validate');
const { apiCache } = require('../middleware/apiCache');
const { OrderError, createOrder, ORDER_SELECT } = require('../services/customerOrders');

const router = express.Router();

function toPublicProduct(p) {
  const stock = (p.product_inventory || []).reduce((sum, inv) => sum + (inv.quantity || 0), 0);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    price: p.price,
    stock,
  };
}

/**
 * GET /api/v1/public/catalog
 * Storefront-safe product list, no cost_price or other internal fields.
 */
router.get('/catalog', requireScope('read:catalog'), apiCache(5), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, sku, name, category, price, product_inventory(quantity)')
      .eq('business_id', req.business.id)
      .order('name');

    if (error) throw error;
    res.json((data || []).map(toPublicProduct));
  } catch (err) {
    logger.error({ err }, 'Error fetching public catalog:');
    res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

/**
 * GET /api/v1/public/catalog/:sku
 * Single product lookup by SKU (storefronts think in SKUs, not internal IDs).
 */
router.get('/catalog/:sku', requireScope('read:catalog'), apiCache(5), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, sku, name, category, price, product_inventory(quantity)')
      .eq('business_id', req.business.id)
      .eq('sku', req.params.sku)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json(toPublicProduct(data));
  } catch (err) {
    logger.error({ err }, 'Error fetching public product:');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

const publicCreateOrderSchema = z.object({
  external_order_id: z.string().optional(),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
  }),
  items: z.array(z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/public/orders
 * Creates a draft customer order from a storefront checkout. Customers are
 * matched/deduped by (business_id, phone), the same unique identity the
 * rest of this app already uses for customers; email is stored only as
 * supplementary contact info, never used for matching.
 */
router.post('/orders', requireScope('write:orders'), validateBody(publicCreateOrderSchema), async (req, res) => {
  try {
    const { customer, items, notes } = req.body;

    const skus = items.map(i => i.sku);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, sku, price')
      .eq('business_id', req.business.id)
      .in('sku', skus);

    if (prodErr) throw prodErr;

    const bySku = new Map((products || []).map(p => [p.sku, p]));
    const missing = skus.filter(sku => !bySku.has(sku));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Unknown SKU(s): ${missing.join(', ')}` });
    }

    const orderItems = items.map(i => {
      const product = bySku.get(i.sku);
      return { product_id: product.id, quantity: i.quantity, unit_price: product.price };
    });

    let customerId;
    const { data: existingCustomer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('business_id', req.business.id)
      .eq('phone', customer.phone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: custErr } = await supabaseAdmin
        .from('customers')
        .insert({
          business_id: req.business.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email || null,
        })
        .select('id')
        .single();

      if (custErr) throw custErr;
      customerId = newCustomer.id;
    }

    const order = await createOrder({
      businessId: req.business.id,
      customerId,
      items: orderItems,
      notes,
    });

    res.status(201).json({ message: 'Order created', order });
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    logger.error({ err }, 'Error creating public order:');
    res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * GET /api/v1/public/orders/:id
 * Status/detail lookup, trimmed of internal-only fields (no creator, etc).
 */
router.get('/orders/:id', requireScope('read:orders'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .select(ORDER_SELECT)
      .eq('id', req.params.id)
      .eq('business_id', req.business.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Order not found' });

    res.json({
      id: data.id,
      order_number: data.order_number,
      status: data.status,
      total_amount: data.total_amount,
      items: data.items,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching public order:');
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

module.exports = router;
