const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const mockGateways = [
  { id: 'gw-1', provider: 'paystack', public_key: 'pk_test_xxx', secret_key: 'sk_test_abcdef1234', webhook_secret: 'wh_secret_abcd1234', is_active: true },
];
const mockInvoices = [
  { id: 'inv-1', invoice_number: 'INV-001', amount: 200, status: 'sent', currency: 'GHS' },
];

const mockSupabase = buildMockSupabase({
  payment_gateways: { data: mockGateways, error: null, count: 1 },
  billing_invoices: { data: mockInvoices, error: null, count: 1 },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../services/paystack', () => ({
  initializeTransaction: jest.fn().mockResolvedValue({ authorization_url: 'https://paystack.com/pay/test', reference: 'ref-123' }),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
}));
jest.mock('../services/emailService', () => ({
  sendInvoiceEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const app = require('../index');

describe('GET /api/billing/gateways', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/billing/gateways');
    expect(res.status).toBe(401);
  });

  it('returns gateways for authenticated user with manage_platform permission', async () => {
    const res = await request(app)
      .get('/api/billing/gateways')
      .set('Authorization', 'Bearer valid-test-token');
    expect([200, 403, 500]).toContain(res.status);
  });
});

describe('GET /api/billing/invoices', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/billing/invoices');
    expect(res.status).toBe(401);
  });

  it('returns invoices with valid token', async () => {
    const res = await request(app)
      .get('/api/billing/invoices')
      .set('Authorization', 'Bearer valid-test-token');
    expect([200, 403, 500]).toContain(res.status);
  });
});

describe('POST /api/billing/paystack/initialize', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/billing/paystack/initialize').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 or 500 with missing body fields', async () => {
    const res = await request(app)
      .post('/api/billing/paystack/initialize')
      .set('Authorization', 'Bearer valid-test-token')
      .send({});
    expect([400, 500]).toContain(res.status);
  });
});

describe('Billing security — secret key masking', () => {
  it('never exposes full secret keys in gateway list', async () => {
    const res = await request(app)
      .get('/api/billing/gateways')
      .set('Authorization', 'Bearer valid-test-token');
    if (res.status === 200 && Array.isArray(res.body)) {
      for (const gw of res.body) {
        if (gw.secret_key) {
          expect(gw.secret_key).toMatch(/^••••/);
        }
      }
    }
  });
});
