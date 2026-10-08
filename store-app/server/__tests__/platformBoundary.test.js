/**
 * manage_platform is the platform operator's alone. Every self-service signup
 * is a Business Admin; until 8 October 2026 permissionCheck let them through
 * manage_platform routes (Paystack keys, plan assignment, platform settings
 * and messaging, the shared QR pool).
 */
const request = require('supertest');
const permissionCheck = require('../middleware/permissionCheck');

const run = (user, ...perms) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
  let passed = false;
  permissionCheck(...perms)({ user }, res, () => { passed = true; });
  return passed;
};

describe('permissionCheck', () => {
  const owner = { role: 'Business Admin', permissions: [] };
  test('a Business Admin never passes manage_platform', () => {
    expect(run(owner, 'manage_platform')).toBe(false);
    expect(run({ ...owner, permissions: ['manage_platform'] }, 'manage_platform')).toBe(false);
  });
  test('a Business Admin keeps every business permission, including mixed lists', () => {
    expect(run(owner, 'manage_inventory')).toBe(true);
    expect(run(owner, 'manage_platform', 'manage_financials')).toBe(true);
  });
  test('the platform operator passes everything; staff pass only what they hold', () => {
    expect(run({ role: 'Platform Admin' }, 'manage_platform')).toBe(true);
    expect(run({ role: 'Sales Executive', permissions: ['create_sales'] }, 'create_sales')).toBe(true);
    expect(run({ role: 'Sales Executive', permissions: ['create_sales'] }, 'manage_platform')).toBe(false);
  });
});

const mockUsers = {
  owner: { id: 'owner', name: 'Owner', email: 'o@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active' }, user_locations: [] },
};
let plan = {};
let writes = [];
function mockQuery(table) {
  const calls = [];
  const result = () => {
    if (table === 'users') return { data: mockUsers[calls.find(([m, c]) => m === 'eq' && c === 'id')?.[2]] || null, error: null };
    if (table === 'platform_plans') return { data: plan, error: null };
    return { data: null, error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(result()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      if (['insert', 'update', 'upsert', 'delete'].includes(prop)) return (payload) => { writes.push({ table, prop, payload }); return chain; };
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockQuery(t)), rpc: jest.fn(async () => ({ data: null, error: null })) } }));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (t) => ({ userId: t })) }));
const app = require('../index');
const AUTH = { Authorization: 'Bearer owner' };
const subscriptionWrites = () => writes.filter((w) => w.table === 'business_subscriptions');

describe('a Business Admin against platform routes', () => {
  beforeEach(() => { writes = []; plan = { id: 'p', is_active: true, price_monthly: 0, price_yearly: null, currency: 'GHS' }; });

  test.each([
    ['get', '/api/billing/gateways'], ['put', '/api/billing/gateways/x'], ['get', '/api/billing/invoices'],
    ['post', '/api/billing/record-payment'], ['put', '/api/platform/settings'], ['post', '/api/communications/send'],
    ['post', '/api/qrcodes/generate'], ['get', '/api/subscriptions'],
  ])('%s %s is refused', async (method, path) => {
    expect((await request(app)[method](path).set(AUTH).send({})).status).toBe(403);
  });

  test('cannot assign itself a plan at all; plans start through checkout', async () => {
    // The yearly plan's monthly price is 0: a "free plan" path here would
    // have activated QuadERP for nothing.
    plan = { ...plan, price_monthly: 0, price_yearly: 1000 };
    expect((await request(app).post('/api/subscriptions/assign').set(AUTH).send({ business_id: 'biz-A', plan_id: 'p' })).status).toBe(403);
    expect((await request(app).post('/api/subscriptions/assign').set(AUTH).send({ business_id: 'biz-A', plan_id: 'p', billing_cycle: 'monthly' })).status).toBe(403);
    expect((await request(app).post('/api/subscriptions/assign').set(AUTH).send({ business_id: 'biz-B', plan_id: 'p' })).status).toBe(403);
    expect(subscriptionWrites()).toHaveLength(0);
  });
});
