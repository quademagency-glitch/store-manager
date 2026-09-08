const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/platform/settings
 * Get platform-wide settings (only non-secret or obfuscated secret keys)
 */
router.get('/settings', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('id, key, value, description, is_secret')
      .order('key');

    if (error) throw error;

    // Obfuscate secret values before sending to client
    const safeData = data.map(setting => {
      if (setting.is_secret && setting.value) {
        return { ...setting, value: '********' }; // Mask secret keys
      }
      return setting;
    });

    res.json(safeData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching platform settings:');
    res.status(500).json({ error: 'Failed to fetch platform settings' });
  }
});

/**
 * PUT /api/platform/settings
 * Update platform settings
 */
router.put('/settings', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { settings } = req.body; // Array of { key, value }

    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings must be an array' });
    }

    const updates = settings.filter(s => s.value !== '********').map(async (setting) => {
      return supabaseAdmin
        .from('platform_settings')
        .update({ value: setting.value, updated_at: new Date() })
        .eq('key', setting.key);
    });

    await Promise.all(updates);

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error updating platform settings:');
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

/**
 * GET /api/platform/activity
 * What the public front door has done lately: who opened the demo, and who
 * signed up.
 *
 * Both events were already being written to audit_logs by routes/auth.js and
 * nothing ever read them back, so the only way to find out whether anybody
 * had tried the product was to query the database by hand. A signup also
 * sends an email now; the demo deliberately does not, because one curious
 * visitor clicking around can produce several opens in a minute and that is
 * an inbox full of noise rather than a signal. This endpoint is the place to
 * look instead.
 *
 * Ghana keeps UTC+0 all year and observes no daylight saving, so a UTC day
 * boundary IS the local day boundary. That is luck, not design, and it is
 * written down here so nobody "fixes" it by adding a timezone conversion.
 *
 * Access: Platform Admin (manage_platform).
 */
router.get('/activity', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, action, created_at, actor_email, ip_address, user_agent, metadata, business_id')
      .in('action', ['auth.demo_login', 'auth.signup'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = data || [];
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const bucket = (action, from) => rows.filter(
      (r) => r.action === action && new Date(r.created_at) >= from,
    );

    /* Distinct IPs rather than raw hits. Fourteen opens from one address is
       one interested person, and counting it as fourteen would flatter the
       number badly at the volumes this currently sees. */
    const distinct = (list) => new Set(list.map((r) => r.ip_address).filter(Boolean)).size;

    const demoToday = bucket('auth.demo_login', startOfToday);
    const demoWeek = bucket('auth.demo_login', weekAgo);
    const signupsToday = bucket('auth.signup', startOfToday);
    const signupsWeek = bucket('auth.signup', weekAgo);

    res.json({
      totals: {
        demoOpensToday: demoToday.length,
        demoVisitorsToday: distinct(demoToday),
        demoOpensWeek: demoWeek.length,
        demoVisitorsWeek: distinct(demoWeek),
        demoOpens30d: rows.filter((r) => r.action === 'auth.demo_login').length,
        signupsToday: signupsToday.length,
        signupsWeek: signupsWeek.length,
        signups30d: rows.filter((r) => r.action === 'auth.signup').length,
      },
      /* Capped well below the query limit. This feeds a panel someone scans,
         not an export, and audit_logs already has its own full-history page. */
      recent: rows.slice(0, 50).map((r) => ({
        id: r.id,
        action: r.action,
        created_at: r.created_at,
        business_name: r.metadata?.business_name || null,
        plan: r.metadata?.plan || null,
        attribution: r.metadata?.attribution || null,
        actor_email: r.action === 'auth.signup' ? r.actor_email : null,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
      })),
      window_days: 30,
      truncated: rows.length === 500,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching platform activity:');
    res.status(500).json({ error: 'Failed to fetch platform activity' });
  }
});

module.exports = router;
