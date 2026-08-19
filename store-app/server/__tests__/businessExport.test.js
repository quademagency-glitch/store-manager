const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase({
  businesses: { data: { id: 'biz-uuid-123', name: 'Adom Superstore', slug: 'adom' }, error: null },
});

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

const app = require('../index');
const { csvCell, EXPORT_TABLES } = require('../services/businessExport');
const { isSensitiveKey } = require('../utils/sensitiveKeys');

describe('GET /api/businesses/me/export', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/businesses/me/export');
    expect(res.status).toBe(401);
  });
});

describe('export table allowlist', () => {
  // An allowlist, not "every table with a business_id" — so adding a table to
  // the schema can never silently start exporting it.
  it('excludes tables that hold credentials for other systems', () => {
    for (const t of ['api_keys', 'communication_gateways', 'webhook_endpoints']) {
      expect(EXPORT_TABLES).not.toContain(t);
    }
  });

  it('excludes internal counters and operational logging', () => {
    expect(EXPORT_TABLES.some((t) => t.endsWith('_number_sequences'))).toBe(false);
    expect(EXPORT_TABLES).not.toContain('webhook_deliveries');
  });

  it('includes the records a business would actually need to leave with', () => {
    for (const t of ['sales', 'sale_items', 'products', 'customers', 'stock_movements',
                     'ar_invoices', 'ap_bills', 'business_ledger', 'attendance_logs']) {
      expect(EXPORT_TABLES).toContain(t);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });
});

describe('CSV escaping', () => {
  // A product named  Rice, 5kg  or a note containing a quote must not shift
  // every following column — silent corruption is the worst outcome for a file
  // someone may be migrating from.
  it('quotes cells containing commas, quotes or newlines', () => {
    expect(csvCell('Rice, 5kg')).toBe('"Rice, 5kg"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves ordinary values untouched', () => {
    expect(csvCell('Rice 5kg')).toBe('Rice 5kg');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
  });

  it('renders null and undefined as empty rather than the strings', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('serialises objects so JSONB columns survive the round trip', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('secret redaction shared with the audit log', () => {
  it('catches the credential columns that exist in this schema', () => {
    for (const k of ['manager_pin', 'password_hash', 'paystack_secret_key',
                     'webhook_secret', 'key_hash', 'api_key', 'access_token']) {
      expect(isSensitiveKey(k)).toBe(true);
    }
  });

  it('does not over-match ordinary business columns', () => {
    for (const k of ['id', 'name', 'email', 'phone', 'total_amount', 'quantity',
                     'created_at', 'business_id', 'location_id', 'sku']) {
      expect(isSensitiveKey(k)).toBe(false);
    }
  });
});
