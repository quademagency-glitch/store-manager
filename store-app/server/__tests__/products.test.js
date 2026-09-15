const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const MOCK_PRODUCTS = [
  { id: 'prod-1', business_id: 'biz-uuid-123', name: 'Test Product 1', price: 10.0, product_inventory: [{ location_id: 'loc-1', quantity: 100 }] },
  { id: 'prod-2', business_id: 'biz-uuid-123', name: 'Test Product 2', price: 20.0, product_inventory: [] }
];

const mockUser = {
  id: 'user-uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  business_id: 'biz-uuid-123',
  status: 'active',
  role_id: 'role-uuid-123',
  roles: {
    name: 'Business Admin',
    permissions: ['manage_products'],
  },
  businesses: { status: 'active' },
  user_locations: [],
};

const mockSupabase = buildMockSupabase({
  products: { data: MOCK_PRODUCTS, error: null }
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
// Mock the JWT verifier so we don't need real tokens or secret keys
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' })
}));

const app = require('../index');

const AUTH = { Authorization: 'Bearer valid-test-token' };

/**
 * Drive PUT /api/products/:id, which reads the row, updates it, then logs the
 * difference. `from('products')` is called twice with different intent, so the
 * results are handed out in order; every other table records what was written
 * to it so a test can assert the logged row rather than merely that a table
 * was touched.
 */
function mockProductEdit(before, after, { failLog = null, user = mockUser } = {}) {
  const writes = [];
  let productCalls = 0;
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'users') return makeQueryMock({ data: user, error: null });
    if (table === 'products') {
      productCalls += 1;
      return makeQueryMock({ data: productCalls === 1 ? before : after, error: null });
    }
    const result = table === failLog
      ? { data: null, error: { message: 'log table is down' } }
      : { data: [], error: null };
    return makeQueryMock(result, (op, payload) => writes.push({ table, op, payload }));
  });
  return writes;
}

/** Rows a route sent to one table, flattened — inserts may be arrays. */
function rowsWrittenTo(writes, table) {
  return writes
    .filter((w) => w.table === table && w.op === 'insert')
    .flatMap((w) => (Array.isArray(w.payload) ? w.payload : [w.payload]));
}

// A helper to mock only the 'products' table and let 'users' pass through normally.
function mockProductsOnly(result) {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'products') return makeQueryMock(result);
    if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
    return makeQueryMock({ data: [], error: null });
  });
}

describe('Products API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
      if (table === 'products') return makeQueryMock({ data: MOCK_PRODUCTS, error: null });
      return makeQueryMock({ data: [], error: null });
    });
  });

  describe('GET /api/products', () => {
    it('returns a list of products', async () => {
      const res = await request(app).get('/api/products').set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('Test Product 1');
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a single product', async () => {
      mockProductsOnly({ data: MOCK_PRODUCTS[0], error: null });
      const res = await request(app).get('/api/products/prod-1').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Product 1');
    });

    it('returns 404 if product not found', async () => {
      mockProductsOnly({ data: null, error: null });
      const res = await request(app).get('/api/products/not-found').set(AUTH);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/products', () => {
    it('creates a new product', async () => {
      const newProduct = { name: 'New Product', price: 30.0, sku: 'SKU-1' };
      mockProductsOnly({ data: { id: 'prod-new', ...newProduct }, error: null });

      const res = await request(app)
        .post('/api/products')
        .set(AUTH)
        .send(newProduct);
        
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('prod-new');
      expect(res.body.name).toBe('New Product');
    });

    it('returns 400 if name is missing', async () => {
      const res = await request(app).post('/api/products').set(AUTH).send({ price: 30.0 });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('updates an existing product', async () => {
      const updateData = { name: 'Updated Product', price: 40.0 };
      mockProductsOnly({ data: { ...MOCK_PRODUCTS[0], ...updateData }, error: null });

      const res = await request(app)
        .put('/api/products/prod-1')
        .set(AUTH)
        .send(updateData);
        
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Product');
    });
  });

  describe('PUT /api/products/:id history', () => {
    const BEFORE = {
      name: 'Test Product 1', sku: 'SKU-1', category: 'Groceries',
      price: 10, cost_price: 6, qr_code_data: 'SKU-1', product_code: null, requires_serial: true,
    };

    it('logs a manual price change to price_change_log', async () => {
      const after = { ...BEFORE, id: 'prod-1', business_id: 'biz-uuid-123', price: 12 };
      const writes = mockProductEdit(BEFORE, after);

      const res = await request(app).put('/api/products/prod-1').set(AUTH).send({ ...BEFORE, price: 12 });
      expect(res.status).toBe(200);

      const [row] = rowsWrittenTo(writes, 'price_change_log');
      expect(row).toMatchObject({
        product_id: 'prod-1',
        old_price: 10,
        new_price: 12,
        /* 'manual' is what separates a price typed into the form from a bulk
           repricing run, which is the only thing that used to write here. */
        change_type: 'manual',
        changed_by: 'user-uuid-123',
      });
    });

    it('logs a cost-only change too', async () => {
      const after = { ...BEFORE, id: 'prod-1', cost_price: 7.5 };
      const writes = mockProductEdit(BEFORE, after);

      await request(app).put('/api/products/prod-1').set(AUTH).send({ ...BEFORE, cost_price: 7.5 });

      const [row] = rowsWrittenTo(writes, 'price_change_log');
      expect(row).toMatchObject({ old_cost_price: 6, new_cost_price: 7.5, old_price: 10, new_price: 10 });
    });

    it('writes one row per changed field, and nothing for the rest', async () => {
      const after = { ...BEFORE, id: 'prod-1', name: 'Renamed', sku: 'SKU-2' };
      const writes = mockProductEdit(BEFORE, after);

      await request(app).put('/api/products/prod-1').set(AUTH).send({ ...BEFORE, name: 'Renamed', sku: 'SKU-2' });

      const rows = rowsWrittenTo(writes, 'product_change_log');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.field).sort()).toEqual(['name', 'sku']);
      expect(rows.find((r) => r.field === 'name')).toMatchObject({
        old_value: 'Test Product 1',
        new_value: 'Renamed',
        changed_by_name: 'Test User',
      });
      // Prices did not move, so the price log stays untouched.
      expect(rowsWrittenTo(writes, 'price_change_log')).toHaveLength(0);
    });

    it('logs nothing when the edit changes nothing', async () => {
      const after = { ...BEFORE, id: 'prod-1' };
      const writes = mockProductEdit(BEFORE, after);

      await request(app).put('/api/products/prod-1').set(AUTH).send(BEFORE);

      expect(rowsWrittenTo(writes, 'product_change_log')).toHaveLength(0);
      expect(rowsWrittenTo(writes, 'price_change_log')).toHaveLength(0);
    });

    it('still saves the product when the history write fails', async () => {
      const after = { ...BEFORE, id: 'prod-1', name: 'Renamed' };
      mockProductEdit(BEFORE, after, { failLog: 'product_change_log' });

      const res = await request(app).put('/api/products/prod-1').set(AUTH).send({ ...BEFORE, name: 'Renamed' });

      /* The row IS updated by the time the log is written. A 500 here would
         tell the user their edit did not save when it did. */
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
    });
  });

  describe('GET /api/products/:id/history', () => {
    const PRODUCT = { id: 'prod-1', name: 'Test Product 1', sku: 'SKU-1', business_id: 'biz-uuid-123' };

    function mockHistory({ user = mockUser } = {}) {
      /* `users` is read twice with different intent: authGuard wants one row
         via .single(), then the route batch-looks-up price authors and expects
         an array. A single fixed result cannot satisfy both. */
      let userCalls = 0;
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          userCalls += 1;
          return userCalls === 1
            ? makeQueryMock({ data: user, error: null })
            : makeQueryMock({ data: [{ id: 'u1', name: 'Ama' }], error: null });
        }
        if (table === 'products') return makeQueryMock({ data: PRODUCT, error: null });
        if (table === 'stock_movements') {
          return makeQueryMock({ data: [
            { id: 'm1', quantity_change: -2, movement_type: 'SALE', notes: null, reference_id: 'sale-1',
              created_at: '2026-09-03T10:00:00.000Z', user: { id: 'u1', name: 'Ama' }, location: { id: 'l1', name: 'Osu' } },
          ], error: null });
        }
        if (table === 'price_change_log') {
          return makeQueryMock({ data: [
            { id: 'pc1', old_price: 10, new_price: 12, old_cost_price: 6, new_cost_price: 6,
              change_type: 'manual', reason: null, batch_id: null,
              created_at: '2026-09-05T10:00:00.000Z', changed_by: 'u1' },
          ], error: null });
        }
        if (table === 'product_change_log') {
          return makeQueryMock({ data: [
            { id: 1, field: 'name', old_value: 'Old', new_value: 'Test Product 1',
              created_at: '2026-09-01T10:00:00.000Z', changed_by_name: 'Ama', user: null },
          ], error: null });
        }
        return makeQueryMock({ data: [], error: null });
      });
    }

    it('merges the three sources newest first', async () => {
      mockHistory();
      const res = await request(app).get('/api/products/prod-1/history').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.map((e) => e.kind)).toEqual(['price', 'stock', 'edit']);
      /* price_change_log.changed_by points at auth.users, so the name cannot be
         embedded and is stitched on from public.users instead. */
      expect(res.body.data[0]).toMatchObject({ kind: 'price', actor: 'Ama', new_price: 12 });
      expect(res.body.data[1]).toMatchObject({ movement_type: 'SALE', quantity_change: -2, location: 'Osu' });
      expect(res.body.data[2]).toMatchObject({ field: 'name', actor: 'Ama' });
    });

    it('404s for a product outside the caller\'s business', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'products') return makeQueryMock({ data: null, error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).get('/api/products/someone-elses/history').set(AUTH);
      expect(res.status).toBe(404);
    });

    it('hides price events from staff without manage_products, and says so', async () => {
      const cashier = {
        ...mockUser,
        roles: { name: 'Cashier', permissions: ['view_inventory'] },
      };
      mockHistory({ user: cashier });

      const res = await request(app).get('/api/products/prod-1/history').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data.map((e) => e.kind)).toEqual(['stock', 'edit']);
      /* Without this the page cannot tell "nothing happened" from "you are not
         allowed to see what happened". */
      expect(res.body.includes.prices).toBe(false);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('deletes an existing product', async () => {
      mockProductsOnly({ data: {}, error: null });

      const res = await request(app).delete('/api/products/prod-1').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product deleted successfully');
    });
  });
});
