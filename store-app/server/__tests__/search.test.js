/**
 * GET /api/search backs the command palette. Each kind of record is searched
 * only when the caller may open the page its result links to, and every query
 * carries the caller's business (and branch, where that page is branch-scoped).
 * Calls are recorded because the shared mock accepts any filter silently.
 */
const request = require('supertest');

const mockUsers = {
  admin: { id: 'admin', name: 'Admin', email: 'a@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active' }, user_locations: [] },
  cashier: { id: 'cashier', name: 'Cashier', email: 'c@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r2', roles: { name: 'Salesperson', permissions: ['view_sales', 'create_sales'] }, businesses: { status: 'active' }, user_locations: [{ location_id: 'loc-A' }] },
};
let log = [];
let rpcCalls = [];

function mockRecording(table) {
  const calls = [];
  log.push({ table, calls });
  const result = () => {
    if (table === 'users') {
      const id = calls.find(([m, col]) => m === 'eq' && col === 'id')?.[2];
      return { data: mockUsers[id] || null, error: null };
    }
    if (table === 'locations') return { data: { id: 'loc-A', business_id: 'biz-A' }, error: null };
    return { data: [], error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      // A list read of locations is the admin's branch list (authGuard).
      if (prop === 'then') return (resolve, reject) => Promise.resolve(table === 'locations' ? { data: [result().data], error: null } : result()).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}

jest.mock('../db/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn((t) => mockRecording(t)),
    rpc: jest.fn(async (name, args) => { mockRpc(name, args); return { data: [], error: null }; }),
  },
}));
function mockRpc(name, args) { rpcCalls.push([name, args]); }
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (token) => ({ userId: token })) }));

const app = require('../index');
const queried = () => [...new Set(log.map((q) => q.table))].filter((t) => !['users', 'locations', 'businesses'].includes(t));
const callsOn = (table) => log.filter((q) => q.table === table).map((q) => q.calls);
const search = (who, q) => request(app).get('/api/search?q=' + encodeURIComponent(q)).set({ Authorization: 'Bearer ' + who, 'X-Location-Id': 'loc-A' });

beforeEach(() => { log = []; rpcCalls = []; });

test('a cashier searches only receipts, in their own business and branch', async () => {
  const res = await search('cashier', 'RCPT-10');
  expect(res.status).toBe(200);
  expect(queried()).toEqual(['sales']);
  expect(rpcCalls.filter(([n]) => n === 'find_tracked_units')).toHaveLength(0);
  const [sales] = callsOn('sales');
  expect(sales).toContainEqual(['eq', 'business_id', 'biz-A']);
  expect(sales).toContainEqual(['eq', 'location_id', 'loc-A']);
});

test('an owner searches every kind, each scoped to the business', async () => {
  const res = await search('admin', 'QD-004821');
  expect(res.status).toBe(200);
  expect(queried().sort()).toEqual(['ar_invoices', 'customers', 'products', 'sales', 'suppliers']);
  for (const table of queried()) expect(callsOn(table)[0]).toContainEqual(['eq', 'business_id', 'biz-A']);
  expect(rpcCalls).toContainEqual(['find_tracked_units', { p_business_id: 'biz-A', p_location_id: 'loc-A', p_code: 'QD-004821' }]);
});

test('search text cannot add PostgREST clauses, and short queries do nothing', async () => {
  await search('admin', 'ab,id.neq.0');
  const orClauses = callsOn('products')[0].filter(([m]) => m === 'or').map(([, arg]) => arg).join(',').split(',');
  expect(orClauses.every((c) => /^(name|sku)\.ilike\./.test(c))).toBe(true);
  log = [];
  const res = await search('admin', 'a');
  expect(res.body).toEqual({ results: [] });
  expect(queried()).toEqual([]);
});
