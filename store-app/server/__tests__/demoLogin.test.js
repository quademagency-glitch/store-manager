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

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
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
