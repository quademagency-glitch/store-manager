const request = require('supertest');

jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const app = require('../index');

describe('trust proxy', () => {
  // Without a trust proxy setting, req.ip is the proxy's socket address for
  // every request, so every IP-keyed rate limiter collapses into a single
  // platform-wide bucket — loginLimiter stops being "10 per user per 15min"
  // and becomes "10 for the entire platform".
  it('is configured, so req.ip resolves to the real client', () => {
    expect(app.get('trust proxy')).toBeDefined();
    expect(app.get('trust proxy')).not.toBe(false);
  });

  // express-rate-limit v8 throws ERR_ERL_PERMISSIVE_TRUST_PROXY on `true`,
  // and `true` takes the leftmost X-Forwarded-For entry — which any client can
  // forge, making every limiter bypassable with one header.
  it('is never the permissive `true`', () => {
    expect(app.get('trust proxy')).not.toBe(true);
  });

  it('is a hop count', () => {
    expect(typeof app.get('trust proxy')).toBe('number');
    expect(Number.isNaN(app.get('trust proxy'))).toBe(false);
    expect(app.get('trust proxy')).toBeGreaterThanOrEqual(1);
  });

  // 2, not 1. proxy-addr returns the first untrusted address walking
  // [socket, ...reversed XFF], so n=1 yields the RIGHTMOST forwarded entry —
  // which on the browser path (client -> Vercel -> Railway) is Vercel's egress
  // IP, collapsing every user into a handful of buckets. n=2 yields the real
  // client, and still resolves correctly on the single-hop webhook path where
  // it simply runs out of entries and returns the leftmost.
  it('defaults to 2 hops, so browser traffic resolves to the real client', () => {
    expect(app.get('trust proxy')).toBe(2);
  });

  it('still serves requests normally with a forwarded header present', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(200);
  });
});
