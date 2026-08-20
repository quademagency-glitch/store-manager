const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { PREFIX_LENGTH } = require('../utils/apiKeyUtils');

// In-memory cache: keyPrefix → { business, expiresAt }
// Mirrors authGuard.js's caching strategy. Same multi-instance caveat applies:
// a revoked key can be served stale for up to CACHE_TTL_MS unless explicitly
// invalidated via invalidateApiKeyCache (called on revoke).
const keyCache = new Map();
const fetchPromises = new Map();
const CACHE_TTL_MS = parseInt(process.env.API_KEY_CACHE_TTL_MS ?? '300000', 10); // Default: 5 minutes

if (CACHE_TTL_MS > 0) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of keyCache.entries()) {
      if (value.expiresAt < now) keyCache.delete(key);
    }
  }, 5 * 60 * 1000).unref();
}

function invalidateApiKeyCache(keyPrefix) {
  keyCache.delete(keyPrefix);
}

async function apiKeyGuard(req, res, next) {
  try {
    const rawKey = req.headers['x-api-key'];

    if (!rawKey || rawKey.length < PREFIX_LENGTH) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid API key.',
      });
    }

    const prefix = rawKey.slice(0, PREFIX_LENGTH);

    // ── Check cache ──────────────────────────────────────────────
    if (CACHE_TTL_MS > 0) {
      const cached = keyCache.get(prefix);
      if (cached && cached.expiresAt > Date.now()) {
        req.business = cached.business;
        touchLastUsed(cached.business.apiKeyId);
        return next();
      }
    }

    // ── Resolve, with coalescing to avoid a thundering herd on cold cache ──
    let resultObj;
    if (fetchPromises.has(prefix)) {
      resultObj = await fetchPromises.get(prefix);
    } else {
      const promise = resolveApiKey(rawKey, prefix);
      fetchPromises.set(prefix, promise);
      resultObj = await promise;
      fetchPromises.delete(prefix);
    }

    if (resultObj.error) {
      return res.status(resultObj.status).json({ error: resultObj.error, message: resultObj.message });
    }

    req.business = resultObj.business;

    if (CACHE_TTL_MS > 0) {
      keyCache.set(prefix, { business: req.business, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    touchLastUsed(req.business.apiKeyId);
    next();
  } catch (err) {
    logger.error({ err }, 'API key guard error');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'API key check failed.',
    });
  }
}

async function resolveApiKey(rawKey, prefix) {
  const { data: row, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, business_id, scopes, status, key_hash, businesses(id, slug, status)')
    .eq('key_prefix', prefix)
    .single();

  if (error || !row || row.status !== 'active') {
    return { error: 'Unauthorized', message: 'Invalid or revoked API key.', status: 401 };
  }

  const valid = await bcrypt.compare(rawKey, row.key_hash);
  if (!valid) {
    return { error: 'Unauthorized', message: 'Invalid or revoked API key.', status: 401 };
  }

  if (row.businesses && row.businesses.status === 'banned') {
    return { error: 'Forbidden', message: 'This business account is suspended.', status: 403 };
  }

  return {
    business: {
      id: row.business_id,
      slug: row.businesses ? row.businesses.slug : null,
      scopes: row.scopes || [],
      apiKeyId: row.id,
    },
  };
}

// Fire-and-forget, never blocks the request on a write.
function touchLastUsed(apiKeyId) {
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKeyId)
    .then(() => {}, (err) => logger.debug({ err }, 'Failed to update api_keys.last_used_at'));
}

module.exports = apiKeyGuard;
module.exports.invalidateApiKeyCache = invalidateApiKeyCache;
