const { supabaseAdmin } = require('../db/supabase');
const { verifyToken } = require('../utils/jwtVerifier');
const { demoWriteRefusal, respondDemoRefusal } = require('./demoGuard');
const logger = require('../utils/logger');

// In-memory cache: userId → { user, expiresAt }
// NOTE: In multi-instance deployments, cache entries don't replicate across instances.
// This creates a window (up to AUTH_CACHE_TTL_MS) where stale roles/ban-status can be
// served. Set AUTH_CACHE_TTL_MS=0 to disable, or replace with Redis for strict consistency.
const userCache = new Map();
const fetchPromises = new Map();
const CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '300000', 10); // Default: 5 minutes

/**
 * Route mounts an owner can still reach after their free trial lapses.
 *
 * A lapsed trial (`businesses.status = 'expired'`, set by subscriptionCron)
 * is not a ban. Banning locks the account out entirely, which for an unpaid
 * trial would mean the one thing the business most needs to do — pay — is the
 * one thing it cannot do. So the app narrows to exactly the surface required
 * to sign in, see what happened, and buy a plan.
 *
 * Matched against req.baseUrl, i.e. the path the router was mounted at.
 */
const EXPIRED_TRIAL_ALLOWED_MOUNTS = new Set([
  '/api/auth',          // /me, /logout — the session itself
  '/api/businesses',    // /me, /me/setup-status — what the shell renders from
  '/api/subscriptions', // plans + Paystack checkout: the way out
  '/api/billing',       // invoices and receipts for the purchase
]);

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

    // ── Step 1: Verify JWT locally (pure crypto, ~0.1ms) ──────────
    // Previously: called supabaseAdmin.auth.getUser(token) which was an
    // HTTP round-trip to Supabase (~300-500ms) — the #1 bottleneck at scale.
    let userId;
    try {
      const claims = await verifyToken(token);
      userId = claims.userId;
    } catch (jwtErr) {
      // If local verification fails (e.g., JWKS not loaded yet), fall back
      // to Supabase API as a safety net during startup/key rotation.
      logger.debug({ err: jwtErr.message }, 'Local JWT verify failed, falling back to Supabase');
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token.',
        });
      }
      userId = user.id;
    }

    // ── Step 2: Check cache for user data ─────────────────────────
    if (CACHE_TTL_MS > 0) {
      const cached = userCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        req.user = cached.user;
        if (isBlockedByExpiredTrial(req)) return respondTrialExpired(res);
        const cachedRefusal = demoWriteRefusal(req);
        if (cachedRefusal) return respondDemoRefusal(res, cachedRefusal);
        attachLocation(req);
        return next();
      }
    }

    // ── Step 3: Fetch user record with coalescing ─────────────────
    let userDataObj;
    if (fetchPromises.has(userId)) {
      userDataObj = await fetchPromises.get(userId);
    } else {
      const promise = (async () => {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select(`
            id, name, email, business_id, status, role_id,
            roles:role_id (name, permissions),
            businesses (status, is_demo),
            user_locations(location_id)
          `)
          .eq('id', userId)
          .single();

        if (error || !data) return { error: 'Unauthorized', message: 'User record not found.' };
        if (data.status === 'banned') return { error: 'Forbidden', message: 'Your account has been banned.' };
        if (data.businesses && data.businesses.status === 'banned') return { error: 'Forbidden', message: 'Your business has been banned.' };

        const user = {
          id: data.id,
          name: data.name,
          email: data.email,
          business_id: data.business_id,
          status: data.status,
          // 'active' | 'trialing' | 'expired'. Carried on req.user so routes
          // and the client can tell a trial from a paid account.
          business_status: data.businesses ? data.businesses.status : null,
          // Public sandbox tenant. Drives the read-mostly guard below and the
          // persistent banner in the client.
          is_demo: data.businesses ? data.businesses.is_demo === true : false,
          role: data.roles ? data.roles.name : 'Unknown',
          role_id: data.role_id,
          permissions: data.roles ? data.roles.permissions : [],
          location_ids: data.user_locations ? data.user_locations.map(ul => ul.location_id) : [],
        };
        return { user };
      })();
      
      fetchPromises.set(userId, promise);
      userDataObj = await promise;
      fetchPromises.delete(userId);
    }

    if (userDataObj.error) {
      if (userDataObj.error === 'Forbidden') invalidateUserCache(userId);
      return res.status(userDataObj.error === 'Unauthorized' ? 401 : 403).json({
        error: userDataObj.error,
        message: userDataObj.message,
      });
    }

    req.user = userDataObj.user;

    if (CACHE_TTL_MS > 0) {
      userCache.set(userId, { user: req.user, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    if (isBlockedByExpiredTrial(req)) return respondTrialExpired(res);

    const refusal = demoWriteRefusal(req);
    if (refusal) return respondDemoRefusal(res, refusal);

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

/**
 * True when this request belongs to a business whose free trial has lapsed
 * and is aimed somewhere other than the billing surface.
 *
 * Platform Admins are exempt: they operate across tenants and may well need
 * to go and look at the expired business.
 */
function isBlockedByExpiredTrial(req) {
  if (req.user.business_status !== 'expired') return false;
  if (req.user.role === 'Platform Admin') return false;
  return !EXPIRED_TRIAL_ALLOWED_MOUNTS.has(req.baseUrl);
}

function respondTrialExpired(res) {
  return res.status(403).json({
    error: 'Trial expired',
    code: 'TRIAL_EXPIRED',
    message: 'Your free trial has ended. Choose a plan to carry on using QuadERP.',
  });
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
