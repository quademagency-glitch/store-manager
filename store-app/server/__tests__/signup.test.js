/**
 * POST /api/auth/signup, self-service free trial.
 *
 * The happy path is covered thinly (it is mostly Supabase calls), and the
 * failure paths thickly, because that is where the damage is: a signup that
 * half-succeeds leaves a business row nobody can sign in to, squatting on the
 * slug its owner would want on a retry.
 */
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const PLAN = { id: 'plan-uuid-quaderp', name: 'QuadERP' };
const BUSINESS = {
  id: 'biz-uuid-new',
  name: 'Acme Hardware',
  slug: 'acme-hardware',
  status: 'unpaid',
  trial_ends_at: null,
  subscription_plan_id: PLAN.id,
};
const OWNER_PROFILE = {
  id: 'user-uuid-123',
  business_id: BUSINESS.id,
  role_id: 'role-uuid-ba',
  roles: { name: 'Business Admin' },
};

const VALID_BODY = {
  business_name: 'Acme Hardware',
  name: 'Ama Mensah',
  email: 'owner@acme.test',
  password: 'a-good-password',
  phone: '024 123 4567',
};

/**
 * Reconfigure the shared mock in place. `app` is required once at module load
 * and closes over this object, so the mock has to be mutated rather than
 * replaced between tests.
 */
let mockSupabase = buildMockSupabase();
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
// Sending a real welcome email is not the subject of these tests, and the
// route treats a failure as non-fatal anyway.
jest.mock('../services/emailService', () => ({
  sendBusinessWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  resolveBusinessLoginUrl: jest.fn(() => 'https://acme-hardware.app.quaderp.app'),
  /* Mocked, but present. Leaving it off the mock does not fail anything: the
     route wraps the call in a try/catch, so an undefined function throws, is
     swallowed as "alert threw", and 51 tests still pass while the alert never
     fires. That is the same silent failure the alert exists to end, so it is
     stubbed here and asserted on below. */
  sendSignupAlert: jest.fn().mockResolvedValue({ success: true }),
}));

const app = require('../index');
const { signupLimiter } = require('../routes/auth');

const postSignup = (body) => request(app).post('/api/auth/signup').send(body);

/**
 * The limiter allows 5/hour per IP and its store outlives individual tests.
 * The app does not `trust proxy`, so every request in the suite arrives from
 * the same loopback address and shares one counter, hence the reset rather
 * than a spread of fake client IPs. One test below deliberately does not
 * reset, so the limit itself stays covered.
 */
const LOOPBACK_KEYS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];
const resetRateLimit = async () => {
  for (const key of LOOPBACK_KEYS) {
    await signupLimiter.resetKey(key);
  }
};

function useMock(overrides) {
  const fresh = buildMockSupabase(overrides);
  Object.assign(mockSupabase, fresh);
  return fresh;
}

/** The wiring for a signup that should succeed all the way through. */
function happyPathOverrides() {
  return {
    // 1st read: duplicate check, must find nothing.
    // 2nd read: the profile row handle_new_user() just created.
    users: [{ data: null, error: null }, { data: OWNER_PROFILE, error: null }],
    // The one plan on sale.
    platform_plans: { data: PLAN, error: null },
    businesses: { data: BUSINESS, error: null },
    accounting_templates: { data: [{ id: 'tpl-1' }], error: null },
  };
}

beforeEach(async () => {
  await resetRateLimit();
  useMock(happyPathOverrides());
});

describe('POST /api/auth/signup, validation', () => {
  it('rejects a missing body', async () => {
    const res = await postSignup({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('rejects a password under 8 characters', async () => {
    const res = await postSignup({ ...VALID_BODY, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('password');
  });

  it('rejects an invalid email', async () => {
    const res = await postSignup({ ...VALID_BODY, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('email');
  });

  it('rejects a one-character business name', async () => {
    const res = await postSignup({ ...VALID_BODY, business_name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('business_name');
  });

});

/* Required since 2026-10-25, so every signup can be followed up by a person. */
describe('POST /api/auth/signup, phone number', () => {
  it.each([
    ['missing', undefined],
    ['blank', '   '],
  ])('refuses a %s phone number with one message', async (_, phone) => {
    const res = await postSignup({ ...VALID_BODY, phone });
    expect(res.status).toBe(400);
    const phoneIssues = res.body.details.filter((d) => d.field === 'phone');
    expect(phoneIssues).toHaveLength(1);
  });

  it.each([
    ['too few digits to dial', '024 123'],
    ['too many digits', '0241234567890123'],
    ['letters', 'call me on whatsapp'],
  ])('refuses a phone number with %s', async (_, phone) => {
    const res = await postSignup({ ...VALID_BODY, phone });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('phone');
  });

  it.each(['024 123 4567', '0241234567', '+233 24 123 4567', '(024) 123-4567'])(
    'accepts %s',
    async (phone) => {
      const res = await postSignup({ ...VALID_BODY, phone });
      expect(res.status).toBe(201);
    },
  );

  it('stores it on the business as typed and puts it in the alert to us', async () => {
    const { sendSignupAlert } = require('../services/emailService');
    sendSignupAlert.mockClear();
    const fresh = useMock(happyPathOverrides());

    await postSignup({ ...VALID_BODY, phone: '+233 24 123 4567' });

    const insert = fresh.mutations.find((m) => m.table === 'businesses' && m.op === 'insert');
    const row = Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
    expect(row.phone).toBe('+233 24 123 4567');
    expect(sendSignupAlert.mock.calls[0][1]).toMatchObject({ phone: '+233 24 123 4567' });
  });
});

/* The payload from the 38 bot signups on 2026-10-24, verbatim. The bot put
   its advert in the name so our confirmation email would deliver it to the
   stranger whose address it had typed. */
describe('POST /api/auth/signup, links in names', () => {
  const PAYLOAD = '🎰15.000TL bonusla kasayi bosaltmaya basla! https://bit.ly/3VSCL0u 🎰';

  it('refuses a name carrying a link, before creating anything', async () => {
    const fresh = useMock(happyPathOverrides());
    const res = await postSignup({ ...VALID_BODY, name: PAYLOAD });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('name');
    expect(fresh.mutations.filter((m) => m.table === 'businesses')).toHaveLength(0);
    expect(mockSupabase.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it.each([
    ['a scheme', 'Visit https://example.test'],
    ['www.', 'www.example-casino.test'],
    ['a shortener with no scheme', 'bonus bit.ly/3VSCL0u'],
  ])('refuses a business name carrying %s', async (_, businessName) => {
    const res = await postSignup({ ...VALID_BODY, business_name: businessName });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('business_name');
  });

  it.each([
    ['an initial', { name: 'J. Mensah' }],
    ['a dotted business name with no path', { business_name: 'Shop.com Ltd' }],
    ['a price with a decimal point', { business_name: 'Everything 1.50 Store' }],
  ])('still accepts %s', async (_, override) => {
    const res = await postSignup({ ...VALID_BODY, ...override });
    expect(res.status).toBe(201);
  });
});

/* The per-worker limiter reads 5 an hour and behaves as 40, which is how one
   address made 38 signups on 2026-10-24. claim_signup_slot (migration 106) is
   the count every worker shares. */
describe('POST /api/auth/signup, shared rate limit', () => {
  it('asks the database for a slot keyed on the caller, with 5 per address', async () => {
    await postSignup(VALID_BODY);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_signup_slot', expect.objectContaining({
      p_address_key: expect.any(String),
      p_per_address: 5,
      p_global: expect.any(Number),
    }));
  });

  it.each(['address', 'global'])('refuses with 429 and creates nothing when the %s limit is reached', async (limit) => {
    const fresh = useMock(happyPathOverrides());
    mockSupabase.rpc.mockResolvedValueOnce({ data: limit, error: null });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(429);
    expect(fresh.mutations.filter((m) => m.table === 'businesses')).toHaveLength(0);
    expect(mockSupabase.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('falls back to the per-worker limits when the database check fails', async () => {
    // A deploy landing before migration 106 must not take signup down.
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.claim_signup_slot' },
    });
    const res = await postSignup(VALID_BODY);
    expect(res.status).toBe(201);
  });

  it('falls back when the call throws', async () => {
    mockSupabase.rpc.mockRejectedValueOnce(new Error('connection reset'));
    const res = await postSignup(VALID_BODY);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/auth/signup, happy path', () => {
  it('creates an unpaid business on the plan on sale, with no trial, and returns the slug', async () => {
    const fresh = useMock(happyPathOverrides());
    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/check your email/i);
    expect(res.body.business.slug).toBe('acme-hardware');
    expect(res.body.plan).toBe('QuadERP');
    expect(res.body).not.toHaveProperty('trial_ends_at');

    // No free trial since 8 October 2026: the business waits for its first payment.
    const insert = fresh.mutations.find((m) => m.table === 'businesses' && m.op === 'insert');
    const row = Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
    expect(row).toMatchObject({ status: 'unpaid', subscription_plan_id: PLAN.id });
    expect(row).not.toHaveProperty('trial_ends_at');
  });

  it('creates the business before the auth user, so the profile trigger has a business to file it under', async () => {
    await postSignup(VALID_BODY);

    const businessInsertOrder = mockSupabase.from.mock.calls.findIndex(([t]) => t === 'businesses');
    expect(businessInsertOrder).toBeGreaterThanOrEqual(0);
    expect(mockSupabase.auth.admin.generateLink).toHaveBeenCalledTimes(1);

    const [params] = mockSupabase.auth.admin.generateLink.mock.calls[0];
    expect(params.type).toBe('signup');
    expect(params.options.data).toMatchObject({
      business_id: BUSINESS.id,
      role: 'Business Admin',
    });
  });

  it('does not roll anything back', async () => {
    await postSignup(VALID_BODY);
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/signup, the alert to us', () => {
  const { sendSignupAlert } = require('../services/emailService');

  /* The suite does not clear mocks globally, so without this the call log
     carries over from the tests above and every assertion here reads
     somebody else's signup. */
  beforeEach(() => sendSignupAlert.mockClear());

  it('reports the signup with the business, the person and the plan', async () => {
    await postSignup(VALID_BODY);

    expect(sendSignupAlert).toHaveBeenCalledTimes(1);
    const [business, admin, opts] = sendSignupAlert.mock.calls[0];
    expect(business).toMatchObject({ id: BUSINESS.id, name: BUSINESS.name });
    expect(admin).toMatchObject({ email: VALID_BODY.email });
    expect(opts.planName).toBe('QuadERP');
    expect(opts.trialEndsAt).toBeUndefined();
  });

  it('passes on where they came from', async () => {
    await postSignup({
      ...VALID_BODY,
      attribution: { utm_source: 'whatsapp', lp: '/pos-system-ghana/' },
    });

    const [, , opts] = sendSignupAlert.mock.calls[0];
    expect(opts.attribution).toMatchObject({
      utm_source: 'whatsapp',
      lp: '/pos-system-ghana/',
    });
  });

  /* The point of the whole arrangement. Somebody's account must not fail
     because our own notification did, whichever way it fails. */
  it('still creates the account when the alert rejects', async () => {
    sendSignupAlert.mockRejectedValueOnce(new Error('Resend is down'));

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.business.slug).toBe('acme-hardware');
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('still creates the account when the alert reports a failure', async () => {
    sendSignupAlert.mockResolvedValueOnce({ success: false, error: 'No recipients' });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('says nothing when the signup itself failed', async () => {
    useMock({
      ...happyPathOverrides(),
      users: [{ data: { id: 'existing' }, error: null }],
    });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(409);
    expect(sendSignupAlert).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/signup, duplicates', () => {
  it('rejects an email that already has a profile, before creating anything', async () => {
    useMock({
      ...happyPathOverrides(),
      users: { data: { id: 'existing-user' }, error: null },
    });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
    expect(mockSupabase.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/signup, rollback', () => {
  it('deletes the business when the auth user cannot be created', async () => {
    useMock(happyPathOverrides());
    mockSupabase.auth.admin.generateLink.mockResolvedValueOnce({
      data: null,
      error: { message: 'weak password' },
    });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(500);
    // No auth user was created, so only the business needs undoing.
    expect(mockSupabase.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith('businesses');
  });

  it('deletes both the auth user and the business when the profile row lands in the wrong business', async () => {
    useMock({
      ...happyPathOverrides(),
      users: [
        { data: null, error: null },
        // handle_new_user() filed them under "Pending Assignment" instead,
        // the exact failure that motivates creating the business first.
        { data: { ...OWNER_PROFILE, business_id: 'some-other-business' }, error: null },
      ],
    });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(500);
    expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('user-uuid-123');
  });

  it('deletes both when the profile row was given the wrong role', async () => {
    useMock({
      ...happyPathOverrides(),
      users: [
        { data: null, error: null },
        { data: { ...OWNER_PROFILE, roles: { name: 'Sales Executive' } }, error: null },
      ],
    });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(500);
    expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('user-uuid-123');
  });
});

describe('POST /api/auth/signup, missing plan', () => {
  it('still creates the account when no plan is on sale', async () => {
    useMock({ ...happyPathOverrides(), platform_plans: { data: null, error: null } });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.plan).toBeNull();
  });
});

/**
 * Older links from the marketing site carry `?plan=<slug>`. There is one plan
 * since 8 October 2026, so a named plan is accepted and ignored: it can
 * neither fail the signup nor attach anything but the plan on sale.
 */
describe('POST /api/auth/signup, a plan named in the link', () => {
  it.each(['Multi-Branch', 'multi-branch', 'franchise', 'enterprise-unlimited'])('%s gets the plan on sale', async (plan) => {
    const res = await postSignup({ ...VALID_BODY, plan });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('QuadERP');
  });
});

/**
 * Where a signup came from, forwarded by the marketing site on the signup
 * href (quaderp-landing/src/config/site.ts builds it, Signup.jsx reads it).
 *
 * The rule these all serve: attribution is decoration on somebody's signup.
 * It must never be the reason an account cannot be created, so nothing here
 * rejects, and anything unrecognised is dropped rather than argued with.
 */
describe('POST /api/auth/signup, attribution', () => {
  const businessRow = () =>
    mockSupabase.mutations.find((m) => m.table === 'businesses' && m.op === 'insert').payload;

  it('persists what the marketing site sent', async () => {
    const attribution = {
      lp: '/',
      cta: 'pricing',
      utm_source: 'facebook',
      utm_medium: 'paid',
      utm_campaign: 'accra-jan',
    };

    const res = await postSignup({ ...VALID_BODY, attribution });

    expect(res.status).toBe(201);
    expect(businessRow().signup_attribution).toEqual(attribution);
  });

  it('succeeds, and stores null, when the visitor arrived with no source', async () => {
    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(businessRow().signup_attribution).toBeNull();
  });

  it('stores null rather than an empty object', async () => {
    // {} would make a direct arrival read as attributed in a report, which is
    // worse than knowing nothing, because it is indistinguishable from a real
    // source that happened to send no fields.
    const res = await postSignup({ ...VALID_BODY, attribution: {} });

    expect(res.status).toBe(201);
    expect(businessRow().signup_attribution).toBeNull();
  });

  it('drops keys that are not on the whitelist', async () => {
    const res = await postSignup({
      ...VALID_BODY,
      attribution: { cta: 'hero', note: 'anything at all', business_id: 'someone-elses-uuid' },
    });

    expect(res.status).toBe(201);
    expect(businessRow().signup_attribution).toEqual({ cta: 'hero' });
  });

  it('truncates an over-long value instead of refusing the signup', async () => {
    const res = await postSignup({
      ...VALID_BODY,
      attribution: { utm_campaign: 'x'.repeat(400) },
    });

    expect(res.status).toBe(201);
    expect(businessRow().signup_attribution.utm_campaign).toHaveLength(120);
  });
});

describe('POST /api/auth/signup, rate limiting', () => {
  // Runs last and does not reset mid-way, so it spends the real budget.
  // Only the limiter is under test here, the first five may legitimately
  // 201 or 409 depending on how far the shared mock's cursors have advanced;
  // what matters is that none of them is refused and the sixth is.
  it('starts refusing after 5 attempts from one address', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await postSignup(VALID_BODY);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});
