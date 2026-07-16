const mcache = new Map();

// Optional: clean up expired entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of mcache.entries()) {
    if (value.expiresAt < now) {
      mcache.delete(key);
    }
  }
}, 60 * 1000).unref();

/**
 * Express middleware to cache JSON responses in memory.
 * Best used for expensive analytics/dashboard queries.
 * 
 * @param {number} durationSec - How long to cache the response in seconds
 */
function apiCache(durationSec) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Cache key incorporates URL, business ID, location ID, and role.
    // This ensures strict data isolation between tenants and roles.
    const bizId = req.user?.business_id || 'sys';
    const locId = req.user?.active_location_id || 'all';
    const role = req.user?.role || 'none';
    const url = req.originalUrl || req.url;
    
    const key = `__cache__${url}__biz_${bizId}__loc_${locId}__role_${role}`;

    const cachedEntry = mcache.get(key);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedEntry.body);
    }

    // Wrap res.json to intercept the response payload
    const originalJson = res.json;
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        mcache.set(key, {
          body,
          expiresAt: Date.now() + (durationSec * 1000)
        });
      }
      return originalJson.call(res, body);
    };

    res.setHeader('X-Cache', 'MISS');
    next();
  };
}

/**
 * Clears cache entries that match a specific prefix.
 * Useful for invalidating lists when new items are created.
 */
function invalidateCachePrefix(prefix) {
  for (const key of mcache.keys()) {
    if (key.includes(prefix)) {
      mcache.delete(key);
    }
  }
}

module.exports = { apiCache, invalidateCachePrefix };
