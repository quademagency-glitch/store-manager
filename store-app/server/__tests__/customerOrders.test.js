const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase();

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' }),
}));
jest.mock('../services/webhookDispatcher', () => ({
  dispatchWebhook: jest.fn(),
  attemptDelivery: jest.fn(),
}));

const { dispatchWebhook } = require('../services/webhookDispatcher');
const app = require('../index');

const AUTH = { Authorization: 'Bearer valid-test-token' };

const mockUser = {
  id: 'user-uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  business_id: 'biz-uuid-123',
  status: 'active',
  role_id: 'role-uuid-123',
  roles: { name: 'Business Admin', permissions: [] },
  businesses: { status: 'active' },
  user_locations: [],
};

const FULL_ORDER = {
  id: 'order-1',
  order_number: 'CO-0001',
  status: 'draft',
  business_id: 'biz-uuid-123',
  total_amount: 19.98,
  items: [{ id: 'item-1', product_id: 'prod-1', quantity: 2, unit_price: 9.99 }],
};

describe('Customer Orders API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/customer-orders', () => {
    it('creates a draft order for a valid customer and items', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'customers') return makeQueryMock({ data: { id: 'cust-1', business_id: 'biz-uuid-123' }, error: null });
        if (table === 'customer_orders') return makeQueryMock({ data: FULL_ORDER, error: null, count: 0 });
        if (table === 'customer_order_items') return makeQueryMock({ data: [], error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/customer-orders')
        .set(AUTH)
        .send({ customer_id: 'cust-1', items: [{ product_id: 'prod-1', quantity: 2, unit_price: 9.99 }] });

      expect(res.status).toBe(201);
      expect(res.body.order.order_number).toBe('CO-0001');
    });

    it('rejects an order with no items', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'customers') return makeQueryMock({ data: { id: 'cust-1', business_id: 'biz-uuid-123' }, error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/customer-orders')
        .set(AUTH)
        .send({ customer_id: 'cust-1', items: [] });

      expect(res.status).toBe(400);
    });

    it('404s when the customer does not exist', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'customers') return makeQueryMock({ data: null, error: { message: 'not found' } });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .post('/api/customer-orders')
        .set(AUTH)
        .send({ customer_id: 'missing', items: [{ product_id: 'prod-1', quantity: 1 }] });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/customer-orders/:id/status', () => {
    it('transitions status and dispatches an order.status_changed webhook', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'customer_orders') {
          return makeQueryMock({ data: { ...FULL_ORDER, status: 'confirmed' }, error: null });
        }
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .put('/api/customer-orders/order-1/status')
        .set(AUTH)
        .send({ status: 'sourcing' });

      expect(res.status).toBe(200);
      expect(dispatchWebhook).toHaveBeenCalledWith(
        'biz-uuid-123',
        'order.status_changed',
        expect.objectContaining({ status: 'sourcing' })
      );
    });

    it('rejects an invalid status transition', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'customer_orders') {
          return makeQueryMock({ data: { ...FULL_ORDER, status: 'draft' }, error: null });
        }
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app)
        .put('/api/customer-orders/order-1/status')
        .set(AUTH)
        .send({ status: 'fulfilled' });

      expect(res.status).toBe(400);
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });
  });
});
