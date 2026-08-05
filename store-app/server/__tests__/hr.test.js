const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const MOCK_LOCATION = { id: 'loc-1', geofence_radius: 100 }; // Removed lat/lng and time limits to avoid 403s
const MOCK_ATTENDANCE = { id: 'att-1', user_id: 'user-uuid-123', clock_in: '2023-01-01T08:00:00Z', location_id: 'loc-1' };

const mockUser = {
  id: 'user-uuid-123',
  name: 'Test User',
  email: 'test@example.com',
  business_id: 'biz-uuid-123',
  status: 'active',
  role_id: 'role-uuid-123',
  roles: {
    name: 'Salesperson',
    permissions: ['create_sales'],
  },
  businesses: { status: 'active' },
  user_locations: [{ location_id: 'loc-1' }],
};

const mockSupabase = buildMockSupabase({
  locations: { data: MOCK_LOCATION, error: null },
  attendance_logs: { data: [MOCK_ATTENDANCE], error: null }
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' })
}));

const app = require('../index');
const AUTH = { Authorization: 'Bearer valid-test-token' };

describe('HR API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
      if (table === 'locations') return makeQueryMock({ data: MOCK_LOCATION, error: null });
      if (table === 'attendance_logs') return makeQueryMock({ data: [MOCK_ATTENDANCE], error: null, count: 1 });
      return makeQueryMock({ data: [], error: null });
    });
  });

  describe('POST /api/hr/clock-in', () => {
    it('returns 400 if user is not assigned to any location', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: { ...mockUser, user_locations: [] }, error: null });
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).post('/api/hr/clock-in').set(AUTH).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No active location set. Please select a branch.');
    });

    it('returns 400 if user is already clocked in', async () => {
      // Mock existing active attendance
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'locations') return makeQueryMock({ data: MOCK_LOCATION, error: null });
        if (table === 'attendance_logs') {
          return {
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: MOCK_ATTENDANCE, error: null }) }) }),
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => Promise.resolve({ data: MOCK_ATTENDANCE, error: null })
                      })
                    })
                  })
                })
              })
            })
          };
        }
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).post('/api/hr/clock-in').set(AUTH).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Already clocked in');
    });
  });

  describe('POST /api/hr/clock-out', () => {
    it('returns 400 if user is not clocked in', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') return makeQueryMock({ data: mockUser, error: null });
        if (table === 'attendance_logs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => Promise.resolve({ data: null, error: null })
                      })
                    })
                  })
                })
              })
            })
          };
        }
        return makeQueryMock({ data: [], error: null });
      });

      const res = await request(app).post('/api/hr/clock-out').set(AUTH).send({});
      expect(res.status).toBe(400);
    });
  });
});
