const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

/**
 * What the stock on the shelf is worth.
 *
 * This multiplied quantity by products.price, the SELLING price. That is the
 * retail value of the shelf, not the money tied up in it, and it overstates
 * by the whole margin. Worse, it reads zero for anything not yet priced.
 *
 * A real customer hit exactly that on 2026-09-14: 65 units they had paid
 * GHS 295,363 for, and the tile said their inventory was worth nothing. Their
 * import had put purchase costs into the selling price column, because the
 * importer demanded a selling price, and moving those figures to where they
 * belonged left every product unpriced.
 *
 * Valuing at cost is the conventional basis and the one that does not move
 * when somebody edits a price. A product with no recorded cost counts as
 * zero, which is honest only if the total also says how many it skipped.
 */
const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const app = require('../index');

const BIZ = 'biz-uuid-123'; // the mock user's business

const line = (quantity, cost, extra = {}) => ({
  quantity,
  location_id: 'loc-1',
  product: { id: 'p1', name: 'Thing', sku: 'SKU-1', cost_price: cost, category: 'Fridges', business_id: BIZ, ...extra },
  location: { id: 'loc-1', name: 'Sunyani' },
});

const get = (path) => request(app).get(path).set('Authorization', 'Bearer valid-test-token');

beforeEach(() => {
  for (const k of Object.keys(overrides)) delete overrides[k];
});

/* /summary reads product_inventory three times: the value, the below-reorder
   count, and dead stock. One fixed result serves all three, because only the
   value is asserted here and the other two read fields these rows do not
   carry. An ARRAY override would be wrong: buildMockSupabase keeps its
   per-table cursor for the life of the mock, not the life of a test, so the
   second test would start reading where the first stopped. */
const summaryWith = (valueRows) => {
  overrides.product_inventory = { data: valueRows, error: null };
  overrides.stock_movements = { data: [], error: null };
};

describe('GET /api/inventory-analytics/summary', () => {
  it('values stock at what it cost', async () => {
    summaryWith([line(5, 100), line(2, 250)]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.status).toBe(200);
    expect(res.body.total_inventory_value).toBe(1000); // 5x100 + 2x250
    expect(res.body.uncosted_count).toBe(0);
  });

  /* The regression, in the shape it actually occurred. */
  it('still values stock that has no selling price yet', async () => {
    summaryWith([line(65, 4544.05, { price: 0 })]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.body.total_inventory_value).toBeGreaterThan(0);
    expect(res.body.total_inventory_value).toBeCloseTo(295363.25, 2);
  });

  it('ignores the selling price entirely, however large', async () => {
    summaryWith([line(1, 100, { price: 99999 })]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.body.total_inventory_value).toBe(100);
  });

  it('counts an item with no recorded cost as zero, and says so', async () => {
    summaryWith([line(4, 50), line(3, 0, { price: 900 })]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.body.total_inventory_value).toBe(200);
    // Silently reporting 200 as the whole picture would be the same class of
    // bug as the one this replaces.
    expect(res.body.uncosted_count).toBe(1);
  });

  it('leaves another business out of the total', async () => {
    summaryWith([line(5, 100), line(99, 1000, { business_id: 'someone-else' })]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.body.total_inventory_value).toBe(500);
    expect(res.body.uncosted_count).toBe(0);
  });

  it('reports zero rather than failing when nothing is stocked', async () => {
    summaryWith([]);

    const res = await get('/api/inventory-analytics/summary');

    expect(res.status).toBe(200);
    expect(res.body.total_inventory_value).toBe(0);
    expect(res.body.uncosted_count).toBe(0);
  });
});

describe('GET /api/inventory-analytics/valuation', () => {
  it('breaks the cost down by category and location', async () => {
    overrides.product_inventory = {
      data: [
        line(2, 300),
        { ...line(1, 500), product: { ...line(1, 500).product, category: 'Television' } },
      ],
      error: null,
    };

    const res = await get('/api/inventory-analytics/valuation');

    expect(res.status).toBe(200);
    expect(res.body.total_value).toBe(1100);
    const fridges = res.body.by_category.find(c => c.category === 'Fridges');
    expect(fridges.value).toBe(600);
    expect(res.body.by_location[0]).toMatchObject({ location: 'Sunyani', value: 1100 });
  });

  it('agrees with the summary about uncosted items', async () => {
    overrides.product_inventory = { data: [line(2, 300), line(1, 0)], error: null };

    const res = await get('/api/inventory-analytics/valuation');

    expect(res.body.total_value).toBe(600);
    expect(res.body.uncosted_count).toBe(1);
  });
});
