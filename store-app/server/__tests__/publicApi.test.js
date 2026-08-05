const request = require('supertest');
const bcrypt = require('bcryptjs');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase();

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' }),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

const app = require('../index');

const RAW_KEY = 'pk_live_' + 'a'.repeat(48);

function keyRow(scopes) {
  return {
    id: 'key-1',
    business_id: 'biz-uuid-123',
    scopes,
    status: 'active',
    key_hash: 'hashed-value',
    businesses: { id: 'biz-uuid-123', slug: 'acme', status: 'active' },
  };
}

describe('Public API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/public/catalog', () => {
    it('returns a storefront-safe, reshaped product list', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['read:catalog']), error: null });
        if (table === 'products') {
          return makeQueryMock({
            data: [{
              id: 'prod-1', sku: 'SKU-1', name: 'Widget', category: 'Tools', price: 9.99, cost_price: 4.0,
              product_inventory: [{ quantity: 10 }, { quantity: 5 }],
            }],
            error: null,
          });
        }
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 'prod-1', sku: 'SKU-1', name: 'Widget', category: 'Tools', price: 9.99, stock: 15 },
      ]);
      expect(res.body[0].cost_price).toBeUndefined();
    });
  });

  describe('POST /api/v1/public/orders', () => {
    const FULL_ORDER = {
      id: 'order-1', order_number: 'CO-0001', status: 'draft', total_amount: 19.98,
      items: [{ id: 'item-1', product_id: 'prod-1', quantity: 2, unit_price: 9.99 }],
    };

    function mockOrderFlow({ existingCustomer = null } = {}) {
      let customersCallCount = 0;
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['write:orders']), error: null });
        if (table === 'products') {
          return makeQueryMock({ data: [{ id: 'prod-1', sku: 'SKU-1', price: 9.99 }], error: null });
        }
        if (table === 'customers') {
          customersCallCount++;
          if (customersCallCount === 1) {
            return makeQueryMock({ data: existingCustomer, error: null });
          }
          return makeQueryMock({ data: { id: 'cust-new' }, error: null });
        }
        if (table === 'customer_orders') return makeQueryMock({ data: FULL_ORDER, error: null, count: 0 });
        if (table === 'customer_order_items') return makeQueryMock({ data: [], error: null });
        return makeQueryMock({ data: [], error: null });
      });
    }

    it('creates a customer and order for a new storefront shopper', async () => {
      mockOrderFlow({ existingCustomer: null });

      const res = await request(app)
        .post('/api/v1/public/orders')
        .set('X-API-Key', RAW_KEY)
        .send({
          customer: { name: 'Jane Shopper', phone: '0712345678' },
          items: [{ sku: 'SKU-1', quantity: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.order.order_number).toBe('CO-0001');
    });

    it('reuses an existing customer matched by phone', async () => {
      mockOrderFlow({ existingCustomer: { id: 'cust-existing' } });

      const res = await request(app)
        .post('/api/v1/public/orders')
        .set('X-API-Key', RAW_KEY)
        .send({
          customer: { name: 'Jane Shopper', phone: '0712345678' },
          items: [{ sku: 'SKU-1', quantity: 2 }],
        });

      expect(res.status).toBe(201);
    });

    it('rejects a write:orders request from a key without that scope', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['read:catalog']), error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/v1/public/orders')
        .set('X-API-Key', RAW_KEY)
        .send({ customer: { name: 'Jane', phone: '0712345678' }, items: [{ sku: 'SKU-1', quantity: 1 }] });

      expect(res.status).toBe(403);
    });

    it('rejects an order referencing an unknown SKU', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['write:orders']), error: null });
        if (table === 'products') return makeQueryMock({ data: [], error: null }); // no matching SKU
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/v1/public/orders')
        .set('X-API-Key', RAW_KEY)
        .send({ customer: { name: 'Jane', phone: '0712345678' }, items: [{ sku: 'UNKNOWN-SKU', quantity: 1 }] });

      expect(res.status).toBe(400);
    });

    it('rejects a payload missing phone', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['write:orders']), error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/v1/public/orders')
        .set('X-API-Key', RAW_KEY)
        .send({ customer: { name: 'Jane' }, items: [{ sku: 'SKU-1', quantity: 1 }] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/public/orders/:id', () => {
    it('404s when the order does not belong to this business', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'api_keys') return makeQueryMock({ data: keyRow(['read:orders']), error: null });
        if (table === 'customer_orders') return makeQueryMock({ data: null, error: { message: 'not found' } });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).get('/api/v1/public/orders/other-business-order').set('X-API-Key', RAW_KEY);
      expect(res.status).toBe(404);
    });
  });
});
