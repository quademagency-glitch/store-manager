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

  /* checkCron used to read the 200 most recent cron_runs rows and pick each
     job's latest from them. The two five-minute sweeps write 576 rows a day
     between them, so in production those 200 rows covered 8.2 hours and every
     DAILY job reported "never-run" for two thirds of the day. The jobs had run
     all along; only the report was wrong. A health check that cries wolf is
     one nobody reads, which is how a real stall would have been missed. */
  it('reports a daily job that ran this morning, rather than "never-run"', async () => {
    const baseline = { platform_plans: { data: [{ id: 'plan-1' }], error: null, count: 1 } };
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // One result per from('cron_runs') call. A per-job lookup finds this row;
    // a single shared query would have to compete with the five-minute jobs.
    Object.assign(mockSupabase, buildMockSupabase({
      ...baseline,
      cron_runs: [{ data: [{ started_at: threeHoursAgo, scheduled_for: threeHoursAgo }], error: null }],
    }));
    _resetCache();

    try {
      const res = await request(app).get('/api/health/deep');
      const job = res.body.checks.cron.jobs['subscription-checks'];
      expect(job.status).toBe('ok');
      expect(job.lastRunAt).toBe(threeHoursAgo);

      // Pins the shape of the fix: one query per job, not one for all of them.
      const cronQueries = mockSupabase.from.mock.calls.filter((c) => c[0] === 'cron_runs');
      expect(cronQueries.length).toBeGreaterThan(1);
    } finally {
      Object.assign(mockSupabase, buildMockSupabase(baseline));
      _resetCache();
    }
  });

  it('still says never-run when a job genuinely has no row', async () => {
    const res = await request(app).get('/api/health/deep');
    expect(res.body.checks.cron.jobs['subscription-checks'].status).toBe('never-run');
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
