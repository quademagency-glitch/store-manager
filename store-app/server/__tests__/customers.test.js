const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const MOCK_CUSTOMERS = [
  { id: 'cust-1', business_id: 'biz-uuid-123', name: 'Alice Smith', phone: '1234567890', customer_code: 'CUST-A123' },
  { id: 'cust-2', business_id: 'biz-uuid-123', name: 'Bob Jones', phone: '0987654321', customer_code: 'CUST-B456' }
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
    permissions: ['create_sales'],
  },
  businesses: { status: 'active' },
  user_locations: [],
};

const mockSupabase = buildMockSupabase({
  customers: { data: MOCK_CUSTOMERS, error: null }
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' })
}));

const app = require('../index');
const AUTH = { Authorization: 'Bearer valid-test-token' };

function mockCustomersOnly(result) {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'customers') return makeQueryMock(result);
    if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
    return makeQueryMock({ data: [], error: null });
  });
}

describe('Customers API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
      if (table === 'customers') return makeQueryMock({ data: MOCK_CUSTOMERS, error: null, count: 2 });
      return makeQueryMock({ data: [], error: null });
    });
  });

  describe('GET /api/customers', () => {
    it('returns a paginated list of customers', async () => {
      const res = await request(app).get('/api/customers').set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.data[0].name).toBe('Alice Smith');
    });
  });

  describe('GET /api/customers/search', () => {
    it('returns customers matching query', async () => {
      mockCustomersOnly({ data: [MOCK_CUSTOMERS[0]], error: null });
      const res = await request(app).get('/api/customers/search?q=Alice').set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Alice Smith');
    });
    
    it('returns empty array if no query provided', async () => {
      const res = await request(app).get('/api/customers/search').set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('returns a single customer', async () => {
      mockCustomersOnly({ data: MOCK_CUSTOMERS[0], error: null });
      const res = await request(app).get('/api/customers/cust-1').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice Smith');
    });

    it('returns 404 if customer not found', async () => {
      mockCustomersOnly({ data: null, error: null });
      const res = await request(app).get('/api/customers/not-found').set(AUTH);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/customers', () => {
    it('creates a new customer', async () => {
      const newCust = { name: 'New Customer', phone: '0241234567' };
      mockCustomersOnly({ data: { id: 'cust-new', ...newCust }, error: null });

      const res = await request(app)
        .post('/api/customers')
        .set(AUTH)
        .send(newCust);

      expect(res.status).toBe(201);
      expect(res.body.customer.id).toBe('cust-new');
      expect(res.body.customer.name).toBe('New Customer');
    });

    it('returns 400 if phone is missing', async () => {
      const res = await request(app).post('/api/customers').set(AUTH).send({ name: 'Bob' });
      expect(res.status).toBe(400);
    });

    // A local number is the normal case, staff type what is on the receipt,
    // not E.164. The country code is supplied from the business/location.
    it.each(['0241234567', '024 123 4567', '024-123-4567', '+233241234567', '233241234567'])(
      'accepts local spelling %s',
      async (phone) => {
        mockCustomersOnly({ data: { id: 'cust-new', name: 'Ama', phone }, error: null });

        const res = await request(app)
          .post('/api/customers')
          .set(AUTH)
          .send({ name: 'Ama', phone });

        expect(res.status).toBe(201);
      },
    );

    // An explicit country code overrides the branch's country, so a foreign
    // customer can be served anywhere.
    it.each(['+2348031234567', '+447911123456', '+12122345678', '+254712345678'])(
      'accepts foreign number %s',
      async (phone) => {
        mockCustomersOnly({ data: { id: 'cust-new', name: 'Ama', phone }, error: null });

        const res = await request(app)
          .post('/api/customers')
          .set(AUTH)
          .send({ name: 'Ama', phone });

        expect(res.status).toBe(201);
      },
    );

    it.each([
      ['024123456', 'too short'],
      ['02412345678', 'too long'],
      ['5555555555', 'not valid in the resolved country'],
      ['+99912345678', 'unassigned country code'],
      ['abc', 'not a number'],
    ])('rejects %s (%s)', async (phone) => {
      const res = await request(app)
        .post('/api/customers')
        .set(AUTH)
        .send({ name: 'Ama', phone });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('updates an existing customer (Business Admin)', async () => {
      const updateData = { name: 'Updated Name', phone: '0201234567' };

      mockCustomersOnly({ data: { ...MOCK_CUSTOMERS[0], ...updateData }, error: null });

      const res = await request(app)
        .put('/api/customers/cust-1')
        .set(AUTH)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.customer.name).toBe('Updated Name');
    });

    // Otherwise an edit reintroduces the duplicate spellings create rejects.
    it('rejects an invalid phone on update', async () => {
      mockCustomersOnly({ data: MOCK_CUSTOMERS[0], error: null });

      const res = await request(app)
        .put('/api/customers/cust-1')
        .set(AUTH)
        .send({ name: 'Updated Name', phone: '5555555555' });

      expect(res.status).toBe(400);
    });
  });
});
