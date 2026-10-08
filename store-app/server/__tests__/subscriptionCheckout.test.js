/**
 * Paying for QuadERP (since 8 October 2026): one plan, no free trial. A new
 * business is 'unpaid' and narrowed to billing until it pays its setup fee
 * and first year; checkout amounts are the server's; a Paystack payment is
 * applied only if it covers what its metadata claims to buy.
 */
const request = require('supertest');

const PLAN = { id: 'plan-q', name: 'QuadERP', is_active: true, currency: 'GHS', price_yearly: 1000, setup_fee: 1000, price_per_extra_location: 200, sort_order: 1 };
const mockUsers = {
  owner: { id: 'owner', name: 'Owner', email: 'owner@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'unpaid' }, user_locations: [] },
  platform: { id: 'platform', name: 'Ops', email: 'ops@example.invalid', business_id: 'biz-P', status: 'active', role_id: 'r0', roles: { name: 'Platform Admin', permissions: ['manage_platform'] }, businesses: { status: 'active' }, user_locations: [] },
};
let results = {};
let mockRpcCalls = [];

function mockRecording(table) {
  const calls = [];
  const result = () => {
    if (table === 'users') return { data: mockUsers[calls.find(([m, c]) => m === 'eq' && c === 'id')?.[2]] || null, error: null };
    const r = results[table];
    return typeof r === 'function' ? r(calls) : r || { data: null, error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(result()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn((t) => mockRecording(t)),
    rpc: jest.fn(async (name, args) => { mockRpcCalls.push([name, args]); return { data: { already_applied: false, invoice_id: 'inv-1', paid_locations: 1 }, error: null }; }),
  },
}));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (t) => ({ userId: t })) }));
jest.mock('../services/paystack', () => ({ ...jest.requireActual('../services/paystack'), resolvePaystackGateway: jest.fn(async () => ({ gateway: { id: 'gw', secret_key: 'sk_test_x' } })) }));

const app = require('../index');
const as = (who) => ({ Authorization: `Bearer ${who}` });
const realFetch = global.fetch;

beforeEach(() => {
  mockRpcCalls = [];
  mockUsers.owner.businesses = { status: 'unpaid' };
  results = {
    businesses: { data: { id: 'biz-A', name: 'Acme', status: 'unpaid', is_demo: false, paid_locations: 1, subscription_plan_id: PLAN.id }, error: null },
    platform_plans: { data: PLAN, error: null },
    billing_invoices: { count: 0, error: null },
    business_subscriptions: { data: null, error: null },
    locations: { data: [], count: 0, error: null },
  };
  global.fetch = jest.fn();
});
afterAll(() => { global.fetch = realFetch; });

describe('before the first payment', () => {
  test('the app is closed except billing, with a reason the client can act on', async () => {
    const res = await request(app).get('/api/products').set(as('owner'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYMENT_REQUIRED');
    expect((await request(app).get('/api/subscriptions/mine').set(as('owner'))).status).toBe(200);
  });

  test('billing offers exactly one thing: start, GHS 2,000 for one branch', async () => {
    const res = await request(app).get('/api/subscriptions/mine').set(as('owner'));
    expect(res.body.status).toBe('unpaid');
    expect(res.body.offers.start).toMatchObject({ kind: 'start', branches: 1, amount: 2000 });
    expect(res.body.offers.renew).toBeNull();
    expect(res.body.offers.branch).toBeNull();
    expect(res.body.plan).toMatchObject({ price_yearly: 1000, setup_fee: 1000, price_per_extra_location: 200 });
  });

  test('checkout charges the server\'s amount and says what it buys', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'a', reference: 'ref-1' } }) });
    const res = await request(app).post('/api/subscriptions/initialize-paystack').set(as('owner')).send({ kind: 'start', branches: 2, amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(2200);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.amount).toBe(220000); // pesewas
    expect(body.metadata).toMatchObject({ business_id: 'biz-A', plan_id: PLAN.id, kind: 'start', branches: 2 });
  });

  test('cannot renew or buy branches before starting', async () => {
    expect((await request(app).post('/api/subscriptions/initialize-paystack').set(as('owner')).send({ kind: 'renew' })).status).toBe(400);
    expect((await request(app).post('/api/subscriptions/initialize-paystack').set(as('owner')).send({ kind: 'branches', branches: 1 })).status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('verifying a payment', () => {
  const paystackSays = (amount, metadata) => global.fetch.mockResolvedValue({
    json: async () => ({ status: true, data: { status: 'success', amount, currency: 'GHS', reference: 'ref-1', channel: 'card', metadata } }),
  });

  test('a payment that covers what it buys is applied once, by the database', async () => {
    paystackSays(200000, { business_id: 'biz-A', plan_id: PLAN.id, kind: 'start', branches: 1 });
    const res = await request(app).post('/api/subscriptions/verify-paystack').set(as('owner')).send({ reference: 'ref-1' });
    expect(res.status).toBe(200);
    expect(mockRpcCalls).toEqual([['apply_subscription_payment', expect.objectContaining({
      p_business_id: 'biz-A', p_plan_id: PLAN.id, p_kind: 'start', p_branches: 1, p_amount: 2000, p_reference: 'ref-1',
    })]]);
  });

  test('less than the price, or more branches than were paid for, grants nothing', async () => {
    paystackSays(150000, { business_id: 'biz-A', plan_id: PLAN.id, kind: 'start', branches: 1 });
    expect((await request(app).post('/api/subscriptions/verify-paystack').set(as('owner')).send({ reference: 'ref-1' })).status).toBe(400);
    paystackSays(20000, { business_id: 'biz-A', plan_id: PLAN.id, kind: 'branches', branches: 3 });
    expect((await request(app).post('/api/subscriptions/verify-paystack').set(as('owner')).send({ reference: 'ref-1' })).status).toBe(400);
    expect(mockRpcCalls).toHaveLength(0);
  });

  test("another business's payment is refused", async () => {
    paystackSays(200000, { business_id: 'biz-B', plan_id: PLAN.id, kind: 'start', branches: 1 });
    expect((await request(app).post('/api/subscriptions/verify-paystack').set(as('owner')).send({ reference: 'ref-1' })).status).toBe(403);
    expect(mockRpcCalls).toHaveLength(0);
  });
});

describe('after paying', () => {
  beforeEach(() => {
    mockUsers.owner.businesses = { status: 'active' };
    results.businesses = { data: { id: 'biz-A', name: 'Acme', status: 'active', is_demo: false, paid_locations: 3, subscription_plan_id: PLAN.id }, error: null };
    results.billing_invoices = { count: 1, error: null };
  });

  test('billing offers a renewal for every branch paid for, and branches at GHS 200 each', async () => {
    const res = await request(app).get('/api/subscriptions/mine').set(as('owner'));
    expect(res.body.offers.start).toBeNull();
    expect(res.body.offers.renew).toMatchObject({ amount: 1400, branches: 3 });
    expect(res.body.offers.branch).toMatchObject({ amount: 200, branches: 1 });
  });

  test('a Platform Admin records a payment taken outside checkout through the same path', async () => {
    const res = await request(app).post('/api/billing/record-payment').set(as('platform'))
      .send({ business_id: 'biz-A', kind: 'branches', branches: 2, amount: 400, payment_method: 'mobile_money' });
    expect(res.status).toBe(201);
    expect(mockRpcCalls[0]).toEqual(['apply_subscription_payment', expect.objectContaining({ p_kind: 'branches', p_branches: 2, p_amount: 400, p_channel: 'mobile_money' })]);
    expect(mockRpcCalls[0][1].p_reference).toMatch(/^manual-/);
  });
});
