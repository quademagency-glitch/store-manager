const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

// In-memory cache: userId → { user, expiresAt }
// NOTE: In multi-instance deployments, cache entries don't replicate across instances.
// This creates a window (up to AUTH_CACHE_TTL_MS) where stale roles/ban-status can be
// served. Set AUTH_CACHE_TTL_MS=0 to disable, or replace with Redis for strict consistency.
const userCache = new Map();
const CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '30000', 10);

// Periodic cleanup every 5 minutes
if (CACHE_TTL_MS > 0) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
      if (value.expiresAt < now) userCache.delete(key);
    }
  }, 5 * 60 * 1000).unref();
}

/**
 * Invalidate cached data for a specific user.
 * Call this whenever a user's role, permissions, or ban status changes.
 */
function invalidateUserCache(userId) {
  userCache.delete(userId);
}

async function authGuard(req, res, next) {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token.',
      });
    }

    // Verify the JWT first to get the stable userId; this is always fast (crypto only)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token.',
      });
    }

    // Check cache by userId (stable key, not raw JWT)
    if (CACHE_TTL_MS > 0) {
      const cached = userCache.get(user.id);
      if (cached && cached.expiresAt > Date.now()) {
        req.user = cached.user;
        attachLocation(req);
        return next();
      }
    }

    // Fetch user record with role & locations
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        name,
        email,
        business_id,
        status,
        role_id,
        roles:role_id (
          name,
          permissions
        ),
        businesses (
          status
        ),
        user_locations(location_id)
      `)
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User record not found. Please contact your manager.',
      });
    }

    if (userData.status === 'banned') {
      invalidateUserCache(user.id);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your account has been banned. Please contact support.',
      });
    }

    if (userData.businesses && userData.businesses.status === 'banned') {
      invalidateUserCache(user.id);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your business has been banned. Please contact support.',
      });
    }

    req.user = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      business_id: userData.business_id,
      status: userData.status,
      role: userData.roles ? userData.roles.name : 'Unknown',
      role_id: userData.role_id,
      permissions: userData.roles ? userData.roles.permissions : [],
      location_ids: userData.user_locations ? userData.user_locations.map(ul => ul.location_id) : [],
    };

    if (CACHE_TTL_MS > 0) {
      userCache.set(user.id, { user: req.user, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    attachLocation(req);
    next();
  } catch (err) {
    logger.error({ err }, 'Auth guard error');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication check failed.',
    });
  }
}

function attachLocation(req) {
  const requestedLocationId = req.headers['x-location-id'];
  if (requestedLocationId && req.user.location_ids.includes(requestedLocationId)) {
    req.user.active_location_id = requestedLocationId;
  } else if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin') {
    req.user.active_location_id = requestedLocationId;
  } else if (req.user.location_ids.length > 0) {
    req.user.active_location_id = req.user.location_ids[0];
  } else {
    req.user.active_location_id = null;
  }
}

module.exports = authGuard;
module.exports.invalidateUserCache = invalidateUserCache;
