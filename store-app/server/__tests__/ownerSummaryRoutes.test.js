/**
 * The summary covers every branch's money: only owners (or roles with
 * manage_business) can switch it on or preview it, and a switch changes only
 * the caller's own setting.
 */
const request = require('supertest');

const mockUsers = {
  owner: { id: 'owner', name: 'Owner', email: 'o@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active' }, user_locations: [], daily_summary_email: false },
  cashier: { id: 'cashier', name: 'Cashier', email: 'c@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r2', roles: { name: 'Sales Executive', permissions: ['create_sales', 'view_sales'] }, businesses: { status: 'active' }, user_locations: [{ location_id: 'loc-A' }], daily_summary_email: false },
};
let log = [];
function mockRecording(table) {
  const calls = [];
  log.push({ table, calls });
  const result = () => (table === 'users' ? { data: mockUsers[calls.find(([m, c]) => m === 'eq' && c === 'id')?.[2]] || null, error: null }
    : table === 'locations' ? { data: [{ id: 'loc-A' }], error: null } // the owner's branches (authGuard)
      : { data: null, error: null });
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(result()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockRecording(t)), rpc: jest.fn(async () => ({ data: null, error: null })) } }));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (t) => ({ userId: t })) }));
jest.mock('../services/ownerSummary', () => ({ ...jest.requireActual('../services/ownerSummary'), buildSummary: jest.fn(async () => ({ sales: { net: 0 } })), initOwnerSummaryCron: () => ({ stop() {} }) }));

const app = require('../index');
const as = (who) => ({ Authorization: 'Bearer ' + who, 'X-Location-Id': 'loc-A' });
const userUpdates = () => log.filter((q) => q.table === 'users').map((q) => q.calls).filter((c) => c.some(([m]) => m === 'update'));

beforeEach(() => { log = []; });

test('a cashier can neither switch the summary on nor preview it', async () => {
  const res = await request(app).put('/api/owner-summary').set(as('cashier')).send({ enabled: true });
  expect(res.status).toBe(403);
  expect(userUpdates()).toHaveLength(0);
  expect((await request(app).get('/api/owner-summary/preview').set(as('cashier'))).status).toBe(403);
  expect((await request(app).get('/api/owner-summary').set(as('cashier'))).body).toEqual({ enabled: false, eligible: false });
});

test("an owner's switch changes only their own setting", async () => {
  const res = await request(app).put('/api/owner-summary').set(as('owner')).send({ enabled: true });
  expect(res.status).toBe(200);
  const [update] = userUpdates();
  expect(update).toContainEqual(['update', { daily_summary_email: true }]);
  expect(update).toContainEqual(['eq', 'id', 'owner']);
  expect((await request(app).get('/api/owner-summary/preview').set(as('owner'))).status).toBe(200);
  expect((await request(app).put('/api/owner-summary').set(as('owner')).send({ enabled: 'yes' })).status).toBe(400);
});
