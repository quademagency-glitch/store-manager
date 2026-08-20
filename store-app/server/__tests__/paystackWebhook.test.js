const crypto = require('crypto');
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const SECRET = 'sk_test_abcdef1234';

// The webhook reads these via .single(), and the mock's .single() hands back
// the override verbatim, so `data` must be the row itself, not an array.
const mockGateway = {
  id: 'gw-1',
  provider: 'paystack',
  secret_key: SECRET,
  // Deliberately different from secret_key. Paystack signs with the SECRET
  // KEY; the old subscriptions.js handler preferred this column, which would
  // have 401'd every genuine webhook. If the handler ever regresses to
  // preferring webhook_secret, the happy-path tests below start failing.
  webhook_secret: 'wh_secret_totally_different',
  is_active: true,
};

const mockSupabase = buildMockSupabase({
  payment_gateways: { data: mockGateway, error: null, count: 1 },
  business_subscriptions: { data: { id: 'sub-1' }, error: null, count: 1 },
  billing_invoices: { data: [], error: null, count: 0 },
  businesses: { data: { id: 'biz-1' }, error: null, count: 1 },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

// NOTE: services/paystack is deliberately NOT mocked here.
//
// billing.test.js mocks verifyWebhookSignature to always return true, which is
// exactly why the signature bugs survived, no test could ever observe a
// rejection. These tests sign real payloads with the mock gateway's key and
// exercise the real HMAC path.

const app = require('../index');

const WEBHOOK_URLS = [
  '/api/billing/paystack/webhook',
  '/api/subscriptions/paystack-webhook',
];

function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

function chargeSuccessBody(overrides = {}) {
  return JSON.stringify({
    event: 'charge.success',
    data: {
      reference: 'ref-test-123',
      amount: 20000,
      currency: 'GHS',
      channel: 'card',
      customer: { customer_code: 'CUS_test' },
      metadata: { business_id: 'biz-1', plan_id: 'plan-1', billing_cycle: 'monthly' },
      ...overrides,
    },
  });
}

function post(url, rawBody, signature) {
  return request(app)
    .post(url)
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signature)
    .send(rawBody);
}

describe.each(WEBHOOK_URLS)('POST %s', (url) => {
  it('accepts a correctly signed charge.success', async () => {
    const body = chargeSuccessBody();
    const res = await post(url, body, sign(body));
    expect(res.status).toBe(200);
  });

  // The regression test for "enforced only in production". NODE_ENV is 'test'
  // here, which is precisely the environment the old billing.js handler waved
  // through.
  it('rejects a bad signature with 401 even outside production', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const body = chargeSuccessBody();
    const res = await post(url, body, sign(body, 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const body = chargeSuccessBody();
    const res = await request(app)
      .post(url)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  // The regression test for HMAC-over-re-serialized-body.
  //
  // The old handlers hashed JSON.stringify(req.body). Pretty-printed JSON
  // parses to an identical object but is different bytes, so signing the
  // compact form and sending the indented one is exactly the mismatch that
  // used to go unnoticed, a re-serializing handler would compute the same
  // digest for both and wave this through.
  it('rejects a payload whose bytes differ from what was signed', async () => {
    const signed = chargeSuccessBody();
    const indented = JSON.stringify(JSON.parse(signed), null, 2);

    // Guard the fixture: identical parses, different bytes. If either of these
    // assertions ever fails the test below is vacuous.
    expect(JSON.parse(indented)).toEqual(JSON.parse(signed));
    expect(indented).not.toBe(signed);

    const res = await post(url, indented, sign(signed));
    expect(res.status).toBe(401);
  });

  // timingSafeEqual throws RangeError on unequal buffer lengths, which would
  // surface as a 500 without the hex/length guard in verifyWebhookSignature.
  it('rejects a non-hex signature with 401, not 500', async () => {
    const body = chargeSuccessBody();
    const res = await post(url, body, 'not-a-hex-signature');
    expect(res.status).toBe(401);
  });

  it('rejects a short hex signature with 401, not 500', async () => {
    const body = chargeSuccessBody();
    const res = await post(url, body, 'abcdef');
    expect(res.status).toBe(401);
  });

  it('acknowledges a signed event it does not act on', async () => {
    const body = JSON.stringify({ event: 'subscription.disable', data: {} });
    const res = await post(url, body, sign(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges charge.success without business metadata', async () => {
    const body = chargeSuccessBody({ metadata: {} });
    const res = await post(url, body, sign(body));
    expect(res.status).toBe(200);
  });
});

describe('signature verification primitive', () => {
  const { verifyWebhookSignature } = require('../services/paystack');

  it('verifies bytes it signed', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const raw = Buffer.from('{"a":1}');
    const signature = sign(raw);
    expect(verifyWebhookSignature(Buffer.from('{"a":2}'), signature, SECRET)).toBe(false);
  });

  it('returns false rather than throwing on malformed input', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, '', SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, 'zz', SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, sign(raw), undefined)).toBe(false);
    expect(verifyWebhookSignature(null, sign(raw), SECRET)).toBe(false);
  });
});
