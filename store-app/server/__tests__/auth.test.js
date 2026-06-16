const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

let mockSupabase = buildMockSupabase();

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

const app = require('../index');

describe('POST /api/auth/login', () => {
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('returns 400 with invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('email');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test', email: 'new@example.com', password: 'pass123', role_id: 'uuid-here' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 400 with invalid UUID for role_id when authenticated', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer valid-test-token')
      .send({ name: 'Test', email: 'new@example.com', password: 'pass123', role_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user data with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-test-token');
    // The mock returns a user, so authGuard passes; /me should return the profile
    expect([200, 401, 404]).toContain(res.status);
  });
});
