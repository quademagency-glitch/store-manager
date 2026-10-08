/**
 * Lookups that must stay inside the caller's business.
 *
 * The shared mock accepts any filter silently, so a route that forgets
 * `.eq('business_id', …)` passes it. Here every chained call is recorded and
 * the test asserts the filters the route actually applied.
 *
 * - GET /api/units/lookup searched the shared label pool and then fetched the
 *   unit by label alone, returning another tenant's product, price and branch.
 * - GET /api/customers/search interpolated raw input into a PostgREST `.or()`,
 *   so a role limited to phone search could add a name clause.
 */
const request = require('supertest');

const USERS = {
  'admin-user': { id: 'admin-user', name: 'Admin', email: 'a@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active' }, user_locations: [] },
  'staff-user': { id: 'staff-user', name: 'Staff', email: 's@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r2', roles: { name: 'Salesperson', permissions: ['view_sales', 'create_sales'] }, businesses: { status: 'active' }, user_locations: [] },
};

let log = [];
let results = {};

function mockRecording(table) {
  const calls = [];
  log.push({ table, calls });
  const result = () => {
    if (table === 'users') {
      const id = calls.find(([m, col]) => m === 'eq' && col === 'id')?.[2];
      return { data: USERS[id] || null, error: null };
    }
    return results[table] || { data: [], error: null };
  };
  const chain = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}

jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockRecording(t)), rpc: jest.fn(async () => ({ data: null, error: null })) } }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn(async (token) => ({ userId: token === 'staff' ? 'staff-user' : 'admin-user' })),
}));

const app = require('../index');
const callsOn = (table) => log.filter((q) => q.table === table).map((q) => q.calls);

beforeEach(() => { log = []; results = {}; });

describe('GET /api/units/lookup', () => {
  it('fetches the unit only within the caller\'s business', async () => {
    results.qr_code_pool = { data: { id: 'qr-1', code: 'ABC123', status: 'assigned' }, error: null };
    results.inventory_units = { data: null, error: null };
    const res = await request(app).get('/api/units/lookup?qr=abc123').set({ Authorization: 'Bearer admin' });
    expect(res.status).toBe(404);
    const [unitQuery] = callsOn('inventory_units');
    expect(unitQuery).toContainEqual(['eq', 'qr_code_id', 'qr-1']);
    expect(unitQuery).toContainEqual(['eq', 'business_id', 'biz-A']);
  });
});

describe('GET /api/customers/search', () => {
  const orArgs = () => callsOn('customers').flat().filter(([m]) => m === 'or').map(([, arg]) => arg);

  it('keeps PostgREST grammar out of a phone-only search', async () => {
    const res = await request(app)
      .get('/api/customers/search?q=' + encodeURIComponent('0241,name.ilike.%Ama%'))
      .set({ Authorization: 'Bearer staff' });
    expect(res.status).toBe(200);
    const clauses = orArgs().flatMap((arg) => arg.split(','));
    expect(clauses.every((c) => c.startsWith('phone.'))).toBe(true);
    expect(clauses.join(',')).not.toMatch(/name\.ilike/);
  });

  it('still lets an admin find a name containing punctuation', async () => {
    const res = await request(app).get('/api/customers/search?q=' + encodeURIComponent('St. John')).set({ Authorization: 'Bearer admin' });
    expect(res.status).toBe(200);
    expect(orArgs()[0]).toContain('name.ilike.%St_ John%');
  });
});
