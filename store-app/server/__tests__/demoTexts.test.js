/**
 * The public demo must not send text messages.
 *
 * Anyone can open the demo without an account. Until 2026-10-25, adding a
 * customer there texted a verification code to whatever number was typed,
 * anywhere in the world, from our Arkesel account, with the typed name in the
 * message: the same relay the signup form was used as on 2026-10-24, paid for
 * per message. A real shop must still send codes, so each demo case has a
 * real-shop counterpart.
 */
const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const baseUser = {
  name: 'Test User',
  email: 'owner@example.com',
  status: 'active',
  role_id: 'role-1',
  roles: { name: 'Business Admin', permissions: ['create_sales'] },
  user_locations: [],
};
const DEMO_USER = { ...baseUser, id: 'demo-user', business_id: 'biz-demo', businesses: { status: 'active', is_demo: true } };
const REAL_USER = { ...baseUser, id: 'real-user', business_id: 'biz-real', businesses: { status: 'active', is_demo: false } };

const mockSupabase = buildMockSupabase();
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
// authGuard caches users by id, so each token maps to its own id.
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn((token) => Promise.resolve({ userId: token === 'demo-token' ? 'demo-user' : 'real-user' })),
}));

const app = require('../index');

const DEMO = { Authorization: 'Bearer demo-token' };
const REAL = { Authorization: 'Bearer real-token' };

let mutations;
let realFetch;

/** Answer as `user`, with `customer` as the row any customers query returns. */
function actAs(user, customer) {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'users') return makeQueryMock({ data: user, error: null });
    if (table === 'customers') {
      return makeQueryMock({ data: customer, error: null }, (op, payload) => mutations.push({ op, payload }));
    }
    return makeQueryMock({ data: [], error: null, count: 0 });
  });
}

const textsSent = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('arkesel')).length;
const insertedRow = () => {
  const insert = mutations.find((m) => m.op === 'insert');
  return Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
};

beforeAll(() => {
  realFetch = global.fetch;
  process.env.ARKESEL_API_KEY = 'test-key';
});

afterAll(() => {
  global.fetch = realFetch;
  delete process.env.ARKESEL_API_KEY;
});

beforeEach(() => {
  mutations = [];
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) });
});

describe('adding a customer', () => {
  it('in the demo, texts nobody and marks the customer verified', async () => {
    actAs(DEMO_USER, { id: 'cust-new', business_id: 'biz-demo', name: 'Ama', phone: '+233241234567', is_verified: true });

    const res = await request(app).post('/api/customers').set(DEMO).send({ name: 'Ama', phone: '0241234567' });

    expect(res.status).toBe(201);
    expect(textsSent()).toBe(0);
    expect(insertedRow()).toMatchObject({ is_verified: true, verification_code: null, otp_expires_at: null });
    expect(res.body.message).toMatch(/switched off in the demo/i);
  });

  it('in a real shop, still texts the code', async () => {
    actAs(REAL_USER, { id: 'cust-new', business_id: 'biz-real', name: 'Ama', phone: '+233241234567', is_verified: false });

    const res = await request(app).post('/api/customers').set(REAL).send({ name: 'Ama', phone: '0241234567' });

    expect(res.status).toBe(201);
    expect(textsSent()).toBe(1);
    expect(insertedRow()).toMatchObject({ is_verified: false });
    expect(insertedRow().verification_code).toEqual(expect.any(String));
  });
});

describe('resending a verification code', () => {
  const customer = (businessId) => ({
    id: 'cust-1', business_id: businessId, name: 'Ama', phone: '+233241234567',
    verification_code: null, otp_expires_at: null,
  });

  it('is refused in the demo before anything is looked up or sent', async () => {
    actAs(DEMO_USER, customer('biz-demo'));

    const res = await request(app).post('/api/customers/cust-1/send-verification').set(DEMO).send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_READ_ONLY');
    expect(textsSent()).toBe(0);
  });

  it('still sends for a real shop', async () => {
    actAs(REAL_USER, customer('biz-real'));

    const res = await request(app).post('/api/customers/cust-1/send-verification').set(REAL).send({});

    expect(res.body.code).not.toBe('DEMO_READ_ONLY');
    expect(textsSent()).toBe(1);
  });
});
