/**
 * Private receipt links: staff create them only for completed sales in their
 * scope, only a hash of the token is stored, and the public view is minimal,
 * uncached and identical for every kind of failure.
 */
const request = require('supertest');
const crypto = require('node:crypto');

const mockUsers = {
  cashier: { id: 'cashier', name: 'Cashier', email: 'c@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r2', roles: { name: 'Sales Executive', permissions: ['create_sales', 'view_sales'] }, businesses: { status: 'active' }, user_locations: [{ location_id: 'loc-A' }] },
  stock: { id: 'stock', name: 'Stock', email: 's@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r3', roles: { name: 'Stock Clerk', permissions: ['view_inventory'] }, businesses: { status: 'active' }, user_locations: [{ location_id: 'loc-A' }] },
};
let log = [];
let results = {};
let rpcResult = { data: null, error: null };

function mockRecording(table) {
  const calls = [];
  log.push({ table, calls });
  const result = () => {
    if (table === 'users') {
      const id = calls.find(([m, col]) => m === 'eq' && col === 'id')?.[2];
      return { data: mockUsers[id] || null, error: null };
    }
    if (table === 'locations') return { data: { id: 'loc-A', business_id: 'biz-A', currency: 'GHS' }, error: null };
    return results[table] || { data: null, error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({
  supabaseAdmin: { from: jest.fn((t) => mockRecording(t)), rpc: jest.fn(async () => mockRpcResult()) },
}));
function mockRpcResult() { return rpcResult; }
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (token) => ({ userId: token })) }));

const app = require('../index');
const callsOn = (table) => log.filter((q) => q.table === table).map((q) => q.calls);
const SALE = '11111111-2222-4333-8444-555555555555';
const create = (who, body) => request(app).post('/api/receipt-links').set({ Authorization: 'Bearer ' + who, 'X-Location-Id': 'loc-A' }).send(body);

beforeEach(() => { log = []; results = {}; rpcResult = { data: null, error: null }; });

test('a cashier creates a link for a completed sale in their branch; only a hash is stored', async () => {
  results.sales = { data: { id: SALE, business_id: 'biz-A', location_id: 'loc-A', status: 'completed' }, error: null };
  results.receipt_links = { data: null, error: null };
  const res = await create('cashier', { sale_id: SALE });
  expect(res.status).toBe(201);
  expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  const [saleQuery] = callsOn('sales');
  expect(saleQuery).toContainEqual(['eq', 'business_id', 'biz-A']);
  expect(saleQuery).toContainEqual(['eq', 'location_id', 'loc-A']);
  const insert = callsOn('receipt_links')[0].find(([m]) => m === 'insert')[1];
  expect(insert.token_hash).toBe(crypto.createHash('sha256').update(res.body.token).digest('hex'));
  expect(JSON.stringify(insert)).not.toContain(res.body.token);
  const days = (new Date(insert.expires_at) - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
});

test('links need sales permission, a sale in scope, and a completed sale', async () => {
  expect((await create('stock', { sale_id: SALE })).status).toBe(403);
  expect((await create('cashier', { sale_id: 'not-a-uuid' })).status).toBe(400);
  results.sales = { data: null, error: null };
  expect((await create('cashier', { sale_id: SALE })).status).toBe(404);
  results.sales = { data: { id: SALE, business_id: 'biz-A', location_id: 'loc-A', status: 'pending' }, error: null };
  expect((await create('cashier', { sale_id: SALE })).status).toBe(409);
  expect(callsOn('receipt_links')).toHaveLength(0);
});

describe('GET /api/public/receipts/:token', () => {
  const token = 'A'.repeat(32);
  const view = (t) => request(app).get('/api/public/receipts/' + t);

  test('a malformed token is refused without touching the database', async () => {
    const res = await view('short');
    expect(res.status).toBe(404);
    expect(callsOn('receipt_links')).toHaveLength(0);
  });

  test('an unknown, expired or withdrawn token gets the same answer', async () => {
    const res = await view(token);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('This receipt link has expired or was withdrawn.');
    const [lookup] = callsOn('receipt_links');
    expect(lookup).toContainEqual(['eq', 'token_hash', crypto.createHash('sha256').update(token).digest('hex')]);
    expect(lookup).toContainEqual(['is', 'revoked_at', null]);
    expect(lookup.some(([m, col]) => m === 'gt' && col === 'expires_at')).toBe(true);
  });

  test('a live link shows lines and totals only, uncached and unindexed', async () => {
    results.receipt_links = { data: { id: 'l1', business_id: 'biz-A', sale_id: SALE, expires_at: '2099-01-01T00:00:00Z', view_count: 0 }, error: null };
    results.businesses = { data: { name: 'Omek Test Shop', phone: '+233200000000' }, error: null };
    rpcResult = { data: {
      business_id: 'biz-A', location_id: 'loc-A', receipt_number: 'R-1', created_at: '2026-10-08T10:00:00Z', status: 'completed',
      payment_method: 'mobile', subtotal: 30, tax_amount: 0, total_amount: 30, amount_paid: 30, change_due: 0,
      customer: { id: 'c1', name: 'Ama Mensah', phone: '+233241234567' }, salesperson: { id: 'u1', name: 'Kofi' },
      sale_items: [{ quantity: 1, unit_price: 30, product: { id: 'p1', name: 'LG TV', sku: 'LG' } }],
    }, error: null };
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
    expect(res.body.receipt.items).toEqual([{ name: 'LG TV', quantity: 1, unit_price: 30 }]);
    expect(JSON.stringify(res.body)).not.toMatch(/Ama Mensah|241234567|Kofi|"c1"|"u1"/);
  });

  test("a link never shows another business's sale", async () => {
    results.receipt_links = { data: { id: 'l1', business_id: 'biz-A', sale_id: SALE, expires_at: '2099-01-01T00:00:00Z', view_count: 0 }, error: null };
    results.businesses = { data: { name: 'Shop', phone: null }, error: null };
    rpcResult = { data: { business_id: 'biz-B', receipt_number: 'R-9', sale_items: [] }, error: null };
    expect((await view(token)).status).toBe(404);
  });
});
