/**
 * The four customer-facing email templates had no test at all, because the
 * builders were not exported. That matters more than it looks: an email
 * template fails silently. Nothing throws, no request 500s, no log line
 * appears — the message just arrives at a customer looking wrong, and the only
 * way anyone finds out is if they mention it.
 *
 * These assert the things that break quietly:
 *   - the brand mark is present and points at a URL that is actually served
 *   - blocking images still leaves the word QuadERP readable
 *   - the alert templates keep their own heading, so branding them did not
 *     demote the sentence the customer needs to read
 *   - no `undefined` or unresolved `${...}` leaks into the body
 */
/* emailService requires db/supabase at import, which calls createClient() at
   module scope. On Node 20 — which is what CI runs, and what package.json
   declares as the floor — that constructs a RealtimeClient and throws
   "Node.js 20 detected without native WebSocket support". Node 22+ has a
   native WebSocket, so this suite passed locally and failed in CI. The
   builders are pure string functions and touch no database, so the client is
   mocked away entirely, matching health.test.js and the other suites. */
jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const {
  LOGO_URL,
  senderAddress,
  buildInvoiceHtml,
  buildExpirationWarningHtml,
  buildSuspensionNoticeHtml,
  buildWelcomeHtml,
  buildSignupAlertHtml,
  buildTrialEndingHtml,
} = require('../services/emailService');

const business = { id: 'b1', name: 'Adom Superstore', slug: 'adom', contact_email: 'owner@example.com' };

const invoice = {
  invoice_number: 'INV-0001',
  amount: 450,
  currency: 'GHS',
  status: 'paid',
  created_at: '2026-09-02T00:00:00.000Z',
  description: 'Multi-Branch monthly',
  payment_method: 'paystack',
};

const subscription = { current_period_end: '2026-09-30T00:00:00.000Z' };

const TEMPLATES = {
  invoice: () => buildInvoiceHtml(invoice, business, 'Multi-Branch'),
  expirationWarning: () => buildExpirationWarningHtml(business, subscription, 3),
  suspensionNotice: () => buildSuspensionNoticeHtml(business),
  welcome: () => buildWelcomeHtml(business, 'Kofi', 'kofi@example.com', {
    setPasswordUrl: 'https://app.quaderp.app/update-password?token=x',
    loginUrl: 'https://adom.app.quaderp.app',
    planName: 'Multi-Branch',
  }),

  signupAlert: () => buildSignupAlertHtml(business, { name: 'Kofi', email: 'kofi@example.com' }, {
    planName: 'Multi-Branch',
    trialEndsAt: '2026-10-08T00:00:00.000Z',
    attribution: { utm_source: 'whatsapp', lp: '/pos-system-ghana/' },
  }),
  trialEnding: () => buildTrialEndingHtml(business, {
    daysLeft: 3,
    trialEndsAt: '2026-10-08T00:54:00.000Z',
  }),
};

describe('email templates', () => {
  describe.each(Object.keys(TEMPLATES))('%s', (name) => {
    const html = TEMPLATES[name]();

    it('renders a non-empty document', () => {
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(500);
    });

    it('carries the QuadERP mark', () => {
      expect(html).toContain(LOGO_URL);
      expect(html).toMatch(/<img[^>]+email-logo\.png[^>]*>/);
    });

    it('names QuadERP in text, so a blocked image still identifies the sender', () => {
      // The <img> deliberately has alt="", so the wordmark has to carry it.
      const withoutTags = html.replace(/<[^>]+>/g, ' ');
      expect(withoutTags).toContain('QuadERP');
    });

    it('gives the logo explicit dimensions, which Outlook needs', () => {
      const img = html.match(/<img[^>]+email-logo\.png[^>]*>/)[0];
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    });

    it('does not lay the header out with flex, which Outlook ignores', () => {
      expect(html).not.toMatch(/display\s*:\s*flex/);
    });

    it('leaks no undefined or unresolved template expression', () => {
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('${');
      expect(html).not.toContain('[object Object]');
    });
  });

  /* This one is not like the others. Every string in it came off a public
     form, and it is delivered to us rather than to a customer, so a payload
     in a business name executes in our own mail client. */
  describe('signup alert', () => {
    it('escapes markup in the fields a stranger controls', () => {
      const html = buildSignupAlertHtml(
        { name: '<script>alert(1)</script>' },
        { name: '<img src=x onerror=alert(2)>', email: '"><b>x</b>' },
        { planName: 'Single Branch' },
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(2)>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    });

    it('shows where they came from when the landing page said', () => {
      const html = buildSignupAlertHtml(business, { name: 'Kofi', email: 'k@e.com' }, {
        attribution: { utm_source: 'whatsapp', lp: '/pos-system-ghana/' },
      });

      expect(html).toContain('whatsapp');
      expect(html).toContain('/pos-system-ghana/');
    });

    it('says so plainly when it does not know where they came from', () => {
      const html = buildSignupAlertHtml(business, { name: 'Kofi', email: 'k@e.com' }, {});
      expect(html).toMatch(/Nothing recorded/i);
    });

    it('survives an attribution value that is not an object', () => {
      // signup_attribution is JSONB, so a bad row could hold anything at all.
      for (const bad of [null, undefined, 'utm_source=x', 42, ['a']]) {
        expect(() => buildSignupAlertHtml(business, { name: 'K' }, { attribution: bad })).not.toThrow();
      }
    });

    it('renders with nothing but a business name, which is the least the route can pass', () => {
      const html = buildSignupAlertHtml({ name: 'Adom' }, {}, {});
      expect(html).toContain('Adom');
      expect(html).not.toContain('undefined');
    });
  });

  /* The paid-subscription warning got its wording wrong, and nothing caught
     it because nothing read it against the Terms. This one is read against
     them: 6.1 no card taken, 6.3 no automatic charge and no deletion, 9.2
     access narrows to sign-in, billing and export and is never locked. */
  describe('trial ending reminder', () => {
    const html = buildTrialEndingHtml(business, { daysLeft: 3, trialEndsAt: '2026-10-08T00:54:00.000Z' });
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    it('says when, in days and as a date', () => {
      expect(text).toMatch(/3 days/);
      expect(text).toMatch(/8 October 2026/);
    });

    it('says what the Terms promise about the end of a trial', () => {
      expect(text).toMatch(/Nothing will be charged/i);
      expect(text).toMatch(/not deleted/i);
      expect(text).toMatch(/still sign in/i);
      expect(text).toMatch(/export/i);
    });

    it('does not say what the paid-subscription warning wrongly says', () => {
      expect(text).not.toMatch(/won.t be able to log in|locked out|paused/i);
      expect(text).not.toMatch(/renew/i);
      expect(text).not.toMatch(/\b(we|you) will be charged|charge your card|automatically charged/i);
    });

    it('sends the reader to billing on their own subdomain', () => {
      expect(html).toContain('https://adom.app.quaderp.app/business-admin/billing');
    });

    it('names no price, which lives on the landing page and has drifted before', () => {
      expect(text).not.toMatch(/GHS|GH₵|₵|\d+\s*\/\s*mo/i);
    });

    it('escapes the business name, which came off the public signup form', () => {
      const evil = buildTrialEndingHtml({ name: '<img src=x onerror=alert(1)>', slug: 's' }, { daysLeft: 2 });
      expect(evil).not.toContain('<img src=x onerror=alert(1)>');
      expect(evil).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('never says zero days, and never renders NaN', () => {
      expect(buildTrialEndingHtml(business, { daysLeft: 0 })).toMatch(/ends in 1 day\b/);
      expect(buildTrialEndingHtml(business, {})).not.toContain('NaN');
    });
  });

  it('keeps the urgency heading on the alert templates', () => {
    // Branding these must not demote the sentence the customer needs to read,
    // so the mark goes above the heading rather than replacing it.
    expect(buildExpirationWarningHtml(business, subscription, 3))
      .toContain('Subscription Expiring Soon');
    expect(buildSuspensionNoticeHtml(business)).toContain('Account Suspended');
  });

  it('serves the mark from a host the CSP and the landing site both allow', () => {
    expect(LOGO_URL).toMatch(/^https:\/\/www\.quaderp\.app\//);
  });

  it('sends from a quaderp.app address', () => {
    // quaderp.com is not a registered domain; it was the default until
    // 2026-09-02 and was printed on invoices and the legal pages.
    expect(senderAddress()).toMatch(/@quaderp\.app>$/);
    expect(senderAddress()).not.toContain('quaderp.com');
  });
});
