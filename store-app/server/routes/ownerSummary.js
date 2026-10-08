const express = require('express');
const authGuard = require('../middleware/authGuard');
const { supabaseAdmin: db } = require('../db/supabase');
const { buildSummary } = require('../services/ownerSummary');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * The end-of-day summary switch, per person, and a preview of today's.
 * Only people who see the whole business (owners, or a role with
 * manage_business) may receive it: it covers every branch's money.
 */
const eligible = (user) => !!user.business_id && (['Business Admin', 'Platform Admin'].includes(user.role) || !!user.permissions?.includes('manage_business'));

router.get('/', authGuard, async (req, res) => {
  try {
    const { data, error } = await db.from('users').select('daily_summary_email').eq('id', req.user.id).single();
    if (error) throw error;
    res.json({ enabled: !!data?.daily_summary_email, eligible: eligible(req.user) });
  } catch (err) {
    logger.error({ err }, 'owner summary: read setting failed');
    res.status(500).json({ error: 'The summary setting could not be loaded.' });
  }
});

router.put('/', authGuard, async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Choose on or off.' });
  if (enabled && !eligible(req.user)) return res.status(403).json({ error: 'The summary covers the whole business, so only owners can receive it.' });
  try {
    const { error } = await db.from('users').update({ daily_summary_email: enabled }).eq('id', req.user.id);
    if (error) throw error;
    res.json({ enabled });
  } catch (err) {
    logger.error({ err }, 'owner summary: save setting failed');
    res.status(500).json({ error: 'The summary setting could not be saved.' });
  }
});

router.get('/preview', authGuard, async (req, res) => {
  if (!eligible(req.user)) return res.status(403).json({ error: 'The summary covers the whole business, so only owners can see it.' });
  try {
    res.json(await buildSummary(req.user.business_id, new Date().toISOString().slice(0, 10)));
  } catch (err) {
    logger.error({ err }, 'owner summary: preview failed');
    res.status(500).json({ error: "Today's summary could not be built. Please try again." });
  }
});

module.exports = router;
