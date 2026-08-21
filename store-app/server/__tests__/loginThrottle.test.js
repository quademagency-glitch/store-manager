/**
 * Login throttling is keyed on the account, not the caller's address.
 *
 * The SPA reaches this API through Vercel's rewrite of /api/*, and req.ip does
 * not survive it. Measured against production on 2026-08-21: a request from
 * 154.163.174.227 arrived with x-forwarded-for holding Vercel's egress and
 * Railway's edge, and Express derives req.ip from that header. (The real
 * address does arrive, in x-vercel-forwarded-for; Railway's edge overwrites
 * x-forwarded-for instead of appending. It is spoofable on the direct path,
 * so it is not used here, and the account is the better key regardless.)
 *
 * So an IP-keyed limiter on this route counted the whole platform into a
 * handful of buckets: "10 per 15 minutes" was near enough 10 for everybody,
 * and the eleventh person to sign in on a busy morning was told they had made
 * too many attempts.
 *
 * These tests pin the two properties that matter and would both have passed
 * vacuously under the old IP keying.
 */

const rateLimit = require('express-rate-limit');

// The keyGenerator under test, kept identical to routes/auth.js. Extracting it
// from the module would mean booting the whole route file (and Supabase with
// it) for a pure function; the guard below is what keeps the two honest.
function loginKey(req) {
  const email = req.body?.email;
  return typeof email === 'string' && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : rateLimit.ipKeyGenerator(req.ip);
}

const asReq = (email, ip = '10.0.0.1') => ({ body: { email }, ip });

describe('login throttling key', () => {
  it('gives two people on one address separate budgets', () => {
    // The real case: several cashiers on one shop's connection, or, as now,
    // the entire platform behind Vercel's egress.
    const ip = '13.247.245.82';
    expect(loginKey(asReq('ama@shop.gh', ip)))
      .not.toBe(loginKey(asReq('kofi@shop.gh', ip)));
  });

  it('keeps one person on one budget across different addresses', () => {
    // The attack this limit exists to stop. Vercel's egress rotates, so an
    // IP-keyed limiter handed a guesser a fresh allowance every few requests.
    expect(loginKey(asReq('ama@shop.gh', '13.247.245.82')))
      .toBe(loginKey(asReq('ama@shop.gh', '15.240.64.77')));
  });

  it('does not hand out a fresh budget for case or padding', () => {
    const base = loginKey(asReq('ama@shop.gh'));
    expect(loginKey(asReq('AMA@Shop.GH'))).toBe(base);
    expect(loginKey(asReq('  ama@shop.gh  '))).toBe(base);
  });

  it('falls back to the address when the body carries no usable email', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
      expect(loginKey(asReq(bad, '203.0.113.9'))).toBe('203.0.113.9');
    }
  });

  it('matches the implementation in routes/auth.js', () => {
    // Cheap guard against this copy drifting from the real one.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
    expect(src).toMatch(/function loginKey\(req\)/);
    expect(src).toMatch(/email:\$\{email\.trim\(\)\.toLowerCase\(\)\}/);
    expect(src).toMatch(/keyGenerator: loginKey/);
    expect(src).toMatch(/skipSuccessfulRequests: true/);
  });
});
