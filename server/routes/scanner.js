const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

/**
 * GET /api/scanner/token
 * Generate a new dynamic QR token for linking a scanner
 * Access: Authenticated users
 */
router.get('/token', authGuard, async (req, res) => {
  try {
    const token = crypto.randomUUID();

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        scanner_session_token: token,
        scanner_linked_at: null // reset link status on new token generation
      })
      .eq('id', req.user.id);

    if (error) throw error;

    res.json({ token });
  } catch (err) {
    console.error('Error generating scanner token:', err);
    res.status(500).json({ error: `Failed to generate scanner token: ${err.message || JSON.stringify(err)}` });
  }
});

/**
 * GET /api/scanner/status
 * Check if the scanner has been linked
 * Access: Authenticated users
 */
router.get('/status', authGuard, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('scanner_linked_at')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ linked: !!data.scanner_linked_at });
  } catch (err) {
    console.error('Error checking scanner status:', err);
    res.status(500).json({ error: 'Failed to check scanner status' });
  }
});

/**
 * POST /api/scanner/link
 * Link a scanner using the provided token
 * Access: Public (Scanner app calls this without user session, using just the token)
 */
router.post('/link', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find user by token
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('scanner_session_token', token);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const userId = users[0].id;

    // Update link status
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ scanner_linked_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({ message: 'Scanner successfully linked', userId });
  } catch (err) {
    console.error('Error linking scanner:', err);
    res.status(500).json({ error: 'Failed to link scanner' });
  }
});

/**
 * POST /api/scanner/unlink
 * Unlink the scanner
 * Access: Authenticated users
 */
router.post('/unlink', authGuard, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        scanner_session_token: null,
        scanner_linked_at: null
      })
      .eq('id', req.user.id);

    if (error) throw error;

    res.json({ message: 'Scanner unlinked successfully' });
  } catch (err) {
    console.error('Error unlinking scanner:', err);
    res.status(500).json({ error: 'Failed to unlink scanner' });
  }
});

/**
 * In-memory store for recent scans.
 * Structure: { [userId]: { qr_code: '...', timestamp: Date.now() } }
 * In a multi-instance production environment, use Redis or Supabase Realtime.
 */
const recentScans = {};

/**
 * POST /api/scanner/push-scan
 * External scanner app calls this endpoint to push a scanned code.
 * Access: Public (Uses scanner session token)
 */
router.post('/push-scan', async (req, res) => {
  try {
    const { token, qr_code } = req.body;

    if (!token || !qr_code) {
      return res.status(400).json({ error: 'Token and qr_code are required' });
    }

    // Find user by token
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('scanner_session_token', token);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired scanner token' });
    }

    const userId = users[0].id;

    // Store the scan event
    recentScans[userId] = {
      qr_code,
      timestamp: Date.now()
    };

    res.json({ message: 'Scan received successfully' });
  } catch (err) {
    console.error('Error pushing scan:', err);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

/**
 * GET /api/scanner/poll
 * Web app polls this endpoint to check if the external scanner has scanned anything.
 * Access: Authenticated users
 */
router.get('/poll', authGuard, (req, res) => {
  const userId = req.user.id;
  const scanEvent = recentScans[userId];

  if (scanEvent) {
    // Check if it's recent (e.g. within the last 15 seconds) to prevent stale reads
    const isRecent = (Date.now() - scanEvent.timestamp) < 15000;
    
    if (isRecent) {
      // Clear it so we don't read it twice
      delete recentScans[userId];
      return res.json({ scanned: true, qr_code: scanEvent.qr_code });
    } else {
      // Clean up stale event
      delete recentScans[userId];
    }
  }

  res.json({ scanned: false });
});

module.exports = router;
