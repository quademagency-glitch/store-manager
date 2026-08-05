const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { invalidateApiKeyCache } = require('../middleware/apiKeyGuard');
const { attemptDelivery } = require('../services/webhookDispatcher');
const { generateApiKey } = require('../utils/apiKeyUtils');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');

const router = express.Router();

const VALID_SCOPES = ['read:catalog', 'write:orders', 'read:orders'];
const VALID_EVENTS = ['order.status_changed'];

router.use(authGuard, permissionCheck('manage_integrations'));

function scopedQuery(req, query) {
  return req.user.role === 'Platform Admin' ? query : query.eq('business_id', req.user.business_id);
}

// ── API Keys ──────────────────────────────────────────────────

router.get('/api-keys', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('api_keys')
      .select('id, name, key_prefix, scopes, status, last_used_at, created_at, revoked_at')
      .order('created_at', { ascending: false });
    query = scopedQuery(req, query);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err }, 'Error listing API keys:');
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

router.post('/api-keys', async (req, res) => {
  try {
    const { name, scopes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({ error: 'At least one scope is required' });
    }
    const invalidScopes = scopes.filter(s => !VALID_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      return res.status(400).json({ error: `Invalid scope(s): ${invalidScopes.join(', ')}` });
    }

    const { raw, prefix } = generateApiKey();
    const keyHash = await bcrypt.hash(raw, 10);

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        business_id: req.user.business_id,
        name,
        key_prefix: prefix,
        key_hash: keyHash,
        scopes,
        created_by: req.user.id,
      })
      .select('id, name, key_prefix, scopes, status, created_at')
      .single();

    if (error) throw error;

    // The full key is only ever returned here, at creation time.
    res.status(201).json({ ...data, key: raw });
  } catch (err) {
    logger.error({ err }, 'Error creating API key:');
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/api-keys/:id', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('api_keys')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: req.user.id })
      .eq('id', req.params.id);
    query = scopedQuery(req, query);

    const { data, error } = await query.select('id, key_prefix').single();
    if (error || !data) return res.status(404).json({ error: 'API key not found' });

    invalidateApiKeyCache(data.key_prefix);
    res.json({ message: 'API key revoked' });
  } catch (err) {
    logger.error({ err }, 'Error revoking API key:');
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ── Webhook Endpoints ─────────────────────────────────────────

router.get('/webhooks', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('webhook_endpoints')
      .select('id, url, events, status, created_at, updated_at')
      .order('created_at', { ascending: false });
    query = scopedQuery(req, query);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err }, 'Error listing webhook endpoints:');
    res.status(500).json({ error: 'Failed to list webhook endpoints' });
  }
});

router.post('/webhooks', async (req, res) => {
  try {
    const { url, events } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const subscribedEvents = Array.isArray(events) && events.length > 0 ? events : ['order.status_changed'];
    const invalidEvents = subscribedEvents.filter(e => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Invalid event(s): ${invalidEvents.join(', ')}` });
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const { data, error } = await supabaseAdmin
      .from('webhook_endpoints')
      .insert({
        business_id: req.user.business_id,
        url,
        secret,
        events: subscribedEvents,
        created_by: req.user.id,
      })
      .select('id, url, events, status, created_at')
      .single();

    if (error) throw error;

    // The signing secret is only ever returned here, at creation time.
    res.status(201).json({ ...data, secret });
  } catch (err) {
    logger.error({ err }, 'Error creating webhook endpoint:');
    res.status(500).json({ error: 'Failed to create webhook endpoint' });
  }
});

router.put('/webhooks/:id', async (req, res) => {
  try {
    const { url, events, status } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (url !== undefined) update.url = url;
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: "status must be 'active' or 'disabled'" });
      }
      update.status = status;
    }
    if (events !== undefined) {
      const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({ error: `Invalid event(s): ${invalidEvents.join(', ')}` });
      }
      update.events = events;
    }

    let query = supabaseAdmin.from('webhook_endpoints').update(update).eq('id', req.params.id);
    query = scopedQuery(req, query);

    const { data, error } = await query.select('id, url, events, status, updated_at').single();
    if (error || !data) return res.status(404).json({ error: 'Webhook endpoint not found' });

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error updating webhook endpoint:');
    res.status(500).json({ error: 'Failed to update webhook endpoint' });
  }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    let query = supabaseAdmin.from('webhook_endpoints').delete({ count: 'exact' }).eq('id', req.params.id);
    query = scopedQuery(req, query);

    const { error, count } = await query;
    if (error) throw error;
    if (count === 0) return res.status(404).json({ error: 'Webhook endpoint not found' });

    res.json({ message: 'Webhook endpoint deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting webhook endpoint:');
    res.status(500).json({ error: 'Failed to delete webhook endpoint' });
  }
});

// ── Delivery Log ──────────────────────────────────────────────

router.get('/webhooks/:id/deliveries', async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    let endpointQuery = supabaseAdmin.from('webhook_endpoints').select('id').eq('id', req.params.id);
    endpointQuery = scopedQuery(req, endpointQuery);
    const { data: endpoint } = await endpointQuery.single();
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

    const { data, error, count } = await supabaseAdmin
      .from('webhook_deliveries')
      .select('id, event, status, attempt_count, response_status, last_attempt_at, next_retry_at, created_at', { count: 'exact' })
      .eq('webhook_endpoint_id', req.params.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data: data || [], ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'Error listing webhook deliveries:');
    res.status(500).json({ error: 'Failed to list webhook deliveries' });
  }
});

router.post('/webhooks/:id/deliveries/:deliveryId/retry', async (req, res) => {
  try {
    let endpointQuery = supabaseAdmin
      .from('webhook_endpoints')
      .select('id, url, secret, status')
      .eq('id', req.params.id);
    endpointQuery = scopedQuery(req, endpointQuery);
    const { data: endpoint } = await endpointQuery.single();
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

    const { data: delivery, error } = await supabaseAdmin
      .from('webhook_deliveries')
      .select('*')
      .eq('id', req.params.deliveryId)
      .eq('webhook_endpoint_id', req.params.id)
      .single();

    if (error || !delivery) return res.status(404).json({ error: 'Delivery not found' });

    await attemptDelivery(delivery, endpoint);
    res.json({ message: 'Retry attempted' });
  } catch (err) {
    logger.error({ err }, 'Error retrying webhook delivery:');
    res.status(500).json({ error: 'Failed to retry webhook delivery' });
  }
});

module.exports = router;
