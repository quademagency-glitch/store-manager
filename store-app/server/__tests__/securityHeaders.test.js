const request = require('supertest');

jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const app = require('../index');

describe('security headers', () => {
  it('sets nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('denies framing', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets HSTS without includeSubDomains', async () => {
    const res = await request(app).get('/api/health');
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=\d+/);
    // Vercel rewrites /api/* so this header reaches the browser under
    // quaderp.app. includeSubDomains would pin every *.quaderp.app host,
    // including per-business subdomains, for the full max-age with no revoke.
    expect(hsts).not.toMatch(/includeSubDomains/i);
  });

  it('removes x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets a referrer policy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  // Helmet's same-origin default would break the binary attachments this API
  // serves cross-origin (receipts ZIP, payroll CSV, business export).
  it('allows cross-origin resource loads', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  // CSP on a JSON API is inert, it belongs on the document, which Vercel
  // serves. Asserting its absence keeps someone from "helpfully" adding it back
  // and believing the API is protected by it.
  it('does not set CSP on the API (it belongs in vercel.json)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('preserves the existing X-Request-Id contract', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.status).toBe(200);
  });
});

describe('Sentry', () => {
  it('is inert under test', () => {
    expect(require('../instrument').enabled).toBe(false);
  });

  // The gate must be around require(), not just init(): loading the SDK
  // installs OpenTelemetry http instrumentation that would perturb supertest
  // and the node-fetch db/supabase.js relies on.
  it('does not load the Sentry SDK at all when disabled', () => {
    const loaded = Object.keys(require.cache).some((p) => p.includes('@sentry/node'));
    expect(loaded).toBe(false);
  });
});
