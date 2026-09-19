const request = require('supertest');
const express = require('express');
const { buildMockSupabase } = require('./helpers/mockSupabase');

let mockActor;
const mockSupabase = { from: jest.fn(), auth: { admin: { createUser: jest.fn() } } };
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../middleware/authGuard', () => Object.assign((req, res, next) => {
  req.user = mockActor;
  next();
}, { invalidateUserCache: jest.fn(), invalidateRoleCache: jest.fn() }));
jest.mock('../utils/auditLog', () => ({ logAuditEvent: jest.fn(), AUDIT_ACTIONS: {} }));
jest.mock('../services/emailService', () => ({ sendBusinessWelcomeEmail: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/roles', require('../routes/roles'));
app.use('/users', require('../routes/users'));

const customRole = { id: 'custom-role', name: 'Receiver', business_id: 'business-a', permissions: ['receive_goods'] };
const target = { id: 'staff-id', name: 'Staff', role_id: 'old-role', status: 'active', business_id: 'business-a' };
let db;
function arrange(overrides = {}) {
  db = buildMockSupabase(overrides);
  mockSupabase.from.mockImplementation(db.from);
}
beforeEach(() => {
  jest.clearAllMocks();
  // This reproduces the real, older global Business Admin permission row.
  mockActor = { id: 'owner-id', role: 'Business Admin', business_id: 'business-a', permissions: ['manage_users', 'manage_business'] };
  mockSupabase.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'new-staff' } }, error: null });
});

describe('Hosted owner delegation regression', () => {
  it('lets an owner create a tenant role for a newer permission', async () => {
    arrange({ roles: [{ data: null }, { data: customRole }] });
    const res = await request(app).post('/roles').send({ name: 'Receiver', permissions: ['receive_goods'] });
    expect(res.status).toBe(201);
    expect(db.mutations).toContainEqual(expect.objectContaining({ table: 'roles', op: 'insert' }));
  });

  it('lets an owner update a custom role to newer tenant permissions', async () => {
    arrange({ roles: { data: customRole } });
    const res = await request(app).put('/roles/custom-role').send({ name: 'Receiver', permissions: ['receive_goods', 'manage_purchases'] });
    expect(res.status).toBe(200);
    expect(db.mutations[0].payload.permissions).toContain('manage_purchases');
  });

  it('lets an owner create staff with the newer tenant role', async () => {
    arrange({ roles: { data: customRole } });
    const res = await request(app).post('/users/create').send({ email: 'fixture@example.invalid', password: 'Synthetic-password-123!', role_name: 'Receiver' });
    expect(res.status).toBe(200);
    expect(mockSupabase.auth.admin.createUser).toHaveBeenCalledTimes(1);
  });

  it('lets an owner assign that role to existing staff', async () => {
    arrange({ roles: { data: customRole }, users: { data: target } });
    const res = await request(app).put('/users/staff-id').send({ name: 'Staff', role_id: customRole.id });
    expect(res.status).toBe(200);
    expect(db.mutations[0].payload.role_id).toBe(customRole.id);
  });

  it('still denies platform permission grants to business owners', async () => {
    arrange();
    const res = await request(app).post('/roles').send({ name: 'Escalation', permissions: ['manage_platform'] });
    expect(res.status).toBe(403);
    expect(db.mutations).toHaveLength(0);
  });

  it('still limits delegated managers to their own permissions', async () => {
    mockActor.role = 'Delegated manager';
    arrange();
    const res = await request(app).post('/roles').send({ name: 'Receiver', permissions: ['receive_goods'] });
    expect(res.status).toBe(403);
    expect(db.mutations).toHaveLength(0);
  });

  it('cannot turn a delegated manager into a Business Admin through a sparse seed role', async () => {
    mockActor.role = 'Delegated manager';
    arrange({ roles: { data: { name: 'Business Admin', business_id: null, permissions: mockActor.permissions } } });
    const res = await request(app).put('/users/staff-id').send({ role_id: 'owner-role' });
    expect(res.status).toBe(403);
    expect(db.mutations).toHaveLength(0);
  });

  it('cannot assign another business custom role', async () => {
    arrange({ roles: { data: { ...customRole, business_id: 'business-b' } } });
    const res = await request(app).put('/users/staff-id').send({ role_id: customRole.id });
    expect(res.status).toBe(403);
    expect(db.mutations).toHaveLength(0);
  });

  it('cannot update another business staff member', async () => {
    arrange({ roles: { data: customRole }, users: { data: { ...target, business_id: 'business-b' } } });
    const res = await request(app).put('/users/foreign-staff').send({ role_id: customRole.id });
    expect(res.status).toBe(403);
    expect(db.mutations).toHaveLength(0);
  });
});
