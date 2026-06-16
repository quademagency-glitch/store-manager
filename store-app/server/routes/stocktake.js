const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * POST /api/stocktake/start
 * Start a new stock take session at a location.
 * Access: Inventory managers
 */
router.post('/start', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { location_id, notes } = req.body;
    const loc = location_id || req.user.active_location_id;

    if (!loc) {
      return res.status(400).json({ error: 'Bad request', message: 'location_id is required.' });
    }

    // Check for existing in-progress session at this location
    const { data: existing } = await supabaseAdmin
      .from('stock_take_sessions')
      .select('id')
      .eq('location_id', loc)
      .eq('status', 'in_progress')
      .eq('business_id', req.user.business_id)
      .single();

    if (existing) {
      return res.status(400).json({
        error: 'Active session exists',
        message: 'There is already an active stock take at this location. Complete or cancel it first.',
        session_id: existing.id
      });
    }

    // Count expected in_stock units at this location
    const { count: expectedCount } = await supabaseAdmin
      .from('inventory_units')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc)
      .eq('business_id', req.user.business_id)
      .eq('status', 'in_stock');

    // Create session
    const { data: session, error: createErr } = await supabaseAdmin
      .from('stock_take_sessions')
      .insert({
        business_id: req.user.business_id,
        location_id: loc,
        status: 'in_progress',
        started_by: req.user.id,
        expected_count: expectedCount || 0,
        notes: notes || null
      })
      .select()
      .single();

    if (createErr) throw createErr;

    res.status(201).json({
      message: 'Stock take session started.',
      session,
      expected_units: expectedCount || 0
    });
  } catch (err) {
    logger.error({ err: err }, 'Error starting stock take:');
    res.status(500).json({ error: 'Failed to start stock take' });
  }
});

/**
 * GET /api/stocktake/:id
 * Get session progress with scan details.
 * Access: All authenticated staff in the business
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: session, error: sessErr } = await supabaseAdmin
      .from('stock_take_sessions')
      .select(`
        *,
        location:locations!location_id(id, name),
        starter:users!started_by(id, name, email)
      `)
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return res.status(404).json({ error: 'Stock take session not found.' });
    }

    // Get scans for this session
    const { data: scans, error: scansErr } = await supabaseAdmin
      .from('stock_take_scans')
      .select(`
        *,
        unit:inventory_units!unit_id(
          id, status,
          product:products!product_id(id, name, sku),
          location:locations!location_id(id, name)
        ),
        scanner:users!scanned_by(id, name)
      `)
      .eq('session_id', id)
      .order('scanned_at', { ascending: true });

    if (scansErr) throw scansErr;

    // Calculate per-product progress
    const { data: expectedUnits } = await supabaseAdmin
      .from('inventory_units')
      .select('id, product_id, products!product_id(name, sku)')
      .eq('location_id', session.location_id)
      .eq('business_id', session.business_id)
      .eq('status', 'in_stock');

    // Group expected by product
    const productProgress = {};
    for (const unit of (expectedUnits || [])) {
      const pid = unit.product_id;
      if (!productProgress[pid]) {
        productProgress[pid] = {
          product_id: pid,
          product_name: unit.products?.name || 'Unknown',
          product_sku: unit.products?.sku || '',
          expected: 0,
          scanned: 0
        };
      }
      productProgress[pid].expected++;
    }

    // Count scanned per product
    for (const scan of (scans || [])) {
      if (scan.scan_result === 'found' && scan.unit?.product?.id) {
        const pid = scan.unit.product.id;
        if (productProgress[pid]) {
          productProgress[pid].scanned++;
        }
      }
    }

    res.json({
      session,
      scans: scans || [],
      product_progress: Object.values(productProgress),
      summary: {
        expected: session.expected_count,
        scanned: (scans || []).filter(s => s.scan_result === 'found').length,
        errors: (scans || []).filter(s => s.scan_result !== 'found').length
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching stock take:');
    res.status(500).json({ error: 'Failed to fetch stock take session' });
  }
});

/**
 * POST /api/stocktake/:id/scan
 * Record a QR code scan during a stock take.
 * Access: All authenticated staff
 */
router.post('/:id/scan', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { qr_code } = req.body;

    if (!qr_code) {
      return res.status(400).json({ error: 'qr_code is required' });
    }

    // Verify session exists and is in progress
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('stock_take_sessions')
      .select('id, location_id, business_id, status')
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return res.status(404).json({ error: 'Stock take session not found.' });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Stock take session is not active.' });
    }

    // Check if already scanned in this session
    const { data: existingScan } = await supabaseAdmin
      .from('stock_take_scans')
      .select('id')
      .eq('session_id', id)
      .eq('qr_code', qr_code.trim().toUpperCase())
      .single();

    if (existingScan) {
      return res.status(400).json({ error: 'Already scanned', message: 'This QR code was already scanned in this session.' });
    }

    // Look up the QR code
    const { data: qrRecord } = await supabaseAdmin
      .from('qr_code_pool')
      .select('id, code, status')
      .eq('code', qr_code.trim().toUpperCase())
      .single();

    if (!qrRecord) {
      // Unknown QR code
      const { data: scan } = await supabaseAdmin
        .from('stock_take_scans')
        .insert({
          session_id: id,
          unit_id: null,
          qr_code: qr_code.trim().toUpperCase(),
          scan_result: 'unknown',
          scanned_by: req.user.id
        })
        .select()
        .single();

      return res.json({ scan_result: 'unknown', message: 'QR code not recognized.', scan });
    }

    // Find the inventory unit
    const { data: unit } = await supabaseAdmin
      .from('inventory_units')
      .select('id, product_id, location_id, status, products!product_id(name, sku)')
      .eq('qr_code_id', qrRecord.id)
      .single();

    if (!unit) {
      const { data: scan } = await supabaseAdmin
        .from('stock_take_scans')
        .insert({
          session_id: id,
          unit_id: null,
          qr_code: qrRecord.code,
          scan_result: 'unknown',
          scanned_by: req.user.id
        })
        .select()
        .single();

      return res.json({ scan_result: 'unknown', message: 'QR code is unassigned.', scan });
    }

    // Determine scan result
    let scan_result = 'found';
    let message = `✅ Found: ${unit.products?.name || 'Unknown'} (${unit.products?.sku || ''})`;

    if (unit.status === 'sold') {
      scan_result = 'already_sold';
      message = `❌ This item was already sold.`;
    } else if (unit.location_id !== session.location_id) {
      scan_result = 'wrong_location';
      message = `⚠️ This item belongs to a different location.`;
    }

    // Record scan
    const { data: scan } = await supabaseAdmin
      .from('stock_take_scans')
      .insert({
        session_id: id,
        unit_id: unit.id,
        qr_code: qrRecord.code,
        scan_result,
        scanned_by: req.user.id
      })
      .select()
      .single();

    // Update session scanned count
    const { count: scannedCount } = await supabaseAdmin
      .from('stock_take_scans')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', id)
      .eq('scan_result', 'found');

    await supabaseAdmin
      .from('stock_take_sessions')
      .update({ scanned_count: scannedCount || 0 })
      .eq('id', id);

    res.json({
      scan_result,
      message,
      scan,
      product: unit.products,
      progress: {
        scanned: scannedCount || 0,
        expected: session.expected_count || 0
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error recording scan:');
    res.status(500).json({ error: 'Failed to record scan' });
  }
});

/**
 * POST /api/stocktake/:id/batch-scan
 * Record multiple QR code scans in bulk during a stock take.
 * Access: All authenticated staff
 */
router.post('/:id/batch-scan', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { qr_codes } = req.body;

    if (!qr_codes || !Array.isArray(qr_codes) || qr_codes.length === 0) {
      return res.status(400).json({ error: 'qr_codes array is required and must not be empty' });
    }

    // Clean and deduplicate requested codes
    const uniqueCodes = [...new Set(qr_codes.map(c => c.trim().toUpperCase()).filter(Boolean))];

    // Verify session exists and is in progress
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('stock_take_sessions')
      .select('id, location_id, business_id, status')
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return res.status(404).json({ error: 'Stock take session not found.' });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Stock take session is not active.' });
    }

    // Fetch existing scans for this session
    const { data: existingScans } = await supabaseAdmin
      .from('stock_take_scans')
      .select('qr_code')
      .eq('session_id', id);

    const alreadyScannedSet = new Set((existingScans || []).map(s => s.qr_code));

    // Filter out codes that were already scanned
    const codesToProcess = uniqueCodes.filter(c => !alreadyScannedSet.has(c));

    if (codesToProcess.length === 0) {
      return res.json({ 
        message: 'All provided codes were already scanned in this session.',
        processed_count: 0
      });
    }

    // Look up the QR codes
    const { data: qrRecords } = await supabaseAdmin
      .from('qr_code_pool')
      .select('id, code, status')
      .in('code', codesToProcess);

    const qrRecordMap = new Map((qrRecords || []).map(qr => [qr.code, qr]));
    const qrRecordIds = (qrRecords || []).map(qr => qr.id);

    // Find the inventory units
    let unitsMap = new Map();
    if (qrRecordIds.length > 0) {
      const { data: units } = await supabaseAdmin
        .from('inventory_units')
        .select('id, qr_code_id, product_id, location_id, status, products!product_id(name, sku)')
        .in('qr_code_id', qrRecordIds);

      unitsMap = new Map((units || []).map(u => [u.qr_code_id, u]));
    }

    const scansToInsert = [];
    let newFoundCount = 0;

    for (const code of codesToProcess) {
      const qrRecord = qrRecordMap.get(code);

      if (!qrRecord) {
        // Unknown QR code
        scansToInsert.push({
          session_id: id,
          unit_id: null,
          qr_code: code,
          scan_result: 'unknown',
          scanned_by: req.user.id
        });
        continue;
      }

      const unit = unitsMap.get(qrRecord.id);

      if (!unit) {
        scansToInsert.push({
          session_id: id,
          unit_id: null,
          qr_code: code,
          scan_result: 'unknown',
          scanned_by: req.user.id
        });
        continue;
      }

      let scan_result = 'found';
      if (unit.status === 'sold') {
        scan_result = 'already_sold';
      } else if (unit.location_id !== session.location_id) {
        scan_result = 'wrong_location';
      }

      if (scan_result === 'found') newFoundCount++;

      scansToInsert.push({
        session_id: id,
        unit_id: unit.id,
        qr_code: code,
        scan_result,
        scanned_by: req.user.id
      });
    }

    // Batch Insert Scans
    const { error: insertError } = await supabaseAdmin
      .from('stock_take_scans')
      .insert(scansToInsert);

    if (insertError) throw insertError;

    // Update session scanned count
    const { count: totalScannedCount } = await supabaseAdmin
      .from('stock_take_scans')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', id)
      .eq('scan_result', 'found');

    await supabaseAdmin
      .from('stock_take_sessions')
      .update({ scanned_count: totalScannedCount || 0 })
      .eq('id', id);

    res.json({
      message: `Batch processed successfully. ${newFoundCount} new valid items found out of ${codesToProcess.length} processed.`,
      processed_count: codesToProcess.length,
      found_count: newFoundCount,
      progress: {
        scanned: totalScannedCount || 0,
        expected: session.expected_count || 0
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error recording batch scan:');
    res.status(500).json({ error: 'Failed to record batch scan' });
  }
});



/**
 * PUT /api/stocktake/:id/complete
 * Complete a stock take session — flag missing items and generate alerts.
 * Access: Inventory managers
 */
router.put('/:id/complete', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get session
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('stock_take_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return res.status(404).json({ error: 'Stock take session not found.' });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Session is not in progress.' });
    }

    // Get all expected in_stock units at this location
    const { data: expectedUnits } = await supabaseAdmin
      .from('inventory_units')
      .select('id, product_id, qr_code_id, qr_code_pool!qr_code_id(code), products!product_id(name, sku)')
      .eq('location_id', session.location_id)
      .eq('business_id', session.business_id)
      .eq('status', 'in_stock');

    // Get all successfully scanned unit IDs in this session
    const { data: scannedRecords } = await supabaseAdmin
      .from('stock_take_scans')
      .select('unit_id')
      .eq('session_id', id)
      .eq('scan_result', 'found');

    const scannedUnitIds = new Set((scannedRecords || []).map(s => s.unit_id).filter(Boolean));

    // Find missing units
    const missingUnits = (expectedUnits || []).filter(u => !scannedUnitIds.has(u.id));

    // Mark missing units as 'lost'
    for (const unit of missingUnits) {
      await supabaseAdmin
        .from('inventory_units')
        .update({ status: 'lost', notes: `Missing during stock take ${id}` })
        .eq('id', unit.id);
    }

    // Update session
    const { data: updatedSession } = await supabaseAdmin
      .from('stock_take_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        scanned_count: scannedUnitIds.size,
        missing_count: missingUnits.length
      })
      .eq('id', id)
      .select()
      .single();

    // Generate STOCK_TAKE_MISSING alert if any items are missing
    if (missingUnits.length > 0) {
      const missingDetails = missingUnits.map(u => ({
        unit_id: u.id,
        product: u.products?.name || 'Unknown',
        sku: u.products?.sku || '',
        qr_code: u.qr_code_pool?.code || ''
      }));

      await supabaseAdmin.from('alerts').insert([{
        business_id: session.business_id,
        location_id: session.location_id,
        type: 'STOCK_TAKE_MISSING',
        severity: missingUnits.length > 5 ? 'critical' : 'high',
        user_id: req.user.id,
        reference_id: session.id,
        note: `Stock take completed: ${missingUnits.length} unit(s) missing out of ${(expectedUnits || []).length} expected.`,
        metadata: { missing_items: missingDetails, session_id: id }
      }]);
    }

    res.json({
      message: `Stock take completed. ${missingUnits.length} missing item(s) flagged.`,
      session: updatedSession,
      summary: {
        expected: (expectedUnits || []).length,
        scanned: scannedUnitIds.size,
        missing: missingUnits.length,
        missing_items: missingUnits.map(u => ({
          product: u.products?.name,
          sku: u.products?.sku,
          qr_code: u.qr_code_pool?.code
        }))
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error completing stock take:');
    res.status(500).json({ error: 'Failed to complete stock take' });
  }
});

/**
 * PUT /api/stocktake/:id/cancel
 * Cancel an in-progress stock take session.
 * Access: Inventory managers
 */
router.put('/:id/cancel', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('stock_take_sessions')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'in_progress')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No active session found to cancel.' });
    }

    res.json({ message: 'Stock take cancelled.', session: data });
  } catch (err) {
    logger.error({ err: err }, 'Error cancelling stock take:');
    res.status(500).json({ error: 'Failed to cancel stock take' });
  }
});

/**
 * GET /api/stocktake/history
 * List past stock take sessions.
 * Access: All authenticated staff in the business
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('stock_take_sessions')
      .select(`
        *,
        location:locations!location_id(id, name),
        starter:users!started_by(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching stock take history:');
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * DELETE /api/stocktake/:id
 * Delete a stock take session.
 * Access: Inventory managers
 */
router.delete('/:id', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('stock_take_sessions')
      .delete()
      .eq('id', id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;

    res.json({ message: 'Stock take session deleted.' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting stock take:');
    res.status(500).json({ error: 'Failed to delete stock take session' });
  }
});

module.exports = router;
