const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

/**
 * GET /api/ledger/pending
 *
 * This queue used to be fetched by the browser querying `business_ledger`
 * through the Supabase client directly, which meant no server-side role check
 * ran at all, it relied entirely on RLS. These tests exist to pin the gate
 * that replaced it, and specifically to keep its role list identical to
 * /:id/approve and /:id/reject: if the two ever drift, someone can see entries
 * they cannot act on, or act on entries they cannot see.
 */

const PENDING = [
  {
    id: 'led-1', type: 'expense', amount: 240, description: 'Generator fuel',
    status: 'pending', created_at: '2026-07-31T12:00:00.000Z', date: '2026-07-31',
    receipt_url: null, metadata: {},
    users: { name: 'Kofi Boateng', email: 'kofi@quaderp.com' },
    locations: { name: 'Main Branch' },
  },
];

// Mutated per-test so one describe can exercise several roles.
const currentUser = {
  id: 'user-uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  business_id: 'biz-uuid-123',
  status: 'active',
  role_id: 'role-uuid-123',
  roles: { name: 'Business Admin', permissions: ['manage_business'] },
  businesses: { status: 'active' },
  user_locations: [],
};

const mockSupabase = buildMockSupabase({});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' }),
}));

const app = require('../index');
const AUTH = { Authorization: 'Bearer valid-test-token' };

function asRole(roleName) {
  currentUser.roles = { ...currentUser.roles, name: roleName };
}

beforeEach(() => {
  jest.clearAllMocks();
  asRole('Business Admin');
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'users') return makeQueryMock({ data: currentUser, error: null });
    if (table === 'business_ledger') return makeQueryMock({ data: PENDING, error: null });
    return makeQueryMock({ data: [], error: null });
  });
});

describe('GET /api/ledger/pending', () => {
  it('returns the pending queue as a bare array', async () => {
    const res = await request(app).get('/api/ledger/pending').set(AUTH);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('led-1');
    // The page renders the submitter and branch, so the joins must survive.
    expect(res.body[0].users.name).toBe('Kofi Boateng');
    expect(res.body[0].locations.name).toBe('Main Branch');
  });

  // Same list as /:id/approve. Manager included deliberately, they approve.
  it.each(['Manager', 'Business Admin', 'Platform Admin'])('allows %s', async (roleName) => {
    asRole(roleName);
    const res = await request(app).get('/api/ledger/pending').set(AUTH);
    expect(res.status).toBe(200);
  });

  it.each(['Cashier', 'Sales', 'Accountant'])('rejects %s with 403', async (roleName) => {
    asRole(roleName);
    const res = await request(app).get('/api/ledger/pending').set(AUTH);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/ledger/pending');
    expect(res.status).toBe(401);
  });

  it('surfaces a 500 rather than leaking the driver error', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQueryMock({ data: currentUser, error: null });
      return makeQueryMock({ data: null, error: { message: 'invalid input syntax for type uuid' } });
    });

    const res = await request(app).get('/api/ledger/pending').set(AUTH);

    expect(res.status).toBe(500);
    // The raw Postgres string reaching the UI is the bug this route replaced.
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input syntax/);
  });
});
