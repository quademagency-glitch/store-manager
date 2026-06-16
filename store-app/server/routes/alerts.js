const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

function applyLocationFilter(query, req) {
  if (req.user.active_location_id) {
    return query.eq('location_id', req.user.active_location_id);
  } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
    if (req.user.location_ids && req.user.location_ids.length > 0) {
      return query.in('location_id', req.user.location_ids);
    } else {
      return query.eq('location_id', '00000000-0000-0000-0000-000000000000');
    }
  }
  return query;
}

/**
 * GET /api/alerts
 * Fetch all alerts for the current location/business
 */
router.get('/', authGuard, permissionCheck('view_analytics'), async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabaseAdmin
      .from('alerts')
      .select(`
        *,
        user:users!user_id(id, name, email),
        resolved_by_user:users!resolved_by(id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    query = applyLocationFilter(query, req);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching alerts:');
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * PUT /api/alerts/:id/resolve
 * Mark an alert as resolved
 */
router.put('/:id/resolve', authGuard, permissionCheck('view_analytics'), async (req, res) => {
  try {
    const alertId = req.params.id;

    // Verify the alert belongs to the user's domain
    let verifyQuery = supabaseAdmin
      .from('alerts')
      .select('id, business_id, location_id, status')
      .eq('id', alertId)
      .single();

    const { data: alert, error: verifyError } = await verifyQuery;
    
    if (verifyError || !alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (req.user.role !== 'Platform Admin') {
      if (alert.business_id !== req.user.business_id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('alerts')
      .update({
        status: 'resolved',
        resolved_by: req.user.id,
        resolved_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Alert resolved successfully', alert: data });
  } catch (err) {
    logger.error({ err: err }, 'Error resolving alert:');
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

module.exports = router;
