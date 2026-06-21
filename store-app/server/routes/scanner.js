/**
 * ============================================================================
 * ⚠️ CRITICAL: BACKWARD COMPATIBILITY WARNING ⚠️
 * ============================================================================
 * 
 * The endpoints in this file are used by DOWNLOADED versions of the Mobile Scanner App.
 * Because users install the APK/iOS app on their devices, you CANNOT force them 
 * to update their app immediately if you change the API structure.
 * 
 * RULES FOR EDITING THIS FILE:
 * 1. NEVER rename or delete existing endpoints.
 * 2. NEVER change the required JSON payload structure for incoming requests.
 * 3. NEVER rename or remove fields from the JSON responses.
 * 4. You MAY add new endpoints or add new optional fields to existing responses.
 * 
 * Breaking these rules will cause the downloaded scanner apps in the field to 
 * crash or fail to connect seamlessly!
 * ============================================================================
 */
const express = require('express');
const logger = require('../utils/logger');
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
    logger.error({ err: err }, 'Error generating scanner token:');
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
    logger.error({ err: err }, 'Error checking scanner status:');
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
      .select('id, name, roles(name)')
      .eq('scanner_session_token', token);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const user = users[0];

    // Update link status
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ scanner_linked_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) throw updateError;

    const client = activeClients[user.id];
    if (client) {
      client.write(`data: ${JSON.stringify({ linked: true })}\n\n`);
    }

    res.json({ 
      message: 'Scanner successfully linked', 
      user: {
        id: user.id,
        name: user.name,
        role: user.roles?.name || 'Unknown Role'
      }
    });
  } catch (err) {
    logger.info('====== CRITICAL ERROR LINKING SCANNER ======');
    logger.info(JSON.stringify(err, null, 2));
    logger.info(err.message);
    res.status(500).json({ error: 'Failed to link scanner', details: err.message || err });
  }
});

/**
 * GET /api/scanner/me
 * Fetch the linked user info using the scanner token
 * Access: Public (Scanner app calls this without user session)
 */
router.get('/me', async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, name, roles(name)')
      .eq('scanner_session_token', token);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const user = users[0];

    res.json({
      id: user.id,
      name: user.name,
      role: user.roles?.name || 'Unknown Role'
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching scanner user:');
    res.status(500).json({ error: 'Failed to fetch user info' });
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

    const client = activeClients[req.user.id];
    if (client) {
      client.write(`data: ${JSON.stringify({ unlinked: true })}\n\n`);
    }

    res.json({ message: 'Scanner unlinked successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error unlinking scanner:');
    res.status(500).json({ error: 'Failed to unlink scanner' });
  }
});

/**
 * POST /api/scanner/app-unlink
 * External scanner app calls this endpoint to unlink itself.
 * Access: Public (Uses scanner session token)
 */
router.post('/app-unlink', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('scanner_session_token', token);

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        scanner_session_token: null,
        scanner_linked_at: null
      })
      .eq('scanner_session_token', token);

    if (error) throw error;

    if (users && users.length > 0) {
      const userId = users[0].id;
      const client = activeClients[userId];
      if (client) {
        client.write(`data: ${JSON.stringify({ unlinked: true })}\n\n`);
      }
    }

    res.json({ message: 'Scanner unlinked successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error app unlinking scanner:');
    res.status(500).json({ error: 'Failed to unlink scanner' });
  }
});

/**
 * Active SSE connections
 * Structure: { [userId]: express.Response }
 */
const activeClients = {};
const activeScanners = {};

/**
 * POST /api/scanner/push-scan
 * External scanner app calls this endpoint to push a scanned code.
 * Access: Public (Uses scanner session token)
 */
router.post('/push-scan', scanLimiter, async (req, res) => {
  try {
    const { token, qr_code, payload } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    if (!qr_code && !payload) {
      return res.status(400).json({ error: 'qr_code or payload is required' });
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
      client.write(`data: ${JSON.stringify({ scanned: true, qr_code, payload })}\n\n`);
    }

    res.json({ message: 'Scan received successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error pushing scan:');
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

/**
 * POST /api/scanner/cancel-scan
 * External scanner app calls this endpoint to notify that a scan was cancelled.
 * Access: Public (Uses scanner session token)
 */
router.post('/cancel-scan', scanLimiter, async (req, res) => {
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
      return res.status(404).json({ error: 'Invalid or expired scanner token' });
    }

    const userId = users[0].id;

    // Send the cancel event directly if the user's Web App is connected via SSE
    const client = activeClients[userId];
    if (client) {
      client.write(`data: ${JSON.stringify({ cancelled: true })}\n\n`);
    }

    res.json({ message: 'Scan cancellation received successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error cancelling scan:');
    res.status(500).json({ error: 'Failed to process cancel' });
  }
});

/**
 * POST /api/scanner/push-command
 * Web App calls this endpoint to send a command to the Scanner App (e.g., to request a specific scan).
 * Access: Authenticated users
 */
router.post('/push-command', authGuard, async (req, res) => {
  try {
    const { command, payload } = req.body;
    const userId = req.user.id;

    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    const scanner = activeScanners[userId];
    if (scanner) {
      scanner.write(`data: ${JSON.stringify({ command, payload })}\n\n`);
      return res.json({ message: 'Command sent to scanner app' });
    } else {
      return res.status(404).json({ error: 'No active scanner app connected' });
    }
  } catch (err) {
    logger.error({ err: err }, 'Error pushing command:');
    res.status(500).json({ error: 'Failed to push command' });
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

  // Keep the connection alive with a ping every 15 seconds to prevent network timeouts
  const keepAlive = setInterval(() => {
    res.write('event: ping\ndata: {"ping":true}\n\n');
  }, 15000);

  // Cleanup on connection close
  req.on('close', () => {
    clearInterval(keepAlive);
    if (activeClients[userId] === res) {
      delete activeClients[userId];
    }
  });
});

/**
 * GET /api/scanner/app-events
 * Scanner app connects to this endpoint to receive commands via SSE.
 * Access: Public (Uses scanner session token)
 */
router.get('/app-events', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find user by token
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, name, roles(name)')
      .eq('scanner_session_token', token);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired scanner token' });
    }

    const user = users[0];
    const userId = user.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    activeScanners[userId] = res;

    const keepAlive = setInterval(() => {
      res.write('event: ping\ndata: {"ping":true}\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      if (activeScanners[userId] === res) {
        delete activeScanners[userId];
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error establishing scanner SSE:');
    res.status(500).json({ error: 'Failed to establish connection' });
  }
});

// ============================================
// ATTENDANCE ENDPOINTS (Scanner Token Auth)
// ============================================

function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkTimeWindow(location, action) {
  const startCol = action === 'clock_in' ? 'clock_in_start' : 'clock_out_start';
  const endCol = action === 'clock_in' ? 'clock_in_end' : 'clock_out_end';
  const startTime = location[startCol];
  const endTime = location[endCol];
  if (!startTime || !endTime) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const label = action === 'clock_in' ? 'clock in' : 'clock out';
  const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return `You can only ${label} between ${fmt(sh, sm)} and ${fmt(eh, em)}. Current time: ${fmt(now.getHours(), now.getMinutes())}.`;
  }
  return null;
}

/** Helper: resolve user + location from scanner token */
async function resolveScanner(token) {
  if (!token) return null;
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, name, business_id, active_location_id, roles(name)')
    .eq('scanner_session_token', token);
  if (error || !users?.length) return null;
  return users[0];
}

/**
 * GET /api/scanner/attendance-status
 * Check if the scanner user is currently clocked in
 */
router.get('/attendance-status', async (req, res) => {
  try {
    const user = await resolveScanner(req.query.token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const { data: openLog } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in, location_id, note')
      .eq('user_id', user.id)
      .eq('business_id', user.business_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get active location geofence info
    let locationInfo = null;
    const locId = user.active_location_id;
    if (locId) {
      const { data: loc } = await supabaseAdmin
        .from('locations')
        .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
        .eq('id', locId)
        .single();
      locationInfo = loc;
    }

    res.json({
      clocked_in: !!openLog,
      active_log: openLog || null,
      location: locationInfo,
    });
  } catch (err) {
    logger.error({ err }, 'Scanner attendance status error');
    res.status(500).json({ error: 'Failed to check attendance' });
  }
});

/**
 * POST /api/scanner/clock-in
 * Clock in from the scanner app
 */
router.post('/clock-in', scanLimiter, async (req, res) => {
  try {
    const { token, latitude, longitude, note } = req.body;
    const user = await resolveScanner(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const location_id = user.active_location_id;
    if (!location_id) {
      return res.status(400).json({ error: 'No active location set. Ask your admin to assign you.' });
    }

    // Geofence + time window check
    let distanceM = null;
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
      .eq('id', location_id)
      .single();

    // Time window validation
    if (location) {
      const timeErr = checkTimeWindow(location, 'clock_in');
      if (timeErr) {
        return res.status(403).json({ error: 'Outside allowed hours', message: timeErr });
      }
    }

    if (location?.latitude && location?.longitude) {
      if (!latitude || !longitude) {
        return res.status(400).json({
          error: 'Location required',
          message: 'GPS is required to clock in at this location.',
        });
      }
      distanceM = Math.round(haversineDistanceM(latitude, longitude, location.latitude, location.longitude));
      const radiusM = location.geofence_radius_m || 200;
      if (distanceM > radiusM) {
        return res.status(403).json({
          error: 'Outside geofence',
          message: `You are ${distanceM}m from ${location.name}. Must be within ${radiusM}m.`,
          distance: distanceM,
          radius: radiusM,
        });
      }
    }

    // Check for existing open clock-in
    const { data: openLog } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in')
      .eq('user_id', user.id)
      .eq('business_id', user.business_id)
      .is('clock_out', null)
      .limit(1)
      .maybeSingle();

    if (openLog) {
      return res.status(400).json({ error: 'Already clocked in', activeLog: openLog });
    }

    const insertData = {
      user_id: user.id,
      business_id: user.business_id,
      location_id,
      note: note || null,
    };
    if (latitude) insertData.clock_in_lat = latitude;
    if (longitude) insertData.clock_in_lng = longitude;
    if (distanceM !== null) insertData.clock_in_distance_m = distanceM;

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: 'Clocked in', log: data, distance: distanceM });
  } catch (err) {
    logger.error({ err }, 'Scanner clock-in error');
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

/**
 * POST /api/scanner/clock-out
 * Clock out from the scanner app
 */
router.post('/clock-out', scanLimiter, async (req, res) => {
  try {
    const { token, latitude, longitude, note } = req.body;
    const user = await resolveScanner(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const { data: openLog } = await supabaseAdmin
      .from('attendance_logs')
      .select('id, clock_in, location_id')
      .eq('user_id', user.id)
      .eq('business_id', user.business_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openLog) {
      return res.status(400).json({ error: 'Not clocked in' });
    }

    // Geofence check
    let distanceM = null;
    if (openLog.location_id) {
      const { data: location } = await supabaseAdmin
        .from('locations')
        .select('id, name, latitude, longitude, geofence_radius_m, clock_in_start, clock_in_end, clock_out_start, clock_out_end')
        .eq('id', openLog.location_id)
        .single();

      // Time window validation
      if (location) {
        const timeErr = checkTimeWindow(location, 'clock_out');
        if (timeErr) {
          return res.status(403).json({ error: 'Outside allowed hours', message: timeErr });
        }
      }

      if (location?.latitude && location?.longitude) {
        if (!latitude || !longitude) {
          return res.status(400).json({
            error: 'Location required',
            message: 'GPS is required to clock out at this location.',
          });
        }
        distanceM = Math.round(haversineDistanceM(latitude, longitude, location.latitude, location.longitude));
        const radiusM = location.geofence_radius_m || 200;
        if (distanceM > radiusM) {
          return res.status(403).json({
            error: 'Outside geofence',
            message: `You are ${distanceM}m from ${location.name}. Must be within ${radiusM}m.`,
            distance: distanceM,
            radius: radiusM,
          });
        }
      }
    }

    const updateData = { clock_out: new Date().toISOString() };
    if (note) updateData.note = note;
    if (latitude) updateData.clock_out_lat = latitude;
    if (longitude) updateData.clock_out_lng = longitude;
    if (distanceM !== null) updateData.clock_out_distance_m = distanceM;

    const { data, error } = await supabaseAdmin
      .from('attendance_logs')
      .update(updateData)
      .eq('id', openLog.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Clocked out', log: data, distance: distanceM });
  } catch (err) {
    logger.error({ err }, 'Scanner clock-out error');
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

module.exports = router;
