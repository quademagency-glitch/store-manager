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
