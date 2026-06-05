const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * Generate a unique QR code string: PREFIX-XXXXXXXX
 * 8 alphanumeric chars (uppercase + digits), collision-resistant
 */
function generateQRCode(prefix = 'QR') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
  const randomBytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return `${prefix}-${code}`;
}

/**
 * POST /api/qrcodes/generate
 * Bulk-generate QR codes into the pool.
 * Access: Platform Admin only
 * Body: { quantity: 5000, prefix: "QR", label: "June 2026 Batch" }
 */
router.post('/generate', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { quantity, prefix = 'QR', label } = req.body;

    if (!quantity || quantity < 1 || quantity > 10000) {
      return res.status(400).json({ error: 'Bad request', message: 'Quantity must be between 1 and 10,000.' });
    }

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Bad request', message: 'Batch label is required.' });
    }

    // 1. Create the batch record
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('qr_batches')
      .insert({
        batch_label: label.trim(),
        quantity,
        prefix: prefix.toUpperCase(),
        generated_by: req.user.id
      })
      .select()
      .single();

    if (batchErr) throw batchErr;

    // 2. Generate unique codes in memory
    const codes = new Set();
    let attempts = 0;
    const maxAttempts = quantity * 3; // Safety valve

    while (codes.size < quantity && attempts < maxAttempts) {
      codes.add(generateQRCode(prefix.toUpperCase()));
      attempts++;
    }

    if (codes.size < quantity) {
      return res.status(500).json({ error: 'Failed to generate enough unique codes. Try a different prefix.' });
    }

    // 3. Insert codes in chunks (Supabase has a per-request limit)
    const codesArray = Array.from(codes);
    const CHUNK_SIZE = 500;
    let insertedCount = 0;

    for (let i = 0; i < codesArray.length; i += CHUNK_SIZE) {
      const chunk = codesArray.slice(i, i + CHUNK_SIZE).map(code => ({
        code,
        batch_id: batch.id,
        status: 'unassigned',
        generated_by: req.user.id
      }));

      const { error: insertErr } = await supabaseAdmin
        .from('qr_code_pool')
        .insert(chunk);

      if (insertErr) {
        console.error(`Error inserting QR chunk ${i}:`, insertErr);
        // Continue with remaining chunks
      } else {
        insertedCount += chunk.length;
      }
    }

    res.status(201).json({
      message: `Generated ${insertedCount} QR codes successfully.`,
      batch: {
        ...batch,
        inserted_count: insertedCount
      }
    });
  } catch (err) {
    console.error('Error generating QR codes:', err);
    res.status(500).json({ error: 'Failed to generate QR codes' });
  }
});

/**
 * GET /api/qrcodes/batches
 * List all QR batches.
 * Access: Platform Admin only
 */
router.get('/batches', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('qr_batches')
      .select(`
        *,
        generator:users!generated_by(id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get counts per batch
    for (const batch of data) {
      const { count: totalCount } = await supabaseAdmin
        .from('qr_code_pool')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id);

      const { count: assignedCount } = await supabaseAdmin
        .from('qr_code_pool')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .eq('status', 'assigned');

      batch.total_codes = totalCount || 0;
      batch.assigned_codes = assignedCount || 0;
      batch.unassigned_codes = (totalCount || 0) - (assignedCount || 0);
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching QR batches:', err);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

/**
 * GET /api/qrcodes/batch/:id
 * Get all codes in a specific batch (for printing).
 * Access: Platform Admin only
 */
router.get('/batch/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query; // Optional filter: 'unassigned', 'assigned'

    let query = supabaseAdmin
      .from('qr_code_pool')
      .select('id, code, status, generated_at')
      .eq('batch_id', id)
      .order('generated_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Get batch metadata
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('qr_batches')
      .select('*')
      .eq('id', id)
      .single();

    if (batchErr) throw batchErr;

    res.json({ batch, codes: data });
  } catch (err) {
    console.error('Error fetching batch codes:', err);
    res.status(500).json({ error: 'Failed to fetch batch codes' });
  }
});

/**
 * GET /api/qrcodes/stats
 * Pool-level stats.
 * Access: Platform Admin only
 */
router.get('/stats', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { count: totalCount } = await supabaseAdmin
      .from('qr_code_pool')
      .select('*', { count: 'exact', head: true });

    const { count: unassignedCount } = await supabaseAdmin
      .from('qr_code_pool')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unassigned');

    const { count: assignedCount } = await supabaseAdmin
      .from('qr_code_pool')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'assigned');

    const { count: batchCount } = await supabaseAdmin
      .from('qr_batches')
      .select('*', { count: 'exact', head: true });

    res.json({
      total_codes: totalCount || 0,
      unassigned: unassignedCount || 0,
      assigned: assignedCount || 0,
      total_batches: batchCount || 0
    });
  } catch (err) {
    console.error('Error fetching QR stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
