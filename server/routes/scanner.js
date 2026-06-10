const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const scanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 scans per minute
  message: { error: 'Too many scans, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
 * Active SSE connections
 * Structure: { [userId]: express.Response }
 */
const activeClients = {};

/**
 * POST /api/scanner/push-scan
 * External scanner app calls this endpoint to push a scanned code.
 * Access: Public (Uses scanner session token)
 */
router.post('/push-scan', scanLimiter, async (req, res) => {
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

    // Send the scan event directly if the user's Web App is connected via SSE
    const client = activeClients[userId];
    if (client) {
      client.write(`data: ${JSON.stringify({ scanned: true, qr_code })}\n\n`);
    }

    res.json({ message: 'Scan received successfully' });
  } catch (err) {
    console.error('Error pushing scan:', err);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

/**
 * GET /api/scanner/events
 * Web app connects to this endpoint to receive scan events via SSE.
 * Access: Authenticated users
 */
router.get('/events', authGuard, (req, res) => {
  const userId = req.user.id;

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush the headers to establish connection

  // Register the client
  activeClients[userId] = res;

  // Keep the connection alive with a ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);

  // Cleanup on connection close
  req.on('close', () => {
    clearInterval(keepAlive);
    if (activeClients[userId] === res) {
      delete activeClients[userId];
    }
  });
});

module.exports = router;
