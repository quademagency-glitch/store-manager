'use strict';

/**
 * Artillery Processor — handles auth token acquisition and injection.
 *
 * Strategy:
 *   1. Before the test starts, login once to get a valid JWT.
 *   2. Every virtual user gets that token injected via `beforeScenario`.
 *   3. This avoids hitting the login rate limiter (10 req/15 min per IP).
 *
 * Usage:
 *   Set AUTH_EMAIL and AUTH_PASSWORD env vars, or edit the defaults below.
 */

const https = require('https');
const http = require('http');

// ── Configuration ──────────────────────────────────────────────
const API_BASE = process.env.LOAD_TEST_TARGET || 'https://store-manager-api-production-c330.up.railway.app';
const AUTH_EMAIL = process.env.AUTH_EMAIL || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

let cachedToken = null;

// ── Helper: simple HTTP POST ──────────────────────────────────
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = transport.request(options, (res) => {
      let chunks = '';
      res.on('data', (chunk) => (chunks += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Login once and cache the token ────────────────────────────
async function getAuthToken() {
  if (cachedToken) return cachedToken;

  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    console.error('\n❌ AUTH_EMAIL and AUTH_PASSWORD must be set!');
    console.error('   Example: AUTH_EMAIL=admin@test.com AUTH_PASSWORD=test123 npx artillery run config.yml\n');
    process.exit(1);
  }

  console.log(`\n🔑 Logging in as ${AUTH_EMAIL}...`);

  const result = await postJSON(`${API_BASE}/api/auth/login`, {
    email: AUTH_EMAIL,
    password: AUTH_PASSWORD,
  });

  if (result.status !== 200 || !result.body?.session?.access_token) {
    console.error('❌ Login failed:', result.status, result.body);
    process.exit(1);
  }

  cachedToken = result.body.session.access_token;
  console.log(`✅ Got auth token (${cachedToken.substring(0, 20)}...)`);
  console.log(`   User: ${result.body.user?.name} (${result.body.user?.role})\n`);

  return cachedToken;
}

// ── Artillery hook: inject token into each virtual user ───────
// Artillery v2+ uses async/await (no `done` callback)
async function setAuthToken(userContext, events) {
  try {
    const token = await getAuthToken();
    userContext.vars.authToken = token;
  } catch (err) {
    console.error('Failed to get auth token:', err.message);
  }
}

module.exports = {
  setAuthToken,
};
