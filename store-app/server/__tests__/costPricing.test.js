const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

/**
 * Pricing from cost.
 *
 * Every mode in /api/pricing computed the new price from the CURRENT SELLING
 * PRICE. That was fine while every product had one, and became a dead end
 * the moment bulk import started accepting sheets that carry only what you
 * paid: a 30% markup on a price of 0 is still 0, so an imported product
 * could never be priced at all.
 *
 * cost_markup_percent starts from cost_price instead. The dangerous case is
 * the opposite one, a product with a real selling price and no recorded
 * cost, where the same arithmetic would quietly rewrite the price to zero.
 * Those are skipped and counted, and that is most of what is asserted here.
 */
const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const app = require('../index');

const auth = (req) => req.set('Authorization', 'Bearer valid-test-token');

const product = (over = {}) => ({
  id: 'p1', name: 'Hisense Fridge', sku: 'HS-220', category: 'Fridges',
  price: 0, cost_price: 100, ...over,
});

beforeEach(() => {
  for (const k of Object.keys(overrides)) delete overrides[k];
  mock.mutations.length = 0;
});

const preview = (body) => auth(request(app).post('/api/pricing/preview')).send(body);
const apply = (body) => auth(request(app).put('/api/pricing/bulk-update')).send(body);

describe('POST /api/pricing/preview, from cost', () => {
  it('prices an unpriced product from its cost', async () => {
    overrides.products = { data: [product()], error: null };

    const res = await preview({ mode: 'cost_markup_percent', value: 30 });

    expect(res.status).toBe(200);
    // 100 paid, sold at 130. Markup on cost, not margin.
    expect(res.body.products[0].new_price).toBe(130);
    expect(res.body.skipped_count).toBe(0);
  });

  /* The whole point: this is what the old modes could not do. */
  it('is not defeated by a current price of zero, which every other mode is', async () => {
    overrides.products = { data: [product({ price: 0, cost_price: 250 })], error: null };

    const fromCost = await preview({ mode: 'cost_markup_percent', value: 40 });
    expect(fromCost.body.products[0].new_price).toBe(350);

    overrides.products = { data: [product({ price: 0, cost_price: 250 })], error: null };
    const fromPrice = await preview({ mode: 'markup_percent', value: 40 });
    expect(fromPrice.body.products[0].new_price).toBe(0);
  });

  it('leaves a priced product alone when no cost was ever recorded', async () => {
    overrides.products = { data: [product({ price: 500, cost_price: 0 })], error: null };

    const res = await preview({ mode: 'cost_markup_percent', value: 30 });

    expect(res.body.products[0].new_price).toBe(500);
    expect(res.body.products[0].change).toBe(0);
    expect(res.body.products[0].skipped).toBe(true);
    expect(res.body.products[0].skip_reason).toMatch(/no cost price/i);
    expect(res.body.skipped_count).toBe(1);
  });

  it('honours the rounding choice', async () => {
    overrides.products = { data: [product({ cost_price: 33.33 })], error: null };

    const res = await preview({ mode: 'cost_markup_percent', value: 30, rounding: 0.5 });

    expect(res.body.products[0].new_price).toBe(43.5);
  });

  it('reports the margin the new price would earn', async () => {
    overrides.products = { data: [product({ cost_price: 100 })], error: null };

    const res = await preview({ mode: 'cost_markup_percent', value: 100 });

    // Sold at 200 having paid 100, so half the takings are margin.
    expect(res.body.products[0].new_price).toBe(200);
    expect(res.body.products[0].margin).toBe('50.0');
  });
});

describe('PUT /api/pricing/bulk-update, from cost', () => {
  it('writes the price worked out from cost', async () => {
    overrides.products = { data: [product({ price: 0, cost_price: 100 })], error: null };

    const res = await apply({ mode: 'cost_markup_percent', value: 30 });

    expect(res.status).toBe(200);
    expect(res.body.updated_count).toBe(1);
    const update = mock.mutations.find(m => m.table === 'products' && m.op === 'update');
    expect(update.payload).toEqual({ price: 130 });
  });

  /* price_change_log.change_type is a CHECK constraint. Migration 079 widens
     it, and without that the audit insert fails AFTER the prices are already
     written, leaving changes with no trail. */
  it('records the mode it used in the audit trail', async () => {
    overrides.products = { data: [product()], error: null };

    await apply({ mode: 'cost_markup_percent', value: 30, reason: 'Opening prices' });

    const log = mock.mutations.find(m => m.table === 'price_change_log');
    expect(log.payload[0]).toMatchObject({
      change_type: 'cost_markup_percent',
      old_price: 0,
      new_price: 130,
      new_cost_price: 100,
      reason: 'Opening prices',
    });
  });

  it('does not touch a product with no cost, and says how many it left', async () => {
    overrides.products = {
      data: [product({ id: 'p1', price: 500, cost_price: 0 }), product({ id: 'p2', price: 0, cost_price: 100 })],
      error: null,
    };

    const res = await apply({ mode: 'cost_markup_percent', value: 30 });

    expect(res.body.updated_count).toBe(1);
    expect(res.body.skipped_no_cost).toBe(1);
    expect(res.body.message).toMatch(/1 skipped/);
    const updates = mock.mutations.filter(m => m.table === 'products' && m.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ price: 130 });
  });
});

/* The four original modes have to behave exactly as they did. */
describe('the existing modes still work off the selling price', () => {
  const cases = [
    ['markup_percent', 10, 220],
    ['markdown_percent', 10, 180],
    ['fixed_amount', 25, 225],
    ['set_price', 99, 99],
  ];

  it.each(cases)('%s leaves cost out of it', async (mode, value, expected) => {
    overrides.products = { data: [product({ price: 200, cost_price: 100 })], error: null };

    const res = await preview({ mode, value });

    expect(res.body.products[0].new_price).toBe(expected);
    expect(res.body.skipped_count).toBe(0);
  });

  it('still requires a mode and a value', async () => {
    overrides.products = { data: [product()], error: null };
    const res = await preview({ value: 10 });
    expect(res.status).toBe(400);
  });
});
