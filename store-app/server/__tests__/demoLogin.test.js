/**
 * POST /api/auth/demo-login
 *
 * This is the one endpoint on the API that hands back a real Supabase session
 * to an unauthenticated caller, so its guards are the whole point of it. The
 * route also now returns the caller's business, demo flag and locations, which
 * the client trusts instead of re-querying, that payload is asserted here so
 * a field cannot be dropped without a test noticing.
 */
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

let mockSupabase = buildMockSupabase();
let mockDemoEnabled = true;

/* supabaseSignIn is the same mock here on purpose: these suites assert on
   the sign-in call itself, not on which client made it. The separation
   between the two is what supabaseSessionLeak.test.js exists to prove. */
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase, supabaseSignIn: mockSupabase }));
jest.mock('../config/demo', () => ({
  DEMO_EMAIL: 'demo@quaderp.app',
  DEMO_PASSWORD: 'test-password',
  isDemoEnabled: () => mockDemoEnabled,
}));

const app = require('../index');

/** A seeded demo account: demo business, active, with two locations. */
const demoRow = {
  id: 'demo-user-1',
  name: 'Demo Owner',
  email: 'demo@quaderp.app',
  status: 'active',
  role_id: 'role-1',
  business_id: 'biz-demo-1',
  roles: { name: 'Business Admin', permissions: ['view_sales', 'manage_inventory'] },
  businesses: { name: 'Adom Superstore', is_demo: true, status: 'active' },
  user_locations: [{ location_id: 'loc-1' }, { location_id: 'loc-2' }],
};

function useUserRow(row) {
  const fresh = buildMockSupabase({ users: { data: row, error: null } });
  // The route holds a reference from module load, so patch in place.
  Object.assign(mockSupabase, fresh);
}

beforeEach(() => {
  mockDemoEnabled = true;
  useUserRow(demoRow);
});

describe('POST /api/auth/demo-login', () => {
  it('is invisible when the demo is not enabled for this environment', async () => {
    mockDemoEnabled = false;
    const res = await request(app).post('/api/auth/demo-login').send({});
    expect(res.status).toBe(404);
  });

  it('returns a session plus everything the client needs to boot', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({});

    expect(res.status).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.session.access_token).toBeTruthy();
    expect(res.body.session.refresh_token).toBeTruthy();

    // The fields the client reads instead of issuing a second query. Losing
    // any of these silently reintroduces that round trip, or worse, boots the
    // demo with no permissions.
    expect(res.body.user).toMatchObject({
      id: 'demo-user-1',
      role: 'Business Admin',
      permissions: ['view_sales', 'manage_inventory'],
      business_id: 'biz-demo-1',
      is_demo: true,
      location_ids: ['loc-1', 'loc-2'],
    });
  });

  it('refuses an account that is not attached to a demo business', async () => {
    // Without this guard, pointing DEMO_ACCOUNT_EMAIL at a real account turns
    // a public endpoint into a way to sign in as them.
    useUserRow({ ...demoRow, businesses: { name: 'Real Shop', is_demo: false, status: 'active' } });
    const res = await request(app).post('/api/auth/demo-login').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Demo unavailable');
  });

  it('refuses a banned demo user', async () => {
    useUserRow({ ...demoRow, status: 'banned' });
    const res = await request(app).post('/api/auth/demo-login').send({});
    expect(res.status).toBe(503);
  });

  it('refuses a banned demo business', async () => {
    useUserRow({ ...demoRow, businesses: { ...demoRow.businesses, status: 'banned' } });
    const res = await request(app).post('/api/auth/demo-login').send({});
    expect(res.status).toBe(503);
  });

  it('never leaks the demo password back to the caller', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({});
    expect(JSON.stringify(res.body)).not.toContain('test-password');
  });
});

/* The user agents are copied from the demo opens recorded in October 2026.
   /login?demo=1 starts the demo on page load, so crawlers following the
   "Try Live Demo" link were opening it: 19 of the 21 on 2026-10-22 were
   Meta's link checker. */
describe('POST /api/auth/demo-login, automated browsers', () => {
  it.each([
    ["Meta's link checker", 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36'],
    ['Applebot', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'],
    ["Exa's crawler", 'Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)'],
  ])('turns away %s without signing in', async (_, userAgent) => {
    const res = await request(app).post('/api/auth/demo-login').set('User-Agent', userAgent).send({});
    expect(res.status).toBe(403);
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    ['Chrome on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'],
    ['the Google app on an iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/441.5.989047059 Mobile/15E148 Safari/604.1'],
    // "bot" without a version after it: a phone brand, not a crawler.
    ['a Cubot phone', 'Mozilla/5.0 (Linux; Android 10; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'],
  ])('lets in %s', async (_, userAgent) => {
    const res = await request(app).post('/api/auth/demo-login').set('User-Agent', userAgent).send({});
    expect(res.status).toBe(200);
  });
});

/**
 * The demo tenant is deleted and rebuilt nightly, and the teardown sweeps
 * `DELETE FROM <table> WHERE business_id = $1` across every table carrying a
 * business_id, audit_logs included. Attaching the demo business to this row
 * therefore deleted the record of the visit every night at 02:00, so the
 * Platform Admin panel that counts demo opens could never hold more than a
 * day. Checked on 2026-09-12: two opens recorded on the 8th had gone.
 */
describe('demo-login audit actor', () => {
  const { demoAuditActor } = require('../routes/auth');

  const userData = {
    id: 'demo-user-1',
    email: 'demo@quaderp.app',
    business_id: 'biz-demo-1',
    roles: { name: 'Business Admin' },
  };

  it('carries no business, so the nightly teardown cannot sweep the row', () => {
    expect(demoAuditActor(userData).business_id).toBeNull();
  });

  it('still names who and what, which is the part worth keeping', () => {
    const actor = demoAuditActor(userData);
    expect(actor.id).toBe('demo-user-1');
    expect(actor.email).toBe('demo@quaderp.app');
    expect(actor.role).toBe('Business Admin');
  });

  it('falls back to Demo when the account has no role attached', () => {
    expect(demoAuditActor({ ...userData, roles: null }).role).toBe('Demo');
  });
});
