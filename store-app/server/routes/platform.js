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

module.exports = router;
