import { useState, useMemo, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { postPublic } from '../lib/api';

/**
 * Mirror of the server's slug rule (public.slugify, migration 058) so the
 * preview under the business-name field matches what the account will
 * actually get. The server stays authoritative, it also has to de-duplicate
 * against every existing slug, which the browser cannot see, so a signup for
 * a name already taken lands on `acme-2` and the success screen shows that,
 * not this guess.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TRIAL_DAYS = 30;

/**
 * The tiers the marketing site can send here, via `/signup?plan=multi-branch`
 * (see quaderp-landing/src/config/site.ts, which builds the slug from the same
 * rule as slugify above).
 *
 * This map is a label, not a decision. The API re-resolves the plan name
 * against platform_plans and is the only thing that decides what gets
 * attached, so a stale entry here can show the wrong blurb, it cannot put
 * anyone on the wrong plan. Franchise is deliberately absent: it is quoted by
 * hand and the pricing table routes it to sales, not to this form.
 */
const PLANS = {
  'single-branch': {
    name: 'Single Branch',
    detail: 'One location with up to 3 POS terminals, plus inventory, customers and financials.',
  },
  'multi-branch': {
    name: 'Multi-Branch',
    detail: 'Up to 5 locations with unlimited POS terminals, loss-prevention alerts and cross-branch transfers.',
  },
};

/**
 * What the marketing site forwards about where a visitor came from.
 *
 * Kept as a closed list, mirroring the Zod schema in server/routes/auth.js,
 * so a query string cannot smuggle arbitrary keys into the payload. The
 * server whitelists and caps these again; this copy exists so we do not send
 * junk in the first place, not as the check that matters.
 *
 * `lp` is the landing page, `cta` the control that was clicked, `ref` the
 * referring hostname when the visit carried no campaign tags.
 */
const ATTRIBUTION_KEYS = [
  'lp', 'cta', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref',
];

const ATTRIBUTION_KEY = 'qerp_attr';

export default function Signup() {
  const { isAuthenticated, isDemo, signOut, loading } = useAuthContext();
  const [searchParams] = useSearchParams();

  /* The tier the link named, when we recognise it. hasOwn rather than a bare
     lookup, or `?plan=constructor` renders a tier called "Object".

     A missing or unrecognised plan resolves to null now, where it used to
     fall back to the cheapest tier. Nav, the mobile drawer and the hero all
     link here deliberately without one, because a visitor who has not opened
     the pricing table has not chosen anything, and the fallback was telling
     every one of them they had picked Single Branch, five-branch prospects
     included. Null means "not chosen yet", and the chooser below asks. */
  const planKey = searchParams.get('plan');
  const linkedPlanKey = planKey && Object.hasOwn(PLANS, planKey) ? planKey : null;

  /* Seeded from the link, then owned by the visitor.
     Deliberately not written back to the URL when they change it: the query
     string is the record of where they arrived from and what they were first
     shown, which is what attribution reads. The payload below sends this
     state, never the param, so the two cannot disagree. */
  const [chosenPlanKey, setChosenPlanKey] = useState(linkedPlanKey);
  const plan = chosenPlanKey ? PLANS[chosenPlanKey] : null;

  /* Where this visitor came from, put on the href by the marketing site.
     Read once on mount and kept in sessionStorage, because the params only
     exist on the URL we were opened with: the demo sign-out effect below
     navigates, and any bounce through /login would drop them. The server
     caps and whitelists these again, so this is convenience, not a
     boundary. */
  const attribution = useMemo(() => {
    const stored = (() => {
      try {
        return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
      } catch {
        return null;
      }
    })();

    const fromUrl = {};
    for (const key of ATTRIBUTION_KEYS) {
      const value = searchParams.get(key);
      if (value) fromUrl[key] = value.slice(0, 120);
    }

    /* The URL wins when it says anything. Landing on /signup a second time
       with fresh campaign tags should not report the first visit's source. */
    const resolved = Object.keys(fromUrl).length > 0 ? fromUrl : stored;
    if (resolved && Object.keys(resolved).length > 0) {
      try {
        sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(resolved));
      } catch {
        /* Private mode, or storage full. Attribution is not worth a crash. */
      }
      return resolved;
    }
    return null;
  }, [searchParams]);

  const [form, setForm] = useState({
    business_name: '',
    name: '',
    email: '',
    password: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const slugPreview = useMemo(() => slugify(form.business_name), [form.business_name]);

  /* Someone arriving here from inside the sandbox is signed in, and the
     redirect below would bounce them straight back to the demo, making
     "Start your free trial", the single most important link in the whole
     demo, do nothing at all.

     Handled here rather than in the banner that prompted it, because ending
     the session there loses a race: signOut unmounts MainLayout, and
     ProtectedRoute's redirect to /login lands before the banner's own
     navigate does. Signing out from the destination has no such race, and it
     also covers a bookmarked /signup or a link shared out of the demo. */
  useEffect(() => {
    if (isDemo && isAuthenticated) signOut();
  }, [isDemo, isAuthenticated, signOut]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
      </div>
    );
  }

  // A demo session is on its way out via the effect above; hold the form
  // rather than bouncing them to the dashboard they just chose to leave.
  if (isAuthenticated && !isDemo) {
    return <Navigate to="/" replace />;
  }

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!plan) {
      setError('Please choose a plan to start your trial.');
      return;
    }
    if (!form.business_name.trim() || !form.name.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in your business name, your name, email and a password.');
      return;
    }
    if (form.password.length < 8) {
      setError('Your password needs to be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await postPublic('/auth/signup', {
        business_name: form.business_name.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        // What the card above actually shows, not the raw query param, so the
        // label and the plan attached can never disagree. Non-null by the
        // check at the top of this function.
        plan: plan.name,
        // Omitted entirely when there is nothing to say, so the server can
        // tell "arrived with no source" apart from "arrived with an empty one".
        ...(attribution ? { attribution } : {}),
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="login-page">
        <div className="login-bg-orb login-bg-orb-1"></div>
        <div className="login-bg-orb login-bg-orb-2"></div>
        <div className="login-bg-orb login-bg-orb-3"></div>

        <div className="login-container">
          <div className="login-card signup-card">
            <div className="signup-success">
              <div className="signup-success-icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M2.5 7L11 12.5a2 2 0 0 0 2 0L21.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <h1 className="login-title">Check your email</h1>
              {/* What the link actually does: the server generates it with
                  redirectTo pointing at this app's /login, supabase.js is
                  configured with detectSessionInUrl, and Login.jsx sends an
                  authenticated visitor to the dashboard. So it signs them in
                  in one click. The old copy sent them looking for a sign-in
                  form they would never be shown, and the second sentence is
                  there for the case where the redirect target is not on
                  Supabase's allow list and they do land on one.

                  It does NOT verify the address, whatever the word
                  "confirmation" suggests. The project has mailer_autoconfirm
                  on, so the account is already confirmed before the email is
                  sent: measured confirmation timestamps land 3 to 50
                  milliseconds after account creation, which is nobody
                  clicking anything. Saying "verifies your address" was
                  telling the owner a check had happened that had not. The
                  wording below is true whether or not that setting changes,
                  so flipping it does not silently make this a lie again. */}
              <p className="login-subtitle">
                We&rsquo;ve sent a sign-in link to <strong>{form.email.trim()}</strong>. Opening it
                takes you straight to your dashboard. If you are asked to sign in, use the
                password you just chose.
              </p>

              <dl className="signup-summary">
                <div>
                  <dt>Business</dt>
                  <dd>{result.business?.name || form.business_name}</dd>
                </div>
                {result.business?.login_url && (
                  <div>
                    <dt>Your sign-in link</dt>
                    <dd>
                      <a href={result.business.login_url}>{result.business.login_url.replace(/^https?:\/\//, '')}</a>
                    </dd>
                  </div>
                )}
                {result.plan && (
                  <div>
                    <dt>Plan</dt>
                    <dd>{result.plan}</dd>
                  </div>
                )}
                {result.trial_ends_at && (
                  <div>
                    <dt>Trial ends</dt>
                    <dd>
                      {new Date(result.trial_ends_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </dd>
                  </div>
                )}
              </dl>

              <p className="signup-success-note">
                Nothing in your inbox after a few minutes? Check your spam folder. The message comes from
                QuadERP.
              </p>

              <Link to="/login" className="login-button signup-success-action">
                Go to sign in
              </Link>

              {/* The wait for an email was a dead end, on the one screen where
                  interest is highest. The sandbox is already built and needs no
                  account, so it costs nothing to offer here. */}
              <p className="signup-success-sandbox">
                Rather not wait? <Link to="/login?demo=1">Open the sandbox</Link>, a full copy of
                QuadERP with a shop&rsquo;s worth of data already in it. Nothing you do there touches
                the business you just created.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1"></div>
      <div className="login-bg-orb login-bg-orb-2"></div>
      <div className="login-bg-orb login-bg-orb-3"></div>

      <div className="login-container signup-container">
        <div className="login-card signup-card">
          <div className="login-header">
            <div className="login-logo">
              <svg width="40" height="40" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="signup-logo-bg" x1="60" y1="40" x2="470" y2="480" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#241E5E" /><stop offset="0.52" stopColor="#171244" /><stop offset="1" stopColor="#0D0A28" /></linearGradient>
                  <linearGradient id="signup-logo-ring" x1="120" y1="120" x2="392" y2="392" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#6366F1" /><stop offset="0.5" stopColor="#4F7BF6" /><stop offset="1" stopColor="#22D3EE" /></linearGradient>
                  <linearGradient id="signup-logo-b1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#4338CA" /><stop offset="1" stopColor="#4F46E5" /></linearGradient>
                  <linearGradient id="signup-logo-b2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#5560F0" /><stop offset="1" stopColor="#6366F1" /></linearGradient>
                  <linearGradient id="signup-logo-b3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#22D3EE" /><stop offset="1" stopColor="#3FE3F2" /></linearGradient>
                </defs>
                <rect width="512" height="512" rx="118" fill="url(#signup-logo-bg)" />
                <circle cx="256" cy="248" r="150" fill="none" stroke="url(#signup-logo-ring)" strokeWidth="30" />
                <line x1="332" y1="324" x2="392" y2="384" stroke="#0D0A28" strokeWidth="70" strokeLinecap="round" />
                <line x1="332" y1="324" x2="390" y2="382" stroke="#34E0F0" strokeWidth="42" strokeLinecap="round" />
                <rect x="186" y="326" width="150" height="20" rx="10" fill="url(#signup-logo-ring)" />
                <rect x="198" y="274" width="30" height="52" rx="11" fill="url(#signup-logo-b1)" />
                <rect x="246" y="240" width="30" height="86" rx="11" fill="url(#signup-logo-b2)" />
                <rect x="294" y="206" width="30" height="120" rx="11" fill="url(#signup-logo-b3)" />
              </svg>
            </div>
            <h1 className="login-title">Start your free trial</h1>
            <p className="login-subtitle">Set up Quad<span className="brand-erp">ERP</span> for your business in under a minute.</p>
          </div>

          {plan ? (
            <div className="signup-plan-card">
              <div className="signup-plan-head">
                <span className="signup-plan-name">{plan.name}</span>
                <span className="signup-plan-badge">{TRIAL_DAYS}-day free trial</span>
              </div>
              <p className="signup-plan-detail">
                {plan.detail} No card needed. We&rsquo;ll only ask when the trial ends.
              </p>
              <button
                type="button"
                className="signup-plan-change"
                onClick={() => setChosenPlanKey(null)}
              >
                Choose a different plan
              </button>
            </div>
          ) : (
            <fieldset className="signup-plan-choice">
              <legend className="signup-plan-choice-legend">
                <span>Choose your plan</span>
                <span className="signup-plan-badge">{TRIAL_DAYS}-day free trial</span>
              </legend>

              <div className="signup-plan-options">
                {Object.entries(PLANS).map(([key, option]) => (
                  <label key={key} className="signup-plan-option">
                    <input
                      type="radio"
                      name="plan"
                      value={key}
                      checked={chosenPlanKey === key}
                      onChange={() => setChosenPlanKey(key)}
                      className="signup-plan-option-input"
                    />
                    <span className="signup-plan-option-body">
                      <span className="signup-plan-name">{option.name}</span>
                      <span className="signup-plan-detail">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              <p className="signup-plan-choice-note">
                Either one is {TRIAL_DAYS} days free with no card, and you can move between
                them later. Running more than five locations?{' '}
                <a href="mailto:info@quaderp.app?subject=Franchise%20Plan%20Inquiry">
                  Ask us about Franchise
                </a>
                .
              </p>
            </fieldset>
          )}

          <form onSubmit={handleSubmit} className="login-form" id="signup-form">
            {error && (
              <div className="login-error" id="signup-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="signup-business" className="login-label">Business name</label>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2.25 15.75V6.75L9 2.25L15.75 6.75V15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6.75 15.75V10.5H11.25V15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  id="signup-business"
                  type="text"
                  value={form.business_name}
                  onChange={update('business_name')}
                  placeholder="Acme Hardware"
                  className="login-input"
                  autoComplete="organization"
                  disabled={submitting}
                />
              </div>
              {slugPreview && (
                <p className="signup-slug-preview">
                  Your team will sign in at <strong>{slugPreview}.app.quaderp.app</strong>
                </p>
              )}
            </div>

            <div className="signup-field-row">
              <div className="login-field">
                <label htmlFor="signup-name" className="login-label">Your full name</label>
                <div className="login-input-wrapper">
                  <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3.75 15.75C3.75 12.8505 6.10051 10.5 9 10.5C11.8995 10.5 14.25 12.8505 14.25 15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    id="signup-name"
                    type="text"
                    value={form.name}
                    onChange={update('name')}
                    placeholder="Ama Mensah"
                    className="login-input"
                    autoComplete="name"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="signup-phone" className="login-label">
                  Phone <span className="signup-optional">optional</span>
                </label>
                <div className="login-input-wrapper">
                  <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 4.5C3 3.67 3.67 3 4.5 3H6L7.5 6.75L6 7.875C6.64 9.2 7.8 10.36 9.125 11L10.25 9.5L14 11V12.5C14 13.33 13.33 14 12.5 14C7.253 14 3 9.747 3 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  <input
                    id="signup-phone"
                    type="tel"
                    value={form.phone}
                    onChange={update('phone')}
                    placeholder="024 123 4567"
                    className="login-input"
                    autoComplete="tel"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="signup-email" className="login-label">Email address</label>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2.25 5.25L8.16 9.015C8.68 9.345 9.32 9.345 9.84 9.015L15.75 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2.25" y="3.75" width="13.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <input
                  id="signup-email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  placeholder="you@example.com"
                  className="login-input"
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="signup-password" className="login-label">Password</label>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="3.75" y="8.25" width="10.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8.25V5.25C6 3.59315 7.34315 2.25 9 2.25C10.6569 2.25 12 3.59315 12 5.25V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="At least 8 characters"
                  className="login-input"
                  autoComplete="new-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2.25 2.25L15.75 15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M7.5 3.816A7.5 7.5 0 0115.75 9c-.458.915-1.095 1.727-1.87 2.386M3.87 6.614A7.5 7.5 0 002.25 9a7.5 7.5 0 006.75 4.184" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M10.59 10.59a2.25 2.25 0 01-3.18-3.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2.25 9C3.35 6.15 5.95 4.5 9 4.5C12.05 4.5 14.65 6.15 15.75 9C14.65 11.85 12.05 13.5 9 13.5C5.95 13.5 3.35 11.85 2.25 9Z" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-button" id="signup-submit" disabled={submitting}>
              {submitting ? (
                <span className="login-button-loading">
                  <span className="login-button-spinner"></span>
                  Creating your account...
                </span>
              ) : (
                `Start ${TRIAL_DAYS}-day free trial`
              )}
            </button>

            {/* Sign-up is the moment consent is given, so the terms have to be
                reachable from here rather than only from the marketing footer. */}
            <p className="signup-legal-note">
              By creating an account you agree to our{' '}
              <Link to="/terms">Terms of Service</Link>, our{' '}
              <Link to="/privacy">Privacy Policy</Link> and the{' '}
              <Link to="/dpa">Data Processing Agreement</Link>.
            </p>
          </form>

          <div className="login-footer signup-footer">
            <p>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
