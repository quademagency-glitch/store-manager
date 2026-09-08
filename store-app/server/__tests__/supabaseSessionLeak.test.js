/**
 * Password sign-in must never happen on the shared admin client.
 *
 * supabase-js decides a request's identity in SupabaseClient._getAccessToken:
 *
 *     if (this.accessToken) return await this.accessToken();
 *     const { data } = await this.auth.getSession();
 *     return data.session?.access_token ?? this.supabaseKey;
 *
 * so a client that holds a session sends that user's JWT on every PostgREST
 * request instead of the service key, for the life of the process.
 * `persistSession: false` does not prevent it; it stops the session reaching
 * storage, not memory.
 *
 * That ran in production from 2026-08-20. /auth/login and /auth/demo-login
 * both signed in on supabaseAdmin, so any worker that had served a login was
 * afterwards querying as that user. audit_logs grants INSERT to service_role
 * only, so the security audit trail took one row in three weeks while every
 * page appeared to work. Eight workers made it look intermittent.
 *
 * These tests give the two clients separate mocks, which is the only way to
 * see the difference: if someone moves a signInWithPassword back onto
 * supabaseAdmin, the second assertion in each test fails.
 */
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const adminUser = {
  id: 'demo-user-1',
  name: 'Demo Owner',
  email: 'demo@quaderp.app',
  status: 'active',
  role_id: 'role-1',
  business_id: 'biz-demo-1',
  roles: { name: 'Business Admin', permissions: ['view_sales'] },
  businesses: { name: 'Adom Superstore', is_demo: true, status: 'active' },
  user_locations: [],
};

const mockAdmin = buildMockSupabase({ users: { data: adminUser, error: null } });
const mockSignIn = buildMockSupabase({ users: { data: adminUser, error: null } });

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockAdmin, supabaseSignIn: mockSignIn }));
jest.mock('../config/demo', () => ({
  DEMO_EMAIL: 'demo@quaderp.app',
  DEMO_PASSWORD: 'test-password',
  isDemoEnabled: () => true,
}));

const app = require('../index');

beforeEach(() => {
  mockAdmin.auth.signInWithPassword.mockClear();
  mockSignIn.auth.signInWithPassword.mockClear();
});

describe('password sign-in stays off the admin client', () => {
  it('demo-login signs in on the sign-in client, not the admin one', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({});

    expect(res.status).toBe(200);
    expect(mockSignIn.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mockAdmin.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('login signs in on the sign-in client, not the admin one', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@quaderp.app', password: 'test-password' });

    expect(mockSignIn.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mockAdmin.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  /* The reason the split works at all. If anything ever reads data through
     the sign-in client, a held session starts deciding what that read
     returns, and the separation stops being worth anything. */
  it('never reads data through the sign-in client', async () => {
    await request(app).post('/api/auth/demo-login').send({});

    expect(mockSignIn.from).not.toHaveBeenCalled();
    expect(mockAdmin.from).toHaveBeenCalled();
  });
});
