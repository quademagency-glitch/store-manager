const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const mockSales = [
  { id: 'sale-1', total_amount: 100, payment_method: 'cash', created_at: new Date().toISOString() },
];

const mockSupabase = buildMockSupabase({
  sales: { data: mockSales, error: null, count: 1 },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../services/lossPreventionEngine', () => ({ runChecks: jest.fn().mockResolvedValue([]) }));

const app = require('../index');

describe('GET /api/sales', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(401);
  });

  it('returns sales list with valid token', async () => {
    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', 'Bearer valid-test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('respects pagination params', async () => {
    const res = await request(app)
      .get('/api/sales?page=1&limit=10')
      .set('Authorization', 'Bearer valid-test-token');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/sales', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/sales').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 with empty items array', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', 'Bearer valid-test-token')
      .send({ items: [], payment_method: 'cash', total_amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('returns 400 with invalid payment_method', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', 'Bearer valid-test-token')
      .send({
        items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
        payment_method: 'bitcoin',
        total_amount: 50,
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 with invalid product UUID', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', 'Bearer valid-test-token')
      .send({
        items: [{ product_id: 'not-a-uuid', quantity: 1 }],
        payment_method: 'cash',
        total_amount: 50,
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sales/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/sales/sale-1');
    expect(res.status).toBe(401);
  });
});
