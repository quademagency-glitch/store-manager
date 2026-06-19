const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

// A Business Admin's real seed permissions (migration 008) — notably no manage_platform.
const BUSINESS_ADMIN_PERMISSIONS = [
  'manage_business', 'manage_users', 'manage_products',
  'view_sales', 'create_sales', 'manage_sales',
  'manage_inventory', 'view_analytics',
];

// Stand-in for the real global "Platform Admin" role: returned by the mock for any
// roles-table lookup (collision check, or resolving a role by id/name), so each test
// below exercises a different call site hitting the same over-privileged role.
const PLATFORM_ADMIN_ROLE = {
  id: 'global-platform-admin-role-id',
  name: 'Platform Admin',
  business_id: null,
  permissions: ['manage_platform', ...BUSINESS_ADMIN_PERMISSIONS],
};

const mockSupabase = buildMockSupabase({
  _authUser: { id: 'business-admin-uuid', email: 'admin@example.com' },
  users: {
    data: {
      id: 'business-admin-uuid',
      name: 'Business Admin User',
      email: 'admin@example.com',
      business_id: 'biz-uuid-123',
      status: 'active',
      role_id: 'business-admin-role-id',
      roles: { name: 'Business Admin', permissions: BUSINESS_ADMIN_PERMISSIONS },
      businesses: { status: 'active' },
      user_locations: [],
    },
    error: null,
  },
  roles: { data: PLATFORM_ADMIN_ROLE, error: null },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

const app = require('../index');

const AUTH = { Authorization: 'Bearer valid-test-token' };

describe('Privilege escalation guardrails', () => {
  it('POST /api/roles rejects a role granting permissions the creator does not have', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set(AUTH)
      .send({ name: 'Sneaky Role', description: '', permissions: ['manage_platform'] });

    expect(res.status).toBe(403);
  });

  it('POST /api/roles rejects creating a role named after the reserved global Platform Admin role', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set(AUTH)
      .send({ name: 'Platform Admin', description: '', permissions: ['manage_users'] });

    expect(res.status).toBe(403);
  });

  it('PUT /api/users/:id rejects assigning a role that grants permissions the assigner does not have', async () => {
    const res = await request(app)
      .put('/api/users/some-user-uuid')
      .set(AUTH)
      .send({ name: 'Some User', role_id: PLATFORM_ADMIN_ROLE.id });

    expect(res.status).toBe(403);
  });

  it('POST /api/users/create rejects creating a user with role_name resolving to an over-privileged role', async () => {
    const res = await request(app)
      .post('/api/users/create')
      .set(AUTH)
      .send({ email: 'new@example.com', password: 'password123', role_name: 'Platform Admin' });

    expect(res.status).toBe(403);
  });
});
