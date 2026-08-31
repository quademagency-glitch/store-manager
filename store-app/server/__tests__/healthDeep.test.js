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

  /* "Is my push live yet" used to be answered by watching process uptime and
     inferring a restart, which says a deploy happened but not which one. */
  it('names the commit that is serving', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abcdef1234567890';
    _resetCache();
    const res = await request(app).get('/api/health/deep');
    expect(res.body.release.commit).toBe('abcdef1');
    expect(typeof res.body.release.bootedAt).toBe('string');
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
  });

  it('says unknown rather than failing when no commit is injected', async () => {
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.SOURCE_VERSION;
    _resetCache();
    const res = await request(app).get('/api/health/deep');
    expect(res.status).toBe(200);
    expect(res.body.release.commit).toBe('unknown');
  });

  it('reports the scheduled jobs without letting a late one fail the check', async () => {
    const res = await request(app).get('/api/health/deep');
    expect(res.body.checks.cron).toBeDefined();
    // A cron problem must never take the instance out of rotation.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
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
