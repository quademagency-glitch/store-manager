const request = require('supertest');

jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const app = require('../index');
const { _reset, cspReportSummary } = require('../routes/cspReport');

// The summary endpoint reads from Postgres (cross-worker), so under the mocked
// Supabase client it returns an empty set regardless of what was posted. These
// tests therefore assert the in-process aggregation for recording behaviour,
// and only the contract of the endpoint itself.

const LEGACY = {
  'csp-report': {
    'document-uri': 'https://app.quaderp.app/sales',
    'effective-directive': 'script-src',
    'blocked-uri': 'https://evil.example.com/x.js',
    disposition: 'report',
  },
};

const MODERN = [{
  type: 'csp-violation',
  body: {
    documentURL: 'https://app.quaderp.app/inventory',
    effectiveDirective: 'img-src',
    blockedURL: 'https://cdn.example.com/logo.png',
    disposition: 'report',
  },
}];

describe('POST /api/csp-report', () => {
  beforeEach(() => _reset());

  // Browsers do not read the response and must never be delayed by it.
  it('accepts the legacy report-uri format with 204', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(LEGACY));
    expect(res.status).toBe(204);
  });

  it('accepts the modern Reporting API format with 204', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify(MODERN));
    expect(res.status).toBe(204);
  });

  it('records the violated directive and blocked URI', async () => {
    await request(app).post('/api/csp-report')
      .set('Content-Type', 'application/csp-report').send(JSON.stringify(LEGACY));
    const summary = cspReportSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].directive).toBe('script-src');
    expect(summary[0].blockedUri).toBe('https://evil.example.com/x.js');
  });

  // One misconfigured directive produces a report per pageview per asset, so
  // aggregation is what keeps this from costing more than it reports.
  it('aggregates repeats of the same violation rather than duplicating', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/csp-report')
        .set('Content-Type', 'application/csp-report').send(JSON.stringify(LEGACY));
    }
    const summary = cspReportSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].count).toBe(5);
  });

  it('tracks different violations separately', async () => {
    await request(app).post('/api/csp-report')
      .set('Content-Type', 'application/csp-report').send(JSON.stringify(LEGACY));
    await request(app).post('/api/csp-report')
      .set('Content-Type', 'application/reports+json').send(JSON.stringify(MODERN));
    expect(cspReportSummary()).toHaveLength(2);
  });

  // The body is entirely attacker-controlled — this endpoint is public.
  it('does not fall over on junk', async () => {
    for (const body of ['{}', '[]', '{"csp-report":{}}', 'null', '{"nonsense":true}']) {
      const res = await request(app).post('/api/csp-report')
        .set('Content-Type', 'application/json').send(body);
      expect(res.status).toBe(204);
    }
    expect(cspReportSummary()).toHaveLength(0);
  });

  it('truncates hostile oversized fields instead of storing them whole', async () => {
    await request(app).post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': {
        'effective-directive': 'x'.repeat(5000),
        'blocked-uri': 'y'.repeat(5000),
      }}));
    const s = cspReportSummary()[0];
    expect(s.directive.length).toBeLessThanOrEqual(60);
    expect(s.blockedUri.length).toBeLessThanOrEqual(200);
  });
});

describe('GET /api/csp-report/summary', () => {
  beforeEach(() => _reset());

  it('answers 200 with the aggregate shape', async () => {
    const res = await request(app).get('/api/csp-report/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('violations');
    expect(res.body).toHaveProperty('distinct');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('windowDays');
  });

  it('clamps the window so a caller cannot request an unbounded scan', async () => {
    expect((await request(app).get('/api/csp-report/summary?days=9999')).body.windowDays).toBe(90);
    expect((await request(app).get('/api/csp-report/summary?days=-5')).body.windowDays).toBe(30);
    expect((await request(app).get('/api/csp-report/summary?days=7')).body.windowDays).toBe(7);
  });
});
