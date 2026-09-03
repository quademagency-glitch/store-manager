/**
 * POST /api/auth/resend-confirmation.
 *
 * The endpoint exists because the verification link has exactly one carrier,
 * the welcome email, and /signup sends it best-effort so as not to fail a
 * signup on it. A silent send failure therefore strands someone with an
 * account, a slug and a running trial they can never verify.
 *
 * Two properties are worth more than the happy path here:
 *
 *   1. Nothing that DIDN'T send may be distinguishable from anything else that
 *      didn't send. The endpoint is unauthenticated and takes a caller-chosen
 *      address, so if "no such account" and "already confirmed" and "sent"
 *      differ in any observable way, it becomes a way to ask whether an
 *      address is registered. There is a test that compares the three
 *      responses byte for byte rather than asserting on each separately,
 *      because asserting each in isolation is exactly how they drift apart.
 *
 *   2. A send failure must NOT be swallowed. Returning 200 on a failed resend
 *      reproduces the original bug inside its own fix.
 *
 * The 502 in (2) is in tension with (1): it can only ever occur for an address
 * that does have an unconfirmed account. That is a deliberate, owner-approved
 * trade — the user is the error handler on this call — and it is why the rate
 * limiters are covered here as load-bearing rather than as hygiene.
 */
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const UNCONFIRMED = { id: 'user-uuid-123', email: 'stranded@acme.test' };
const PROFILE = { id: 'user-uuid-123', name: 'Ama Mensah', business_id: 'biz-uuid-1' };
const BUSINESS = {
  id: 'biz-uuid-1',
  name: 'Acme Hardware',
  slug: 'acme-hardware',
  status: 'trialing',
  trial_ends_at: '2026-10-01T00:00:00.000Z',
};

let mockSupabase = buildMockSupabase();
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

/* Jest hoists jest.mock factories above the file, so anything they close
   over must be prefixed `mock` to be allowed through. */
const mockSendWelcome = jest.fn().mockResolvedValue({ success: true });
jest.mock('../services/emailService', () => ({
  sendBusinessWelcomeEmail: (...args) => mockSendWelcome(...args),
  resolveBusinessLoginUrl: jest.fn(() => 'https://acme-hardware.app.quaderp.app'),
}));

const app = require('../index');
const {
  resendConfirmationLimiter,
  resendConfirmationEmailLimiter,
  resendConfirmationCeiling,
} = require('../routes/auth');

const post = (body) => request(app).post('/api/auth/resend-confirmation').send(body);

/* The suite shares one loopback address, so every case would otherwise draw on
   the same 5/hour budget. One test below deliberately does not reset, so the
   limit itself stays covered. */
const LOOPBACK_KEYS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];
async function resetLimits(email = UNCONFIRMED.email) {
  for (const key of LOOPBACK_KEYS) await resendConfirmationLimiter.resetKey(key);
  await resendConfirmationEmailLimiter.resetKey(`email:${email.toLowerCase()}`);
  await resendConfirmationCeiling.resetKey('all');
}

function useMock(overrides) {
  Object.assign(mockSupabase, buildMockSupabase(overrides));
}

/** An address with an account that has never confirmed: the sending path. */
function strandedOverrides() {
  return { users: { data: PROFILE, error: null }, businesses: { data: BUSINESS, error: null } };
}

beforeEach(async () => {
  await resetLimits();
  mockSendWelcome.mockClear();
  mockSendWelcome.mockResolvedValue({ success: true });
  useMock(strandedOverrides());
});

describe('validation', () => {
  it('rejects a missing body', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('rejects an address that is not an email', async () => {
    const res = await post({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });
});

describe('the sending path', () => {
  it('sends and returns ok for an unconfirmed account', async () => {
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendWelcome).toHaveBeenCalledTimes(1);
  });

  it('mints a magiclink, not a recovery link', async () => {
    // recovery also confirms the address, but lands the user on a password
    // reset they do not need, having chosen a password at signup.
    await post({ email: UNCONFIRMED.email });
    const [[args]] = mockSupabase.auth.admin.generateLink.mock.calls;
    expect(args.type).toBe('magiclink');
    expect(args.email).toBe(UNCONFIRMED.email);
  });

  it('points the link at the tenant subdomain, not the bare app host', async () => {
    await post({ email: UNCONFIRMED.email });
    const [[args]] = mockSupabase.auth.admin.generateLink.mock.calls;
    expect(args.options.redirectTo).toBe('https://acme-hardware.app.quaderp.app/login');
  });

  it('passes the minted link as the call to action, not a password reset', async () => {
    await post({ email: UNCONFIRMED.email });
    const [, , opts] = mockSendWelcome.mock.calls[0];
    expect(opts.ctaMode).toBe('verify-email');
    expect(opts.setPasswordUrl).toBe('https://example.test/confirm');
  });

  it('lowercases and trims the address before looking it up', async () => {
    await post({ email: '  STRANDED@Acme.TEST  ' });
    const [[args]] = mockSupabase.auth.admin.generateLink.mock.calls;
    expect(args.email).toBe('stranded@acme.test');
  });
});

describe('the quiet paths', () => {
  it('says ok and sends nothing when no account exists', async () => {
    useMock({ users: { data: null, error: null } });
    const res = await post({ email: 'nobody@acme.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it('says ok and sends nothing when the account is already confirmed', async () => {
    useMock(strandedOverrides());
    mockSupabase.auth.admin.getUserById = jest.fn().mockResolvedValue({
      data: { user: { ...UNCONFIRMED, email_confirmed_at: '2026-08-01T00:00:00Z' } },
      error: null,
    });
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it('says ok and sends nothing when the profile lookup itself fails', async () => {
    useMock({ users: { data: null, error: { message: 'boom' } } });
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(200);
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it('is indistinguishable across every case where nothing was sent', async () => {
    // The whole anti-enumeration property in one assertion. Asserting the
    // three separately is how they drift apart; this compares them.
    const seen = [];

    useMock({ users: { data: null, error: null } });
    let res = await post({ email: 'nobody@acme.test' });
    seen.push([res.status, JSON.stringify(res.body)]);

    await resetLimits();
    useMock(strandedOverrides());
    mockSupabase.auth.admin.getUserById = jest.fn().mockResolvedValue({
      data: { user: { ...UNCONFIRMED, email_confirmed_at: '2026-08-01T00:00:00Z' } },
      error: null,
    });
    res = await post({ email: UNCONFIRMED.email });
    seen.push([res.status, JSON.stringify(res.body)]);

    await resetLimits();
    useMock(strandedOverrides());
    res = await post({ email: UNCONFIRMED.email });
    seen.push([res.status, JSON.stringify(res.body)]);

    expect(seen[0]).toEqual(seen[1]);
    expect(seen[1]).toEqual(seen[2]);
  });
});

describe('failures are surfaced, not swallowed', () => {
  it('returns 502 when the send fails', async () => {
    mockSendWelcome.mockResolvedValue({ success: false, error: 'domain not verified' });
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/could not send/i);
  });

  it('returns 502 when the link cannot be minted', async () => {
    mockSupabase.auth.admin.generateLink = jest.fn()
      .mockResolvedValue({ data: null, error: { message: 'rate limited upstream' } });
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(502);
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it('returns 502 when the send throws', async () => {
    mockSendWelcome.mockRejectedValue(new Error('socket hang up'));
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(502);
  });

  it('never leaks the underlying reason to the caller', async () => {
    mockSendWelcome.mockResolvedValue({ success: false, error: 'quaderp.app is not verified on this account' });
    const res = await post({ email: UNCONFIRMED.email });
    expect(JSON.stringify(res.body)).not.toMatch(/verified|account|domain/i);
  });
});

describe('rate limiting', () => {
  it('caps repeats for one address and reports retryAfter in seconds', async () => {
    // Deliberately no reset: three succeed, the fourth is refused. This is
    // what stops the 502 above being a usable enumeration oracle.
    for (let i = 0; i < 3; i += 1) {
      const ok = await post({ email: UNCONFIRMED.email });
      expect(ok.status).toBe(200);
    }
    const res = await post({ email: UNCONFIRMED.email });
    expect(res.status).toBe(429);
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(res.body.retryAfter).toBeLessThanOrEqual(3600);
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfter));
  });

  it('counts an address case-insensitively, so casing cannot buy a fresh budget', async () => {
    for (let i = 0; i < 3; i += 1) await post({ email: UNCONFIRMED.email });
    const res = await post({ email: 'STRANDED@ACME.TEST' });
    expect(res.status).toBe(429);
  });
});
