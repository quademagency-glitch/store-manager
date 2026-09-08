const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

/**
 * GET /api/platform/activity.
 *
 * Demo opens and signups were written to audit_logs on every occurrence and
 * read back by nothing, so the only way to learn whether anyone had tried the
 * product was to query the database by hand. This endpoint is the read.
 *
 * The counting is the part worth testing. Fourteen demo opens from one address
 * is one interested person, and reporting fourteen would flatter the number
 * badly at the volumes this currently sees, so distinct addresses are counted
 * alongside raw hits and the panel shows both.
 *
 * One app, one mock, results swapped per test, matching locations.test.js.
 */
const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const app = require('../index');

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const demo = (ip, when) => ({
  id: Math.random(), action: 'auth.demo_login', created_at: when,
  actor_email: 'demo@quaderp.app', ip_address: ip,
  user_agent: 'Mozilla/5.0 (iPhone)', metadata: {}, business_id: 'demo-biz',
});

const signup = (name, when, attribution = null) => ({
  id: Math.random(), action: 'auth.signup', created_at: when,
  actor_email: 'owner@example.com', ip_address: '10.0.0.9',
  user_agent: 'Mozilla/5.0 (Macintosh)',
  metadata: { business_name: name, plan: 'Single Branch', attribution },
  business_id: 'new-biz',
});

const get = () =>
  request(app).get('/api/platform/activity').set('Authorization', 'Bearer valid-test-token');

beforeEach(() => {
  for (const k of Object.keys(overrides)) delete overrides[k];
});

describe('GET /api/platform/activity', () => {
  it('counts raw opens and distinct addresses separately', async () => {
    overrides.audit_logs = {
      // One person clicking around four times, plus a second person once.
      data: [
        demo('1.1.1.1', hoursAgo(1)), demo('1.1.1.1', hoursAgo(1)),
        demo('1.1.1.1', hoursAgo(2)), demo('1.1.1.1', hoursAgo(2)),
        demo('2.2.2.2', hoursAgo(3)),
      ],
      error: null,
    };

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.totals.demoOpensToday).toBe(5);
    expect(res.body.totals.demoVisitorsToday).toBe(2);
  });

  it('separates today from the rest of the week', async () => {
    overrides.audit_logs = {
      data: [demo('1.1.1.1', hoursAgo(1)), demo('2.2.2.2', hoursAgo(70))],
      error: null,
    };

    const res = await get();

    expect(res.body.totals.demoOpensToday).toBe(1);
    expect(res.body.totals.demoOpensWeek).toBe(2);
  });

  it('does not confuse a signup with a demo open', async () => {
    overrides.audit_logs = {
      data: [signup('Adom Superstore', hoursAgo(1)), demo('1.1.1.1', hoursAgo(1))],
      error: null,
    };

    const res = await get();

    expect(res.body.totals.signupsToday).toBe(1);
    expect(res.body.totals.demoOpensToday).toBe(1);
  });

  it('carries the business, plan and source through to the panel', async () => {
    overrides.audit_logs = {
      data: [signup('Adom Superstore', hoursAgo(1), { utm_source: 'whatsapp' })],
      error: null,
    };

    const res = await get();
    const [row] = res.body.recent;

    expect(row.business_name).toBe('Adom Superstore');
    expect(row.plan).toBe('Single Branch');
    expect(row.attribution).toEqual({ utm_source: 'whatsapp' });
  });

  /* A demo session is one shared account, so naming the actor would print
     demo@quaderp.app against every row and imply we know who it was. */
  it('does not attach an identity to an anonymous demo open', async () => {
    overrides.audit_logs = { data: [demo('1.1.1.1', hoursAgo(1))], error: null };

    const [row] = (await get()).body.recent;

    expect(row.actor_email).toBeNull();
    expect(row.action).toBe('auth.demo_login');
  });

  it('caps the list well below the query limit', async () => {
    overrides.audit_logs = {
      data: Array.from({ length: 120 }, (_, i) => demo(`3.3.3.${i % 10}`, hoursAgo(1))),
      error: null,
    };

    const res = await get();

    expect(res.body.recent).toHaveLength(50);
    expect(res.body.totals.demoOpensToday).toBe(120);
    expect(res.body.totals.demoVisitorsToday).toBe(10);
  });

  it('reports an empty window as zero rather than failing', async () => {
    overrides.audit_logs = { data: [], error: null };

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.totals.demoOpensToday).toBe(0);
    expect(res.body.recent).toEqual([]);
  });

  /* The panel renders "unknown, not zero" off a failed request, so the
     failure has to actually surface rather than arriving as an empty list. */
  it('fails loudly when the query errors', async () => {
    overrides.audit_logs = { data: null, error: { message: 'connection reset' } };

    const res = await get();

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });

  it('turns anonymous callers away', async () => {
    const res = await request(app).get('/api/platform/activity');
    expect(res.status).toBe(401);
  });
});
