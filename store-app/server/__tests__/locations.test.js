const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

/**
 * The location limit is the only thing the price list actually sells.
 *
 * platform_plans.max_locations was set, displayed to the customer on the
 * billing screen, and read by nothing, so a Single Branch account could open
 * as many shops as it liked and pay for one. These tests exist so that cannot
 * quietly become true again: the allowance is enforced, the three ways it is
 * deliberately not enforced stay deliberate, and a refusal is distinguishable
 * from a permission error.
 *
 * One app, one mock, results swapped per test. buildMockSupabase reads its
 * overrides object on every `from()` rather than copying it, so mutating the
 * object is enough. Re-requiring index.js per case also works but builds a
 * fresh express app and rate limiter each time, and seven of those trips
 * Node's max-listeners warning.
 */
const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const app = require('../index');

// Since 8 October 2026 the limit is the branches the business has paid for.
const PAID = (paid_locations, extra = {}) => ({
  data: { paid_locations, is_demo: false, platform_plans: { price_per_extra_location: 200, currency: 'GHS' }, ...extra },
  error: null,
});
const PLAN = () => ({ data: null, error: null });
const ON_A_PLAN = PAID(1);

function given({ businesses, platform_plans, locations }) {
  overrides.businesses = businesses;
  overrides.platform_plans = platform_plans;
  overrides.locations = locations;
}

const addShop = () =>
  request(app)
    .post('/api/locations')
    .set('Authorization', 'Bearer valid-test-token')
    .send({ name: 'Kumasi Branch' });

beforeEach(() => {
  mock.mutations.length = 0;
  for (const k of Object.keys(overrides)) delete overrides[k];
});

describe('POST /api/locations, plan allowance', () => {
  it('refuses with 402 once the allowance is used up, and writes nothing', async () => {
    given({
      businesses: PAID(1),
      platform_plans: PLAN(),
      locations: { data: [], error: null, count: 1 },
    });
    const res = await addShop();
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('LOCATION_LIMIT_REACHED');
    expect(res.body.limit).toBe(1);
    expect(res.body.used).toBe(1);
    expect(res.body.price_per_branch).toBe(200);
    // The message is what the shop owner reads, so it names real numbers.
    expect(res.body.message).toContain('covers 1 branch');
    expect(res.body.message).toContain('GHS 200 a year');
    expect(mock.mutations.filter((m) => m.table === 'locations')).toHaveLength(0);
  });

  it('allows the create while the business is under the branches it paid for', async () => {
    given({
      businesses: PAID(3),
      platform_plans: PLAN(),
      locations: { data: { id: 'loc-9', name: 'Kumasi Branch' }, error: null, count: 2 },
    });
    const res = await addShop();
    expect(res.status).toBe(201);
    expect(mock.mutations.some((m) => m.table === 'locations' && m.op === 'insert')).toBe(true);
  });

  it('does not limit the public demo', async () => {
    given({
      businesses: PAID(1, { is_demo: true }),
      platform_plans: PLAN(),
      locations: { data: { id: 'loc-9' }, error: null, count: 6 },
    });
    expect((await addShop()).status).toBe(201);
  });

  it('allows the create when the plan lookup itself fails', async () => {
    // A commercial limit must not become an outage for a paying customer.
    given({
      businesses: { data: null, error: { message: 'db down' } },
      platform_plans: PLAN(),
      locations: { data: { id: 'loc-9' }, error: null, count: 40 },
    });
    expect((await addShop()).status).toBe(201);
  });

  it('rejects an unauthenticated caller before any of this', async () => {
    given({ businesses: ON_A_PLAN, platform_plans: PLAN(), locations: { data: [], error: null, count: 5 } });
    const res = await request(app).post('/api/locations').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('still requires a name', async () => {
    given({
      businesses: ON_A_PLAN,
      platform_plans: PLAN(5),
      locations: { data: [], error: null, count: 0 },
    });
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', 'Bearer valid-test-token')
      .send({});
    expect(res.status).toBe(400);
  });
});
