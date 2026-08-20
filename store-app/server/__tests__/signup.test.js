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

const PLAN = { id: 'plan-uuid-single', name: 'Single Branch' };
const PLAN_MULTI = { id: 'plan-uuid-multi', name: 'Multi-Branch' };
const BUSINESS = {
  id: 'biz-uuid-new',
  name: 'Acme Hardware',
  slug: 'acme-hardware',
  status: 'trialing',
  trial_ends_at: '2026-09-01T00:00:00.000Z',
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
    // A list, not a row: the route reads every self-service plan and picks,
    // so that `?plan=multi-branch` from the pricing table can be honoured.
    platform_plans: { data: [PLAN, PLAN_MULTI], error: null },
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

  it('treats phone as optional', async () => {
    const res = await postSignup(VALID_BODY);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/auth/signup, happy path', () => {
  it('creates a trialing business with a 30-day trial and returns the slug', async () => {
    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/check your email/i);
    expect(res.body.business.slug).toBe('acme-hardware');
    expect(res.body.plan).toBe('Single Branch');

    const daysOfTrial = (new Date(res.body.trial_ends_at) - Date.now()) / 86_400_000;
    expect(daysOfTrial).toBeGreaterThan(29.9);
    expect(daysOfTrial).toBeLessThan(30.1);
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
  it('still creates the trial when the Single Branch plan is not configured', async () => {
    useMock({ ...happyPathOverrides(), platform_plans: { data: null, error: null } });

    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.plan).toBeNull();
    expect(res.body.trial_ends_at).toBeTruthy();
  });
});

/**
 * The tier a visitor picks on the pricing table travels as `?plan=<slug>` and
 * has to survive the trip. It used to be dropped entirely: every tier linked
 * to a bare /signup and the page hardcoded Single Branch, so anyone choosing
 * Multi-Branch was quietly signed up for the cheaper plan.
 */
describe('POST /api/auth/signup, plan selection', () => {
  it('attaches the requested plan', async () => {
    const res = await postSignup({ ...VALID_BODY, plan: 'Multi-Branch' });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('Multi-Branch');
  });

  it('accepts the slug form the marketing site sends', async () => {
    const res = await postSignup({ ...VALID_BODY, plan: 'multi-branch' });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('Multi-Branch');
  });

  it('defaults to Single Branch when no plan is named', async () => {
    const res = await postSignup(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('Single Branch');
  });

  it('falls back rather than failing when the plan is not recognised', async () => {
    const res = await postSignup({ ...VALID_BODY, plan: 'enterprise-unlimited' });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('Single Branch');
  });

  /* /signup is unauthenticated, so the query string is attacker-controlled.
     Franchise is quoted by hand and never offered self-service; editing a URL
     must not hand somebody its limits for thirty days.

     This asserts the half that is testable here: a plan the query did not
     return cannot be attached, however the URL asks for it. The other half is
     the `.in(SELF_SERVICE_PLANS)` filter that keeps Franchise out of that
     result in the first place, and the shared mock cannot check it, it
     ignores filter arguments and replays whatever fixture it was given, so
     adding a Franchise row here would prove the mock's behaviour, not the
     route's. */
  it('will not attach a plan outside the self-service list', async () => {
    const res = await postSignup({ ...VALID_BODY, plan: 'franchise' });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('Single Branch');
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
