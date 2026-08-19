// The limit is driven from env so this can be exercised for real, rather than
// skipped behind a NODE_ENV check that would leave the whole feature untested.
process.env.API_RATE_LIMIT = '3';

const request = require('supertest');

jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const app = require('../index');

describe('general /api rate limiter', () => {
  it('rejects once the ceiling is crossed', async () => {
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/products').set('Authorization', 'Bearer burst-token');
      codes.push(res.status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  it('returns standard rate-limit headers', async () => {
    const res = await request(app).get('/api/products').set('Authorization', 'Bearer header-token');
    expect(
      res.headers['ratelimit-limit'] ?? res.headers['ratelimit'] ?? res.headers['ratelimit-policy'],
    ).toBeDefined();
  });

  // The reason this is keyed by session rather than IP: six cashiers behind one
  // shop's NAT would otherwise share a single budget and lock each other out.
  it('gives separate sessions separate budgets', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).get('/api/products').set('Authorization', 'Bearer noisy-session');
    }
    const other = await request(app).get('/api/products').set('Authorization', 'Bearer quiet-session');
    expect(other.status).not.toBe(429);
  });

  // Railway's healthcheck and any uptime monitor must never be throttled, and
  // must never consume anyone else's budget.
  it('never throttles the liveness probe', async () => {
    for (let i = 0; i < 12; i++) {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    }
  });

  it('skips the business-keyed public API, which has its own limiter', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await request(app).get('/api/v1/public/catalog')).status);
    }
    // 401 (no API key) is expected — the point is that none are 429 from THIS
    // limiter, which would mean the skip failed.
    expect(codes.every((c) => c !== 429)).toBe(true);
  });
});
