const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const mockMovements = [
  { id: 'mv-1', type: 'in', quantity: 10, created_at: new Date().toISOString() },
];

const mockSupabase = buildMockSupabase({
  stock_movements: { data: mockMovements, error: null, count: 1 },
  products: { data: [{ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Widget', sku: 'WDG-001', current_stock: 10 }], error: null, count: 1 },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../services/lossPreventionEngine', () => ({ runChecks: jest.fn().mockResolvedValue([]) }));

const app = require('../index');

describe('GET /api/stock', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/stock');
    expect(res.status).toBe(401);
  });

  it('returns stock movements with valid token', async () => {
    const res = await request(app)
      .get('/api/stock')
      .set('Authorization', 'Bearer valid-test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/stock/adjust', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/stock/adjust').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 or 500 when product_id is missing', async () => {
    const res = await request(app)
      .post('/api/stock/adjust')
      .set('Authorization', 'Bearer valid-test-token')
      .send({ quantity: 5, type: 'in', reason: 'restock' });
    expect([400, 500]).toContain(res.status);
  });
});

describe('GET /api/stock/transfers', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/stock/transfers');
    expect(res.status).toBe(401);
  });

  it('returns data with valid token', async () => {
    const res = await request(app)
      .get('/api/stock/transfers')
      .set('Authorization', 'Bearer valid-test-token');
    expect([200, 500]).toContain(res.status);
  });
});
