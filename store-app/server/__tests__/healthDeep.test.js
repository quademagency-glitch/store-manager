const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase({
  platform_plans: { data: [{ id: 'plan-1' }], error: null, count: 1 },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

const app = require('../index');
const { _resetCache } = require('../routes/healthDeep');

describe('GET /api/health/deep', () => {
  beforeEach(() => {
    _resetCache();
    mockSupabase.from.mockClear();
  });

  it('returns 200 with per-dependency timings', async () => {
    const res = await request(app).get('/api/health/deep');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.supabase.status).toBe('ok');
    expect(typeof res.body.checks.supabase.ms).toBe('number');
    expect(res.body.checks).toHaveProperty('resend');
    expect(res.body.checks).toHaveProperty('jwks');
  });

  it('includes the proxy diagnostic block for choosing TRUST_PROXY_HOPS', async () => {
    const res = await request(app)
      .get('/api/health/deep')
      .set('X-Forwarded-For', '203.0.113.9, 198.51.100.2');
    expect(res.body.proxy).toBeDefined();
    expect(res.body.proxy).toHaveProperty('ip');
    expect(res.body.proxy).toHaveProperty('ips');
    expect(res.body.proxy.xff).toBe('203.0.113.9, 198.51.100.2');
    expect(res.body.proxy.trustProxySetting).not.toBe(true);
  });

  // The cache is the primary defence against this endpoint being used to
  // amplify cheap HTTP requests into Supabase load.
  it('serves a second call from cache without re-querying Supabase', async () => {
    await request(app).get('/api/health/deep');
    const callsAfterFirst = mockSupabase.from.mock.calls.length;

    await request(app).get('/api/health/deep');
    expect(mockSupabase.from.mock.calls.length).toBe(callsAfterFirst);
  });

  it('reports 503 when Supabase is unreachable', async () => {
    const failing = buildMockSupabase({
      platform_plans: { data: null, error: { message: 'connection refused' }, count: 0 },
    });
    jest.resetModules();
    jest.doMock('../db/supabase', () => ({ supabaseAdmin: failing }));

    const freshApp = require('../index');
    const res = await request(freshApp).get('/api/health/deep');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.checks.supabase.status).toBe('fail');

    jest.dontMock('../db/supabase');
    jest.resetModules();
  });
});

describe('GET /api/health (liveness)', () => {
  // Railway's healthcheckPath points here, so it must never depend on Supabase.
  it('stays dependency-free', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toBeUndefined();
  });
});
