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

  describe('DELETE /api/products/:id', () => {
    it('deletes an existing product', async () => {
      mockProductsOnly({ data: {}, error: null });

      const res = await request(app).delete('/api/products/prod-1').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product deleted successfully');
    });
  });
});
