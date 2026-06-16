const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { runChecks } = require('../services/lossPreventionEngine');

const router = express.Router();

/**
 * GET /api/stock
 * Fetch all stock movements with product and user details.
 * Access: All authenticated staff
 */
router.get('/', authGuard, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('stock_movements')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        user:users!user_id(id, name, email)
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
    console.error('Error fetching stock movements:', err);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

/**
 * POST /api/stock/adjust
 * Create a manual stock adjustment (RECEIPT, ADJUSTMENT, SHRINKAGE, RETURN).
 * Access: Managers only (for manual adjustments)
 */
router.post('/adjust', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, quantity_change, movement_type, notes, location_id } = req.body;

    // Validate inputs
    if (!product_id || typeof quantity_change !== 'number' || quantity_change === 0 || !location_id) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id, location_id, and non-zero quantity_change are required' });
    }

    // Verify location ownership
    if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (!req.user.location_ids.includes(location_id)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to adjust stock at this location.' });
      }
    }

    const validTypes = ['RECEIPT', 'ADJUSTMENT', 'SHRINKAGE', 'RETURN'];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: 'Bad request', message: `Invalid movement_type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Require shrinkage reason for SHRINKAGE type
    const shrinkage_reason = req.body.shrinkage_reason;
    if (movement_type === 'SHRINKAGE') {
      const validReasons = ['theft_suspected', 'damage', 'admin_error', 'unknown'];
      if (!shrinkage_reason || !validReasons.includes(shrinkage_reason)) {
        return res.status(400).json({ error: 'Bad request', message: `Shrinkage requires a reason: ${validReasons.join(', ')}` });
      }
    }

    // 1. Fetch current product inventory for this location
    let { data: inventoryItem, error: fetchError } = await supabaseAdmin
      .from('product_inventory')
      .select('id, quantity, low_stock_threshold')
      .eq('product_id', product_id)
      .eq('location_id', location_id)
      .single();

    let currentStock = 0;
    let threshold = 5;
    if (inventoryItem) {
      currentStock = inventoryItem.quantity;
      threshold = inventoryItem.low_stock_threshold || 5;
    }

    const newStockQuantity = currentStock + quantity_change;

    if (newStockQuantity < 0) {
       return res.status(400).json({ error: 'Bad request', message: `Adjustment would result in negative stock for this location.` });
    }

    // 2. Insert movement record
    const { data: movement, error: insertError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id,
        user_id: req.user.id,
        business_id: req.user.business_id,
        location_id,
        quantity_change,
        movement_type,
        notes: movement_type === 'SHRINKAGE' 
          ? `[${(shrinkage_reason || 'unknown').toUpperCase()}] ${notes || ''}`.trim()
          : notes
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Upsert product inventory
    const { data: updatedInventory, error: updateError } = await supabaseAdmin
      .from('product_inventory')
      .upsert({ 
        product_id, 
        location_id, 
        quantity: newStockQuantity 
      }, { onConflict: 'product_id,location_id' })
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to update product inventory:`, updateError);
      return res.status(500).json({ error: 'Failed to update stock quantity on product' });
    }

    // Trigger SHRINKAGE alert
    if (movement_type === 'SHRINKAGE' && quantity_change < 0) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: req.user.business_id,
        location_id,
        type: 'SHRINKAGE',
        severity: shrinkage_reason === 'theft_suspected' ? 'critical' : 'medium',
        user_id: req.user.id,
        reference_id: movement.id,
        note: `Shrinkage of ${Math.abs(quantity_change)} units [${(shrinkage_reason || 'unknown').toUpperCase()}]. Notes: ${notes || 'none'}`,
        metadata: { reason: shrinkage_reason, quantity: Math.abs(quantity_change) }
      }]);

      // Trigger detection engine for shrinkage patterns
      runChecks('shrinkage', { userId: req.user.id, businessId: req.user.business_id, locationId: location_id });
    }

    // Trigger LOW_STOCK alert if newly crossed threshold
    if (newStockQuantity <= threshold && currentStock > threshold) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: req.user.business_id,
        location_id,
        type: 'LOW_STOCK',
        user_id: req.user.id,
        reference_id: product_id,
        note: `Stock fell to ${newStockQuantity} (Threshold: ${threshold}) due to ${movement_type}`
      }]);
    }

    res.status(201).json({
      message: 'Stock adjusted successfully',
      movement,
      product: updatedInventory
    });

  } catch (err) {
    console.error('Error adjusting stock:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

/**
 * PUT /api/stock/:product_id/locations/:location_id/threshold
 * Update the low stock threshold for a product at a specific location.
 * Access: Managers only
 */
router.put('/:product_id/locations/:location_id/threshold', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, location_id } = req.params;
    const { threshold } = req.body;

    if (typeof threshold !== 'number' || threshold < 0) {
      return res.status(400).json({ error: 'Bad request', message: 'Threshold must be a positive number.' });
    }

    // Verify location ownership
    if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (!req.user.location_ids.includes(location_id)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to manage stock at this location.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('product_inventory')
      .update({ low_stock_threshold: threshold })
      .eq('product_id', product_id)
      .eq('location_id', location_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Not found', message: 'Inventory record not found for this product and location.' });
    }

    res.json({ message: 'Threshold updated successfully', data });
  } catch (err) {
    console.error('Error updating threshold:', err);
    res.status(500).json({ error: 'Failed to update threshold' });
  }
});

// ============================================
// STOCK TRANSFERS
// ============================================

/**
 * GET /api/stock/transfers
 * List all stock transfers for the business.
 */
router.get('/transfers', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('stock_transfers')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        from_location:locations!from_location_id(id, name),
        to_location:locations!to_location_id(id, name),
        initiator:users!initiated_by(id, name, email),
        completer:users!completed_by(id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching transfers:', err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

/**
 * POST /api/stock/transfers
 * Initiate a stock transfer between locations.
 * Deducts stock from the source location immediately.
 */
router.post('/transfers', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, from_location_id, to_location_id, quantity, notes } = req.body;

    if (!product_id || !from_location_id || !to_location_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id, from_location_id, to_location_id, and positive quantity are required.' });
    }

    if (from_location_id === to_location_id) {
      return res.status(400).json({ error: 'Bad request', message: 'Source and destination locations must be different.' });
    }

    // Check source stock
    const { data: srcInv, error: srcErr } = await supabaseAdmin
      .from('product_inventory')
      .select('quantity')
      .eq('product_id', product_id)
      .eq('location_id', from_location_id)
      .single();

    if (srcErr || !srcInv) {
      return res.status(400).json({ error: 'Bad request', message: 'Product not found at source location.' });
    }

    if (srcInv.quantity < quantity) {
      return res.status(400).json({ error: 'Bad request', message: `Insufficient stock. Available: ${srcInv.quantity}` });
    }

    // Deduct from source
    const { error: deductErr } = await supabaseAdmin
      .from('product_inventory')
      .update({ quantity: srcInv.quantity - quantity })
      .eq('product_id', product_id)
      .eq('location_id', from_location_id);

    if (deductErr) throw deductErr;

    // Log TRANSFER_OUT movement
    await supabaseAdmin.from('stock_movements').insert({
      product_id,
      user_id: req.user.id,
      business_id: req.user.business_id,
      location_id: from_location_id,
      quantity_change: -quantity,
      movement_type: 'TRANSFER_OUT',
      notes: notes || `Transfer to another location`
    });

    // Create transfer record
    const { data: transfer, error: insertErr } = await supabaseAdmin
      .from('stock_transfers')
      .insert({
        business_id: req.user.business_id,
        from_location_id,
        to_location_id,
        product_id,
        quantity,
        status: 'PENDING',
        initiated_by: req.user.id,
        notes
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.status(201).json({ message: 'Transfer initiated successfully', transfer });
  } catch (err) {
    console.error('Error creating transfer:', err);
    res.status(500).json({ error: 'Failed to create transfer' });
  }
});

/**
 * PUT /api/stock/transfers/:id/complete
 * Complete a pending transfer — adds stock to destination location.
 */
router.put('/transfers/:id/complete', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the transfer
    const { data: transfer, error: fetchErr } = await supabaseAdmin
      .from('stock_transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !transfer) {
      return res.status(404).json({ error: 'Transfer not found.' });
    }

    if (transfer.status !== 'PENDING') {
      return res.status(400).json({ error: 'Bad request', message: `Transfer is already ${transfer.status}.` });
    }

    // Add stock to destination
    const { data: destInv } = await supabaseAdmin
      .from('product_inventory')
      .select('quantity')
      .eq('product_id', transfer.product_id)
      .eq('location_id', transfer.to_location_id)
      .single();

    const newQty = (destInv?.quantity || 0) + transfer.quantity;

    await supabaseAdmin
      .from('product_inventory')
      .upsert({
        product_id: transfer.product_id,
        location_id: transfer.to_location_id,
        quantity: newQty
      }, { onConflict: 'product_id,location_id' });

    // Log TRANSFER_IN movement
    await supabaseAdmin.from('stock_movements').insert({
      product_id: transfer.product_id,
      user_id: req.user.id,
      business_id: req.user.business_id,
      location_id: transfer.to_location_id,
      quantity_change: transfer.quantity,
      movement_type: 'TRANSFER_IN',
      notes: `Transfer received from another location`
    });

    // Update transfer status
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('stock_transfers')
      .update({
        status: 'COMPLETED',
        completed_by: req.user.id,
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ message: 'Transfer completed successfully', transfer: updated });
  } catch (err) {
    console.error('Error completing transfer:', err);
    res.status(500).json({ error: 'Failed to complete transfer' });
  }
});

/**
 * PUT /api/stock/transfers/:id/cancel
 * Cancel a pending transfer — returns stock to source location.
 */
router.put('/transfers/:id/cancel', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: transfer, error: fetchErr } = await supabaseAdmin
      .from('stock_transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !transfer) {
      return res.status(404).json({ error: 'Transfer not found.' });
    }

    if (transfer.status !== 'PENDING') {
      return res.status(400).json({ error: 'Bad request', message: `Transfer is already ${transfer.status}.` });
    }

    // Return stock to source
    const { data: srcInv } = await supabaseAdmin
      .from('product_inventory')
      .select('quantity')
      .eq('product_id', transfer.product_id)
      .eq('location_id', transfer.from_location_id)
      .single();

    await supabaseAdmin
      .from('product_inventory')
      .update({ quantity: (srcInv?.quantity || 0) + transfer.quantity })
      .eq('product_id', transfer.product_id)
      .eq('location_id', transfer.from_location_id);

    // Reverse the TRANSFER_OUT movement
    await supabaseAdmin.from('stock_movements').insert({
      product_id: transfer.product_id,
      user_id: req.user.id,
      business_id: req.user.business_id,
      location_id: transfer.from_location_id,
      quantity_change: transfer.quantity,
      movement_type: 'ADJUSTMENT',
      notes: `Transfer cancelled — stock returned`
    });

    // Update status
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('stock_transfers')
      .update({
        status: 'CANCELLED',
        completed_by: req.user.id,
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ message: 'Transfer cancelled', transfer: updated });
  } catch (err) {
    console.error('Error cancelling transfer:', err);
    res.status(500).json({ error: 'Failed to cancel transfer' });
  }
});

// ============================================
// INVENTORY AUDITS (CYCLE COUNTS)
// ============================================

/**
 * GET /api/stock/audits
 * List audit history for the business.
 */
router.get('/audits', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('inventory_audits')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        location:locations!location_id(id, name),
        auditor:users!audited_by(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching audits:', err);
    res.status(500).json({ error: 'Failed to fetch audits' });
  }
});

/**
 * POST /api/stock/audits
 * Submit a cycle count. Accepts an array of counts.
 * Each count: { product_id, location_id, counted_quantity }
 * The system auto-reconciles discrepancies.
 */
router.post('/audits', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { counts, location_id } = req.body;

    if (!location_id || !Array.isArray(counts) || counts.length === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'location_id and a non-empty counts array are required.' });
    }

    const results = [];

    for (const count of counts) {
      const { product_id, counted_quantity } = count;

      // Get expected quantity
      const { data: inv } = await supabaseAdmin
        .from('product_inventory')
        .select('quantity')
        .eq('product_id', product_id)
        .eq('location_id', location_id)
        .single();

      const expected = inv?.quantity || 0;
      const diff = counted_quantity - expected;

      // Insert audit record
      const { data: audit, error: auditErr } = await supabaseAdmin
        .from('inventory_audits')
        .insert({
          business_id: req.user.business_id,
          location_id,
          product_id,
          expected_quantity: expected,
          counted_quantity,
          audited_by: req.user.id,
          notes: count.notes || null
        })
        .select()
        .single();

      if (auditErr) {
        console.error('Audit insert error:', auditErr);
        continue;
      }

      // If there's a discrepancy, reconcile
      if (diff !== 0) {
        // Update actual inventory
        await supabaseAdmin
          .from('product_inventory')
          .upsert({
            product_id,
            location_id,
            quantity: counted_quantity
          }, { onConflict: 'product_id,location_id' });

        // Log AUDIT movement
        await supabaseAdmin.from('stock_movements').insert({
          product_id,
          user_id: req.user.id,
          business_id: req.user.business_id,
          location_id,
          quantity_change: diff,
          movement_type: 'AUDIT',
          reference_id: audit.id,
          notes: `Cycle count adjustment: expected ${expected}, counted ${counted_quantity}`
        });
      }

      results.push({ product_id, expected, counted: counted_quantity, discrepancy: diff, audit_id: audit.id });
    }

    res.status(201).json({
      message: `Audit submitted. ${results.filter(r => r.discrepancy !== 0).length} discrepancies found.`,
      results
    });
  } catch (err) {
    console.error('Error submitting audit:', err);
    res.status(500).json({ error: 'Failed to submit audit' });
  }
});

// ============================================
// PRODUCT BATCHES (EXPIRY TRACKING)
// ============================================

/**
 * GET /api/stock/batches
 * List all batches, sorted by expiry date (soonest first).
 */
router.get('/batches', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('product_batches')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        location:locations!location_id(id, name)
      `)
      .order('expiry_date', { ascending: true });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    // Filter by location if user has active location
    if (req.user.active_location_id) {
      query = query.eq('location_id', req.user.active_location_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching batches:', err);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

/**
 * POST /api/stock/batches
 * Register a new product batch with expiry date.
 */
router.post('/batches', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, location_id, batch_number, quantity, expiry_date, notes } = req.body;

    if (!product_id || !location_id || !batch_number || !quantity || !expiry_date) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id, location_id, batch_number, quantity, and expiry_date are required.' });
    }

    const { data: batch, error: insertErr } = await supabaseAdmin
      .from('product_batches')
      .insert({
        business_id: req.user.business_id,
        product_id,
        location_id,
        batch_number,
        quantity,
        expiry_date,
        created_by: req.user.id,
        notes
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.status(201).json({ message: 'Batch registered', batch });
  } catch (err) {
    console.error('Error creating batch:', err);
    res.status(500).json({ error: 'Failed to create batch' });
  }
});

module.exports = router;
