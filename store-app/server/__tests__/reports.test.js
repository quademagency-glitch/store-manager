const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const mockUser = {
  id: 'user-uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  business_id: 'biz-uuid-123',
  status: 'active',
  role_id: 'role-uuid-123',
  roles: {
    name: 'Business Admin',
    permissions: ['manage_business'],
  },
  businesses: { status: 'active' },
  user_locations: [],
};

const MOCK_SALES = [
  { total_amount: 100, sale_items: [{ quantity: 2, unit_price: 50, product: { cost_price: 20 } }] }, // revenue = 100, cogs = 40
  { total_amount: 50, sale_items: [{ quantity: 1, unit_price: 50, product: { cost_price: 15 } }] }  // revenue = 50, cogs = 15
]; // total revenue = 150, total cogs = 55. gross profit = 95.

const MOCK_EXPENSES = [
  { amount: 10 },
  { amount: 5 }
]; // total expenses = 15

const MOCK_COMMISSIONS = [
  { amount: 10 }
]; // total commissions = 10

// Net profit = 95 - 15 - 10 = 70.
// Gross margin = 95 / 150 = 63.33%
// Net margin = 70 / 150 = 46.67%

const mockSupabase = buildMockSupabase({});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' })
}));

const app = require('../index');
const AUTH = { Authorization: 'Bearer valid-test-token' };

describe('Reports API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
      if (table === 'sales') return makeQueryMock({ data: MOCK_SALES, error: null });
      if (table === 'business_ledger') return makeQueryMock({ data: MOCK_EXPENSES, error: null });
      if (table === 'commission_ledger') return makeQueryMock({ data: MOCK_COMMISSIONS, error: null });
      return makeQueryMock({ data: [], error: null });
    });
  });

  describe('GET /api/reports/pnl', () => {
    it('returns 400 if startDate or endDate are missing', async () => {
      const res = await request(app).get('/api/reports/pnl').set(AUTH);
      expect(res.status).toBe(400);
    });

    it('returns calculated P&L report', async () => {
      const res = await request(app)
        .get('/api/reports/pnl?startDate=2023-01-01&endDate=2023-12-31')
        .set(AUTH);
        
      expect(res.status).toBe(200);
      expect(res.body.revenue).toBe(150);
      expect(res.body.cogs).toBe(55);
      expect(res.body.grossProfit).toBe(95);
      expect(res.body.expenses).toBe(15);
      expect(res.body.commissions).toBe(10);
      expect(res.body.netProfit).toBe(70);
      expect(res.body.grossMargin).toBe(63.33);
      expect(res.body.netMargin).toBe(46.67);
    });
  });
});
