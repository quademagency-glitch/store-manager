const express = require('express');
const logger = require('../utils/logger');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { seedAccountingTemplates } = require('../services/accountingTemplateSeeder');
const { sendBusinessWelcomeEmail, resolveBusinessLoginUrl } = require('../services/emailService');
// From config/demo.js, not the seeder: importing these from
// scripts/seed-demo-data.js pulled `pg` into the boot path and the API failed
// to start in production. See the note in that file.
const { DEMO_EMAIL, DEMO_PASSWORD, isDemoEnabled } = require('../config/demo');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');

// How long a self-service free trial lasts. Deliberately not read from the
// plan's `trial_days` (currently 7 across the board), that column drives
// operator-assigned subscriptions, and the public offer is 30 days.
const TRIAL_DAYS = 30;
const DEFAULT_SIGNUP_PLAN = 'Single Branch';

/**
 * Tiers the public signup form may attach, by platform_plans.name.
 *
 * An allowlist rather than "whatever the caller asked for", because /signup is
 * unauthenticated and the plan row carries real limits (max_locations,
 * max_users). The marketing site's third tier is quoted by hand and routes to
 * sales; a guessed `?plan=franchise` must not hand somebody unlimited
 * locations for thirty days just because they edited a URL.
 */
const SELF_SERVICE_PLANS = ['Single Branch', 'Multi-Branch'];

/**
 * Mirror of public.slugify (migration 058), matching the client's copy in
 * Signup.jsx and the marketing site's in config/site.ts. Lets `Multi-Branch`
 * arrive as `multi-branch` without a slug→name table that has to be edited
 * every time an operator renames a plan.
 */
function planSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The account being attempted, lowercased, as the throttling key.
 *
 * WHY NOT req.ip: the SPA reaches this API through Vercel's rewrite of
 * /api/*, and req.ip does not survive it. Measured against production on
 * 2026-08-21, a request from 154.163.174.227 arrived with
 * x-forwarded-for: 15.240.64.77, 152.233.29.1, Vercel's egress and Railway's
 * edge, and as 13.247.245.82 on the retry. Express derives req.ip from that
 * header, so on this route it is not a person, it is whichever Vercel node
 * relayed the call, and a handful of those serve everybody.
 *
 * The address is NOT lost, and an earlier version of this comment said it was.
 * Vercel does pass it, as `x-vercel-forwarded-for: 154.163.174.227` and in the
 * RFC 7239 `forwarded` header; Railway's edge simply rewrites x-forwarded-for
 * rather than appending to it, so Express never sees it. That is worth knowing
 * because signupLimiter below still keys on req.ip and has the same problem,
 * and it can only be fixed by reading one of those headers. Worth being
 * careful about for the same reason: the Railway host is publicly reachable,
 * so anyone calling it directly can put whatever they like in them, and a
 * limiter that trusts them unconditionally is weaker than one that does not.
 *
 * None of which changes the key here. Even with a trustworthy address, the
 * account is the better thing to count for a login.
 *
 * "10 per IP per 15 minutes" was therefore close to 10 for the whole platform.
 * On a busy morning the eleventh person to sign in got "Too many login
 * attempts", blaming them for ten strangers' logins. This is the same
 * platform-wide-bucket bug that `app.set('trust proxy')` was added to fix,
 * reintroduced further upstream by the routing rather than by the server.
 *
 * Keying on the email restores what the limit is for: bounding guesses against
 * one account. Twenty cashiers signing in get twenty budgets. Someone spraying
 * many different accounts is not bounded here and never was, that is the
 * general /api limiter's job.
 *
 * Normalised, or the same account under a different case would be a fresh
 * budget. Falls back to the address when there is no usable email, which means
 * a malformed body, since a real login always carries one.
 */
function loginKey(req) {
  const email = req.body?.email;
  return typeof email === 'string' && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : rateLimit.ipKeyGenerator(req.ip);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed attempts per account per window
  keyGenerator: loginKey,
  // Only failures count. Signing in successfully is not the thing worth
  // rationing, and counting it means a shared till that legitimately logs in
  // and out all morning throttles itself. A wrong password returns 401 and a
  // suspended account 403, so both still count.
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Signup creates a business, an auth user and a mailbox hit, so it is far
// more expensive than a login attempt and correspondingly tighter.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many signup attempts from this address. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser than signup: starting the demo creates nothing and sends no email,
// so the only thing worth throttling is somebody hammering Supabase sign-in.
const demoLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many demo sessions from this address. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role_id: z.string().uuid('Invalid role ID'),
});

/* One attribution field. Truncates instead of rejecting, deliberately.
   These values are decoration on somebody's signup, and a marketing team
   pasting a 200-character campaign tag must never be the reason a real
   customer cannot create an account. Rejecting would turn a reporting
   nicety into an outage for whoever clicked that ad. */
const attributionValue = z.string().trim().transform((value) => value.slice(0, 120));

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Your name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  business_name: z.string().trim().min(2, 'Business name is required').max(120),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  // The tier chosen on the pricing table. Never trusted as-is, see the
  // resolution step in the handler, so an unknown value is not a 400.
  plan: z.string().trim().max(60).optional().or(z.literal('')),
  /* Where the visitor came from, forwarded by the marketing site on the
     signup href. Every field is optional and every field is capped, because
     this arrives from a query string that anyone can edit. Zod strips keys
     that are not listed, so a crafted ?something=... cannot reach the
     database. A bad value must never cost someone their signup, so nothing
     here is required and nothing here rejects. */
  attribution: z
    .object({
      lp: attributionValue,
      cta: attributionValue,
      utm_source: attributionValue,
      utm_medium: attributionValue,
      utm_campaign: attributionValue,
      utm_content: attributionValue,
      utm_term: attributionValue,
      ref: attributionValue,
    })
    .partial()
    .optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/signup
 * Public self-service signup: creates a business on a 30-day free trial plus
 * its owner account, with no Platform Admin involved.
 *
 * Order matters, and it is not the obvious one. The business has to exist
 * first, because `handle_new_user()` (migration 043) fires on every insert
 * into auth.users and reads `business_id` out of the auth metadata to decide
 * where the profile row lands. Create the auth user first and the trigger
 * files them under "Pending Assignment" as a Sales Executive, which is
 * exactly the wrong answer for someone who just created a business.
 *
 * Two other things happen for free as a result of inserting the business,
 * and are deliberately not repeated here:
 *   - the slug (trg_set_business_slug, migration 058)
 *   - the default accounting templates (migration 028), still called
 *     explicitly below, idempotently, so the app notices if that trigger
 *     ever goes away.
 *
 * Access: Public, rate-limited to 5/hour per IP.
 */
router.post('/signup', signupLimiter, validateBody(signupSchema), async (req, res) => {
  const { name, email, password, business_name, phone, plan: requestedPlan, attribution } = req.body;

  // An empty object is the same as none: storing {} would make a row look
  // attributed in a report when nothing was actually known about the visit.
  const signupAttribution =
    attribution && Object.keys(attribution).length > 0 ? attribution : null;

  // Tracked so the catch-all can undo a half-finished signup. A business with
  // no owner is worse than no business at all: it holds the slug, shows up in
  // Platform Admin, and nobody can sign in to it.
  let businessId = null;
  let authUserId = null;

  const rollback = async (reason) => {
    if (authUserId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (error) logger.error({ err: error, authUserId, reason }, 'Signup rollback: could not delete auth user');
    }
    if (businessId) {
      // users/accounting_templates cascade or are orphan-safe; the business row
      // is the one that must not survive, because it owns the slug.
      const { error } = await supabaseAdmin.from('businesses').delete().eq('id', businessId);
      if (error) logger.error({ err: error, businessId, reason }, 'Signup rollback: could not delete business');
    }
  };

  try {
    // ── Reject duplicates before creating anything ──────────────
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        error: 'Email already registered',
        message: 'An account with that email already exists. Try signing in instead.',
      });
    }

    // ── Resolve the plan the trial runs against ─────────────────
    // Not fatal if it is missing: the trial is defined by trial_ends_at, and
    // a business with no plan attached still works. It just shows nothing on
    // the billing page until someone picks one.
    const { data: planRows } = await supabaseAdmin
      .from('platform_plans')
      .select('id, name')
      .in('name', SELF_SERVICE_PLANS)
      .eq('is_active', true);

    const plans = Array.isArray(planRows) ? planRows : [];
    const wanted = planSlug(requestedPlan);
    const plan =
      (wanted && plans.find((p) => planSlug(p.name) === wanted)) ||
      plans.find((p) => p.name === DEFAULT_SIGNUP_PLAN) ||
      null;

    // Worth a line in the log: the caller saw one tier on the pricing table and
    // is getting another, which is exactly the mismatch this parameter exists
    // to stop. Usually means a plan was renamed or deactivated in Platform
    // Admin without the marketing site being updated.
    if (wanted && (!plan || planSlug(plan.name) !== wanted)) {
      logger.warn({ requested: requestedPlan, attached: plan ? plan.name : null },
        'Signup asked for a plan that is not available; fell back');
    }

    if (!plan) {
      logger.warn({ plan: DEFAULT_SIGNUP_PLAN }, 'Signup default plan not found; business will start with no plan');
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. The business (slug + templates come from triggers) ───
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .insert({
        name: business_name,
        status: 'trialing',
        trial_ends_at: trialEndsAt,
        subscription_plan_id: plan ? plan.id : null,
        contact_email: email,
        phone: phone || null,
        signup_attribution: signupAttribution,
      })
      .select('id, name, slug, status, trial_ends_at, subscription_plan_id')
      .single();

    if (businessError || !business) {
      logger.error({ err: businessError, business_name }, 'Signup failed at business creation');
      return res.status(500).json({
        error: 'Signup failed',
        message: 'We could not create your business. Please try again.',
      });
    }
    businessId = business.id;

    // ── 2. The owner's auth account ─────────────────────────────
    // generateLink('signup') both creates the unconfirmed user and hands back
    // the confirmation link in one call, so there is no window where the
    // account exists but we have no way to let them verify it. `data` becomes
    // raw_user_meta_data, which is what handle_new_user() reads.
    const loginUrl = resolveBusinessLoginUrl(business);
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { name, business_id: business.id, role: 'Business Admin' },
        redirectTo: `${loginUrl}/login`,
      },
    });

    if (linkError || !linkData?.user) {
      logger.error({ err: linkError, email }, 'Signup failed at auth user creation');
      await rollback('auth-user-creation');

      // Supabase words duplicate-email rejections clearly enough to pass on.
      const duplicate = /already|exists|registered/i.test(linkError?.message || '');
      return res.status(duplicate ? 409 : 500).json({
        error: 'Signup failed',
        message: duplicate
          ? 'An account with that email already exists. Try signing in instead.'
          : 'We could not create your account. Please try again.',
      });
    }
    authUserId = linkData.user.id;
    const confirmationUrl = linkData.properties?.action_link || null;

    // ── 3. Confirm the trigger did file them correctly ──────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, business_id, role_id, roles:role_id (name)')
      .eq('id', authUserId)
      .maybeSingle();

    if (profileError || !profile || profile.business_id !== business.id || profile.roles?.name !== 'Business Admin') {
      logger.error(
        { email, businessId: business.id, profile, err: profileError },
        'Signup: profile row missing or mis-assigned after auth user creation',
      );
      await rollback('profile-mismatch');
      return res.status(500).json({
        error: 'Signup failed',
        message: 'We could not finish setting up your account. Please try again.',
      });
    }

    // ── 4. Accounting templates (no-op when the trigger got there) ──
    await seedAccountingTemplates(business.id);

    // ── 5. Welcome email. Best-effort: never fail a signup on it ──
    try {
      const result = await sendBusinessWelcomeEmail(
        business,
        { name, email },
        {
          planName: plan ? plan.name : null,
          setPasswordUrl: confirmationUrl,
          ctaMode: 'verify-email',
          trialEndsAt,
        },
      );
      if (!result.success) {
        logger.warn({ email, business: business.name, error: result.error }, 'Signup welcome email not sent');
      }
    } catch (emailErr) {
      logger.error({ err: emailErr, email }, 'Signup welcome email threw (account still created)');
    }

    logger.info({ businessId: business.id, slug: business.slug, email }, 'Self-service signup completed');

    // Unauthenticated route, authGuard hasn't run, so name the actor we just
    // created rather than leaving the row anonymous.
    req.auditActor = { id: authUserId, email, business_id: business.id, role: 'Business Admin' };
    logAuditEvent(req, AUDIT_ACTIONS.SIGNUP, 'business', business.id, {
      business_name: business.name,
      slug: business.slug,
      plan: plan ? plan.name : null,
      attribution: signupAttribution,
    });

    return res.status(201).json({
      message: 'Check your email to verify your account',
      business: { name: business.name, slug: business.slug, login_url: loginUrl },
      trial_ends_at: trialEndsAt,
      plan: plan ? plan.name : null,
    });
  } catch (err) {
    logger.error({ err, email }, 'Signup error');
    await rollback('unexpected-error');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Signup failed. Please try again.',
    });
  }
});

/**
 * POST /api/auth/demo-login
 * Sign a visitor straight into the public sandbox, no signup, no email.
 *
 * The credentials live only on the server. Handing them to the browser to use
 * with signInWithPassword would put a working password for a real Supabase
 * account into the page source, and "it's only the demo account" stops being
 * true the moment someone changes what the demo account can reach.
 *
 * What limits the session is Supabase's own access-token lifetime (one hour by
 * default), this deliberately hands back a refresh token so the client's
 * Supabase instance can hold a normal session, and the sandbox is rebuilt
 * nightly regardless of who is still in it.
 *
 * Access: Public, rate-limited to 20/hour per IP.
 */
router.post('/demo-login', demoLoginLimiter, async (req, res) => {
  try {
    if (!isDemoEnabled()) {
      return res.status(404).json({
        error: 'Not found',
        message: 'The demo is not available right now.',
      });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (error || !data?.session) {
      // Almost always means the demo has not been seeded in this environment.
      logger.error({ err: error }, 'Demo login failed, is the demo business seeded?');
      return res.status(503).json({
        error: 'Demo unavailable',
        message: 'The demo is being rebuilt. Please try again in a minute.',
      });
    }

    // Selects everything the client's fetchRole would otherwise go and fetch
    // for itself. That second round trip used to sit on the critical path of
    // the demo: this endpoint already had the row in hand and returned a
    // subset of it, so the browser paid ~1.6s asking Supabase for what the
    // response could have carried. Keep this SELECT in step with the one in
    // client/src/hooks/useAuth.real.js, both feed the same applyRoleData().
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, status, role_id, business_id, roles:role_id (name, permissions), businesses (name, is_demo, status), user_locations (location_id)')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData || !userData.businesses?.is_demo) {
      // Refusing here matters: without it, pointing DEMO_ACCOUNT_EMAIL at a
      // real account would turn this public, unauthenticated endpoint into a
      // way to sign in as them.
      logger.error({ err: userError, email: DEMO_EMAIL }, 'Demo account is not attached to a demo business');
      return res.status(503).json({
        error: 'Demo unavailable',
        message: 'The demo is being rebuilt. Please try again in a minute.',
      });
    }

    // The client used to reach this conclusion itself, on the strength of the
    // fetchRole round trip we are now skipping. Since the browser will trust
    // this payload, the check has to happen here instead of being dropped.
    if (userData.status === 'banned' || userData.businesses?.status === 'banned') {
      logger.error({ email: DEMO_EMAIL }, 'Demo account or its business is banned');
      return res.status(503).json({
        error: 'Demo unavailable',
        message: 'The demo is being rebuilt. Please try again in a minute.',
      });
    }

    req.auditActor = {
      id: userData.id,
      email: userData.email,
      business_id: userData.business_id,
      role: userData.roles ? userData.roles.name : 'Demo',
    };
    logAuditEvent(req, AUDIT_ACTIONS.DEMO_LOGIN, 'user', userData.id);

    return res.json({
      demo: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role_id: userData.role_id,
        role: userData.roles ? userData.roles.name : 'Unknown',
        permissions: userData.roles ? userData.roles.permissions : [],
        business_name: userData.businesses ? userData.businesses.name : null,
        // Added so the client can seed its session without a second query.
        business_id: userData.business_id || null,
        is_demo: userData.businesses?.is_demo === true,
        location_ids: Array.isArray(userData.user_locations)
          ? userData.user_locations.map((ul) => ul.location_id)
          : [],
      },
    });
  } catch (err) {
    logger.error({ err }, 'Demo login error');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Could not start the demo. Please try again.',
    });
  }
});

/**
 * POST /api/auth/register
 * Create a new user (Supabase Auth + users table).
 * Requires authentication and manager role.
 */
router.post('/register', authGuard, permissionCheck('manage_users'), validateBody(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;

    // ── Create auth user in Supabase ────────────────────
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm so the user can login immediately
      });

    if (authError) {
      // Supabase returns a clear message for duplicates, etc.
      return res.status(400).json({
        error: 'Registration failed',
        message: authError.message,
      });
    }

    // ── Insert profile row in users table ───────────────
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role_id,
      })
      .select('id, name, email, role_id, created_at')
      .single();

    if (userError) {
      // Rollback: remove the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        error: 'Registration failed',
        message: 'Could not create user profile. Auth user rolled back.',
      });
    }

    logAuditEvent(req, AUDIT_ACTIONS.USER_CREATED, 'user', userData?.id, {
      email: userData?.email,
      role_id: userData?.role_id,
    });

    return res.status(201).json({
      message: 'User created successfully.',
      user: userData,
    });
  } catch (err) {
    logger.error({ err: err }, 'Register error:');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed. Please try again.',
    });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password.
 * Returns session data and user role.
 */
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sign in via Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Only safe to record now that trust proxy is set (see index.js): before
      // that, req.ip was the platform edge for every request, so these rows
      // would have been a pile of identical useless addresses. Volume is bounded
      // by loginLimiter. The attempted email is recorded, never the password, // the redactor in utils/auditLog.js would strip it anyway.
      logAuditEvent(req, AUDIT_ACTIONS.LOGIN_FAILED, 'user', null, { attempted_email: email });

      return res.status(401).json({
        error: 'Unauthorized',
        message: error.message || 'Invalid email or password.',
      });
    }

    // Fetch user role from users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id, 
        name, 
        email, 
        role_id,
        roles:role_id (id, name, permissions),
        user_locations(location_id)
      `)
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User account not provisioned. Please contact your manager.',
      });
    }

    // authGuard hasn't run on this route, this IS the login, so req.user
    // doesn't exist yet. auditActor names the identity we just resolved.
    req.auditActor = {
      id: userData.id,
      email: userData.email,
      business_id: userData.business_id,
      role: userData.roles ? userData.roles.name : 'Unknown',
    };
    logAuditEvent(req, AUDIT_ACTIONS.LOGIN, 'user', userData.id);

    return res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role_id: userData.role_id,
        role: userData.roles ? userData.roles.name : 'Unknown',
        permissions: userData.roles ? userData.roles.permissions : [],
        location_ids: userData.user_locations ? userData.user_locations.map(ul => ul.location_id) : [],
      },
    });
  } catch (err) {
    logger.error({ err: err }, 'Login error:');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed. Please try again.',
    });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user.
 * Requires authentication.
 */
router.post('/logout', authGuard, async (req, res) => {
  try {
    // Supabase handles token invalidation on client side.
    // Server-side we can optionally call signOut with the admin client.
    logAuditEvent(req, AUDIT_ACTIONS.LOGOUT, 'user', req.user?.id);

    return res.json({
      message: 'Signed out successfully.',
    });
  } catch (err) {
    logger.error({ err: err }, 'Logout error:');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed.',
    });
  }
});

/**
 * GET /api/auth/me
 * Get the current authenticated user's info and role.
 * Requires authentication.
 */
router.get('/me', authGuard, async (req, res) => {
  try {
    return res.json({
      user: req.user,
    });
  } catch (err) {
    logger.error({ err: err }, 'Get user error:');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user info.',
    });
  }
});

module.exports = router;
// Exposed so tests can clear the per-IP counter between cases. The app is not
// behind `trust proxy`, so every request in a test run shares one key and the
// suite would otherwise spend its whole 5/hour budget on the first few cases, // which is not a reason to weaken the limit for real traffic.
module.exports.signupLimiter = signupLimiter;
