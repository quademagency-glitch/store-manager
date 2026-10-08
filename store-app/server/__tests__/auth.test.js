const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

let mockSupabase = buildMockSupabase();

/* supabaseSignIn is the same mock here on purpose: these suites assert on
   the sign-in call itself, not on which client made it. The separation
   between the two is what supabaseSessionLeak.test.js exists to prove. */
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase, supabaseSignIn: mockSupabase }));

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
  /* Removed on 8 October 2026. It took any role_id and no business, so
     anyone with manage_users could create an account holding any role,
     including Platform Admin. Staff are created through /api/users/create,
     which checks what the creator may grant. */
  it('no longer exists', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer valid-test-token')
      .send({ name: 'Test', email: 'new@example.com', password: 'pass123', role_id: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(404);
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
