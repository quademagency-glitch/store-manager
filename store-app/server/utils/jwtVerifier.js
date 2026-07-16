/**
 * Local JWT Verifier — verifies Supabase Auth JWTs without calling the Supabase API.
 *
 * WHY: The previous approach called `supabaseAdmin.auth.getUser(token)` on every
 * single request. That's an HTTP round-trip to Supabase (~300-500ms) that becomes
 * the primary bottleneck under load. Under 1,000 concurrent users, this alone caused
 * 16,307 socket timeouts.
 *
 * HOW: Supabase Auth issues JWTs signed with an ES256 private key. The matching
 * public key is available at the JWKS endpoint. We fetch it once at startup,
 * cache it, and verify all tokens locally using pure crypto — ~0.1ms vs ~400ms.
 *
 * SECURITY: This is the industry-standard approach (same as Auth0, Firebase, etc.).
 * The JWT signature guarantees the token was issued by Supabase. We still check
 * expiration, issuer, and audience claims.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ── JWKS Key Cache ─────────────────────────────────────────────
let cachedPublicKey = null;
let jwksLastFetched = 0;
const JWKS_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // Re-fetch every 1 hour

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const JWKS_URL = process.env.SUPABASE_JWKS_URL ||
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const EXPECTED_KID = process.env.SUPABASE_JWT_KID || '';

/**
 * Convert a JWK (JSON Web Key) with EC parameters to a PEM public key.
 */
function jwkToPem(jwk) {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new Error(`Unsupported JWK key type: ${jwk.kty}/${jwk.crv}`);
  }

  // Decode the x and y coordinates from base64url
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');

  // Create the EC public key using Node.js crypto
  const keyObject = crypto.createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: jwk.x,
      y: jwk.y,
    },
    format: 'jwk',
  });

  return keyObject.export({ type: 'spki', format: 'pem' });
}

/**
 * Fetch the JWKS from Supabase and extract the signing public key.
 * Caches the key in memory and refreshes every hour.
 */
let jwksFetchPromise = null;

async function getPublicKey() {
  const now = Date.now();
  if (cachedPublicKey && (now - jwksLastFetched) < JWKS_REFRESH_INTERVAL_MS) {
    return cachedPublicKey;
  }

  if (jwksFetchPromise) {
    return jwksFetchPromise;
  }

  jwksFetchPromise = (async () => {
    try {
      const response = await fetch(JWKS_URL);
      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
      }

      const jwks = await response.json();
      const keys = jwks.keys || [];

      let targetKey = keys.find(k => k.kid === EXPECTED_KID);
      if (!targetKey && keys.length > 0) {
        targetKey = keys[0];
        logger.warn({ expectedKid: EXPECTED_KID, foundKid: targetKey.kid },
          'JWKS: Expected KID not found, using first available key');
      }

      if (!targetKey) {
        throw new Error('No usable keys found in JWKS response');
      }

      cachedPublicKey = jwkToPem(targetKey);
      jwksLastFetched = Date.now();
      logger.info({ kid: targetKey.kid }, '🔑 JWKS public key loaded');
      return cachedPublicKey;
    } catch (err) {
      if (cachedPublicKey) {
        logger.warn({ err: err.message }, 'JWKS refresh failed, using cached key');
        return cachedPublicKey;
      }
      throw err;
    } finally {
      jwksFetchPromise = null;
    }
  })();

  return jwksFetchPromise;
}

/**
 * Verify a JWT locally and return the decoded payload.
 *
 * @param {string} token - The raw JWT string
 * @returns {{ userId: string, email: string }} - Extracted claims
 * @throws {Error} If the token is invalid, expired, or has a bad signature
 */
async function verifyToken(token) {
  const publicKey = await getPublicKey();

  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['ES256'],
    // Supabase Auth tokens have these standard claims
    issuer: `${SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });

  return {
    userId: decoded.sub,
    email: decoded.email,
  };
}

/**
 * Pre-warm the JWKS cache at startup so the first request doesn't block.
 */
async function warmUp() {
  try {
    await getPublicKey();
  } catch (err) {
    logger.warn({ err: err.message }, 'JWT verifier warm-up failed — will retry on first request');
  }
}

// Warm up immediately when this module is loaded
warmUp();

module.exports = { verifyToken, getPublicKey };
