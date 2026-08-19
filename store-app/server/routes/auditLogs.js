/**
 * Read-only access to the security audit trail (migration 070).
 *
 * There is deliberately no write endpoint. Rows are inserted only by
 * utils/auditLog.js via the service role, and migration 070 grants no
 * INSERT/UPDATE/DELETE policy to authenticated users at all — an audit trail
 * the audited party can edit is not an audit trail.
 */

const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const logger = require('../utils/logger');
const { AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

const MAX_PAGE_SIZE = 100;

/**
 * GET /api/audit-logs
 * Query: page, limit, action, actor_user_id, resource_type, from, to
 */
router.get('/', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Platform admins can see across tenants; everyone else is pinned to their
    // own business. This mirrors the RLS policy rather than relying on it —
    // these queries run as service_role, which bypasses RLS entirely, so the
    // scoping HAS to be enforced here.
    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    } else if (req.query.business_id) {
      query = query.eq('business_id', req.query.business_id);
    }

    if (req.query.action) query = query.eq('action', req.query.action);
    if (req.query.actor_user_id) query = query.eq('actor_user_id', req.query.actor_user_id);
    if (req.query.resource_type) query = query.eq('resource_type', req.query.resource_type);
    if (req.query.from) query = query.gte('created_at', req.query.from);
    if (req.query.to) query = query.lte('created_at', req.query.to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data: data || [],
      page,
      limit,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    });
  } catch (err) {
    logger.error({ err, reqId: req.id }, 'Error fetching audit logs');
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/audit-logs/actions
 * The canonical action list, so the viewer's filter doesn't have to hardcode it.
 */
router.get('/actions', authGuard, permissionCheck('manage_business'), (req, res) => {
  res.json(Object.values(AUDIT_ACTIONS).sort());
});

module.exports = router;
