/**
 * Who appears in the To header of a customer-facing email.
 *
 * sendInvoiceEmail, sendExpirationWarning and sendSuspensionNotice each built
 * one list of [customer, PLATFORM_ADMIN_EMAIL] and passed it as `to`, so every
 * customer would have been shown the operator's personal address. It survived
 * because none of the three has ever fired: nobody has paid, so there is no
 * subscription to invoice, warn about or expire. A defect that cannot fire
 * cannot be noticed, which is the argument for asserting it rather than
 * waiting for the first real customer to find it.
 *
 * The operator is bcc'd, not dropped: they still need to know. The disclosure
 * was the bug, not the copy.
 */
process.env.PLATFORM_ADMIN_EMAIL = 'ops@quadem.test';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: (...a) => mockSend(...a) };
      this.batch = { send: (...a) => mockSend(...a) };
    }
  },
}));
jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const {
  sendInvoiceEmail,
  sendExpirationWarning,
  sendSuspensionNotice,
  sendSignupAlert,
} = require('../services/emailService');

const BUSINESS = { id: 'b1', name: 'Acme Hardware', slug: 'acme', contact_email: 'owner@acme.test' };
const SUBSCRIPTION = { current_period_end: '2026-10-01T00:00:00.000Z' };
const INVOICE = {
  invoice_number: 'INV-1', amount: 450, currency: 'GHS', status: 'paid',
  created_at: '2026-09-11T00:00:00.000Z', description: 'Multi-Branch monthly', payment_method: 'paystack',
};
const ADMIN = 'ops@quadem.test';
const payload = () => mockSend.mock.calls[0][0];

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
});

describe.each([
  ['expiration warning', () => sendExpirationWarning(BUSINESS, SUBSCRIPTION, 3)],
  ['suspension notice', () => sendSuspensionNotice(BUSINESS)],
  ['invoice', () => sendInvoiceEmail(INVOICE, BUSINESS, 'Multi-Branch', ['manager@acme.test'])],
])('%s', (_name, send) => {
  it('never puts the operator in the To header', async () => {
    await send();
    expect(payload().to).not.toContain(ADMIN);
    expect(JSON.stringify(payload().to)).not.toContain('quadem');
  });

  it('still copies the operator, by bcc', async () => {
    await send();
    expect(payload().bcc).toEqual([ADMIN]);
  });

  it('reaches the customer', async () => {
    await send();
    expect(payload().to).toContain('owner@acme.test');
  });
});

describe('edge cases', () => {
  it('keeps every address on the business side of an invoice in To, which is one company', async () => {
    await sendInvoiceEmail(INVOICE, BUSINESS, 'Multi-Branch', ['manager@acme.test', 'accounts@acme.test']);
    expect(payload().to).toEqual(expect.arrayContaining(['manager@acme.test', 'accounts@acme.test', 'owner@acme.test']));
    expect(payload().to).not.toContain(ADMIN);
  });

  it('does not repeat an address that appears twice', async () => {
    await sendInvoiceEmail(INVOICE, BUSINESS, 'Multi-Branch', ['owner@acme.test']);
    expect(payload().to.filter((a) => a === 'owner@acme.test')).toHaveLength(1);
  });

  it('sends to the operator directly when the business has no address at all', async () => {
    // Nobody to disclose it to, and the copy is the only one worth sending.
    await sendExpirationWarning({ ...BUSINESS, contact_email: null }, SUBSCRIPTION, 3);
    expect(payload().to).toEqual([ADMIN]);
    expect(payload().bcc).toBeUndefined();
  });

  it('leaves the signup alert alone, which is addressed to us and not to a customer', async () => {
    await sendSignupAlert(BUSINESS, { name: 'Kofi', email: 'kofi@acme.test' }, {});
    expect(payload().to).toEqual([ADMIN]);
  });
});
