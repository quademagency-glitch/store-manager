const request = require('supertest');

jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const app = require('../index');

// Build a JSON body of roughly `kb` kilobytes.
function bodyOfSize(kb) {
  return { blob: 'x'.repeat(kb * 1024) };
}

describe('request body size limits', () => {
  describe('the default 100kb ceiling', () => {
    it('accepts a normal-sized body (reaching auth, not the parser)', async () => {
      const res = await request(app).post('/api/products').send({ name: 'widget' });
      // 401 proves the parser accepted the body and the request reached authGuard.
      expect(res.status).toBe(401);
    });

    // Regression: body-parser rejects an oversized body with a 413, but the
    // global error handler used to return an unconditional 500, so a user
    // hitting the limit saw "Internal server error" with no hint that the
    // request was simply too big.
    it('rejects an oversized body with 413, NOT 500', async () => {
      const res = await request(app).post('/api/products').send(bodyOfSize(200));
      expect(res.status).toBe(413);
      expect(res.body.error).toBe('Payload too large');
    });

    it('rejects malformed JSON with 400, not 500', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Content-Type', 'application/json')
        .send('{"unterminated": ');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON');
    });
  });

  describe('the bulk-import exception', () => {
    // /api/imports/validate and /commit take the parsed rows back as a JSON
    // array, so a ~1,000-row product import is ~200kb and was rejected outright
    // by the 100kb default. These two paths get 20mb.
    it('accepts a body far over 100kb on /api/imports/commit', async () => {
      const res = await request(app).post('/api/imports/commit').send(bodyOfSize(500));
      // 401 (auth) rather than 413 proves the larger parser ran.
      expect(res.status).toBe(401);
    });

    it('accepts a body far over 100kb on /api/imports/validate', async () => {
      const res = await request(app).post('/api/imports/validate').send(bodyOfSize(500));
      expect(res.status).toBe(401);
    });

    // The allowlist is exact, a neighbouring imports route must not silently
    // inherit the 20mb ceiling.
    it('does not extend the large limit to other /api/imports routes', async () => {
      const res = await request(app).post('/api/imports/preview').send(bodyOfSize(200));
      expect(res.status).toBe(413);
    });
  });
});
