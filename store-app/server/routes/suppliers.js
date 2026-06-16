const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/suppliers
 * List all suppliers for the business. Optionally filter by active status.
 * Access: Inventory managers
 */
router.get('/', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const showArchived = req.query.archived === 'true';

    let query = supabaseAdmin
      .from('suppliers')
      .select(`
        *,
        purchase_orders:purchase_orders!supplier_id(id)
      `)
      .order('name');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (!showArchived) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Add po_count to each supplier
    const enriched = (data || []).map(s => ({
      ...s,
      po_count: s.purchase_orders?.length || 0,
      purchase_orders: undefined // Remove raw join data
    }));

    res.json(enriched);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching suppliers:');
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

/**
 * GET /api/suppliers/:id
 * Get a single supplier with purchase history summary.
 * Access: Inventory managers
 */
router.get('/:id', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabaseAdmin
      .from('suppliers')
      .select('*')
      .eq('id', id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data: supplier, error } = await query.single();
    if (error || !supplier) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    // Fetch purchase order history for this supplier
    const { data: orders } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, currency, created_at, expected_date, received_date')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    const totalSpend = (orders || [])
      .filter(o => o.status === 'received' || o.status === 'partial')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    res.json({
      ...supplier,
      purchase_orders: orders || [],
      total_spend: totalSpend,
      po_count: (orders || []).length
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching supplier:');
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

/**
 * POST /api/suppliers
 * Create a new supplier.
 * Access: Inventory managers
 */
router.post('/', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, notes, payment_terms, lead_time_days } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Bad request', message: 'Supplier name is required.' });
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert({
        business_id: req.user.business_id,
        name: name.trim(),
        contact_person: contact_person || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
        payment_terms: payment_terms || 'Net 30',
        lead_time_days: lead_time_days ? parseInt(lead_time_days, 10) : 7
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Supplier created successfully', supplier: data });
  } catch (err) {
    logger.error({ err: err }, 'Error creating supplier:');
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

/**
 * PUT /api/suppliers/:id
 * Update supplier details.
 * Access: Inventory managers
 */
router.put('/:id', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_person, phone, email, address, notes, payment_terms, lead_time_days } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Bad request', message: 'Supplier name is required.' });
    }

    let query = supabaseAdmin
      .from('suppliers')
      .update({
        name: name.trim(),
        contact_person: contact_person || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
        payment_terms: payment_terms || 'Net 30',
        lead_time_days: lead_time_days ? parseInt(lead_time_days, 10) : 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Supplier not found.' });

    res.json({ message: 'Supplier updated successfully', supplier: data });
  } catch (err) {
    logger.error({ err: err }, 'Error updating supplier:');
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

/**
 * PUT /api/suppliers/:id/archive
 * Toggle the is_active flag (soft-delete / reactivate).
 * Access: Inventory managers
 */
router.put('/:id/archive', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get current state
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('suppliers')
      .select('is_active')
      .eq('id', id)
      .eq('business_id', req.user.business_id)
      .single();

    if (fetchErr || !current) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const newStatus = !current.is_active;

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', req.user.business_id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: newStatus ? 'Supplier reactivated' : 'Supplier archived',
      supplier: data
    });
  } catch (err) {
    logger.error({ err: err }, 'Error archiving supplier:');
    res.status(500).json({ error: 'Failed to update supplier status' });
  }
});

module.exports = router;
