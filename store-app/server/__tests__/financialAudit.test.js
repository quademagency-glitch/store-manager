const express = require('express');
const request = require('supertest');
const { reportRange } = require('../utils/reportDates');
const { ageInvoices } = require('../utils/arAging');
const mockUser = { id: '10000000-0000-4000-8000-000000000001', business_id: '10000000-0000-4000-8000-000000000002', role: 'Business Admin', permissions: [], active_location_id: '10000000-0000-4000-8000-000000000003', location_ids: [] };
const mockDb = { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } };
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('../middleware/authGuard', () => (req, res, next) => { req.user = mockUser; next(); });
jest.mock('../middleware/apiCache', () => ({ apiCache: () => (req, res, next) => next(), invalidateCachePrefix: jest.fn() }));
jest.mock('../utils/auditLog', () => ({ logAuditEvent: jest.fn(), AUDIT_ACTIONS: {} }));
const app = express();
app.use(express.json());
app.use('/reports', require('../routes/reports'));
app.use('/ledger', require('../routes/ledger'));
app.use('/customers', require('../routes/customers'));
app.use('/sales', require('../routes/sales'));
app.use('/hr', require('../routes/hr'));
app.use('/purchases', require('../routes/purchaseOrders'));
app.use('/returns', require('../routes/returns'));
app.use('/marketing', require('../routes/crmCommunications'));
let rows, queries, mutations;
beforeEach(() => {
  rows = {}; queries = []; mutations = [];
  mockUser.role = 'Business Admin'; mockUser.permissions = [];
  mockDb.from.mockImplementation(table => {
    const calls = []; queries.push({ table, calls });
    let range;
    const chain = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (resolve, reject) => {
        let result = rows[table] || { data: [], error: null };
        if (range && Array.isArray(result.data)) result = { ...result, data: result.data.slice(range[0], range[1] + 1) };
        return Promise.resolve(result).then(resolve, reject);
      };
      return (...args) => {
        calls.push([key, ...args]);
        if (key === 'range') range = args;
        if (key === 'insert') mutations.push({ table, payload: args[0] });
        // Explicit schema contract: the original P&L typo must fail this test.
        if (table === 'business_ledger' && args[0] === 'entry_type') throw new Error('Unknown column entry_type');
        if (key === 'single' || key === 'maybeSingle') return Promise.resolve(rows[table] || { data: null });
        return chain;
      };
    }});
    return chain;
  });
});

describe('business date boundaries', () => {
  test('a one-day range includes its final instant and excludes the next day', () => {
    const range = reportRange('2026-09-18', '2026-09-18');
    expect(range).toMatchObject({ from: '2026-09-18T00:00:00.000Z', until: '2026-09-19T00:00:00.000Z' });
    expect('2026-09-18T23:59:59.999Z' < range.until).toBe(true);
  });
  test.each(['not-a-date', '2026-02-30', '2026-13-01'])('rejects invalid %s', value => {
    expect(() => reportRange(value, '2026-12-31')).toThrow();
  });
  test('rejects reversed ranges and preserves inclusive timestamp callers', () => {
    expect(() => reportRange('2026-09-19', '2026-09-18')).toThrow();
    expect(reportRange(null, '2026-09-18T23:59:59.999Z').until).toBe('2026-09-19T00:00:00.000Z');
  });
});

test('aging boundaries, missing due dates and settled invoices are consistent', () => {
  const asOf = '2026-09-19';
  const ages = [0, 1, 30, 31, 60, 61, 90, 91];
  const invoices = ages.map(days => ({ id: days, total_amount: 100, amount_paid: 10, due_date: new Date(Date.parse(asOf) - days * 86400000).toISOString().slice(0, 10) }));
  invoices.push({ id: 'fallback', total_amount: 20, issued_date: '2026-08-20' }, { id: 'paid', total_amount: 5, amount_paid: 5 });
  const { buckets, totals } = ageInvoices(invoices, asOf);
  expect(Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.map(i => i.id)]))).toEqual({ current: [0, 'fallback'], '1_30': [1, 30], '31_60': [31, 60], '61_90': [61, 90], over_90: [91] });
  expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(740);
});

describe('owner financial reports', () => {
  test('uses recorded costs, reverses refunds, excludes duplicate commission expense and scopes paid date', async () => {
    rows.sales = { data: [{ total_amount: 110, tax_amount: 10, sale_items: [{ quantity: 2, unit_cost: 20, cost_basis: 'recorded' }] }] };
    rows.returns = { data: [{ total_refund_amount: 55, sale: { total_amount: 110, tax_amount: 10 }, return_items: [{ quantity: 1, sale_item: { unit_cost: 20, cost_basis: 'recorded' } }] }] };
    rows.business_ledger = { data: [{ amount: 5 }, { id: 'payout-1', amount: 10, commission_payouts: [{ id: 'c1' }] }] };
    rows.commission_ledger = { data: [{ id: 'c1', amount: 10, payout_ledger_id: 'payout-1' }] };
    const res = await request(app).get('/reports/pnl?startDate=2026-09-18&endDate=2026-09-18&locationId=branch-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ revenue: 50, cogs: 20, grossProfit: 30, expenses: 5, commissions: 10, netProfit: 15 });
    const ledger = queries.find(q => q.table === 'business_ledger').calls;
    expect(ledger).toEqual(expect.arrayContaining([['eq', 'type', 'expense'], ['eq', 'status', 'approved'], ['lt', 'created_at', '2026-09-19T00:00:00.000Z']]));
    expect(queries.find(q => q.table === 'commission_ledger').calls).toEqual(expect.arrayContaining([['eq', 'sale.location_id', 'branch-1'], ['gte', 'paid_at', '2026-09-18T00:00:00.000Z']]));
  });
  test('a commission query failure cannot silently produce profit', async () => {
    rows.commission_ledger = { error: new Error('unavailable') };
    const res = await request(app).get('/reports/pnl?startDate=2026-09-18&endDate=2026-09-18');
    expect(res.status).toBe(500); expect(res.body).not.toHaveProperty('netProfit');
  });
  test('report-only role can read and an ungranted role cannot', async () => {
    mockUser.role = 'Financial Analyst'; mockUser.permissions = ['view_financial_reports'];
    expect((await request(app).get('/reports/ar-aging')).status).toBe(200);
    mockUser.permissions = [];
    expect((await request(app).get('/reports/ar-aging')).status).toBe(403);
  });
  test('till excludes pending sales and includes the entire end date', async () => {
    expect((await request(app).get('/ledger/till-balance?start_date=2026-09-18&end_date=2026-09-18')).status).toBe(200);
    expect(queries.find(q => q.table === 'sales').calls).toEqual(expect.arrayContaining([['in', 'status', ['completed', 'void_pending']], ['lt', 'created_at', '2026-09-19T00:00:00.000Z']]));
  });
  test.each(['Sales Executive', 'Cashier', 'Custom Staff'])('%s expenses require approval', async role => {
    mockUser.role = role;
    rows.business_ledger = { data: { id: 'entry' } };
    const res = await request(app).post('/ledger').send({ type: 'expense', amount: 10, location_id: mockUser.active_location_id, metadata: { note: 'test' } });
    expect(res.status).toBe(201);
    expect(mutations[0].payload[0].status).toBe('pending');
    expect(mutations[0].payload[0]).not.toHaveProperty('approved_by');
  });
});

test('customer list, search and detail do not expose active verification codes', async () => {
  const customer = { id: 'c1', name: 'Customer', phone: '233200000000', verification_code: '1234', otp_expires_at: 'tomorrow', verification_code_expires_at: 'tomorrow' };
  for (const path of ['/customers', '/customers/search?q=Customer', '/customers/c1']) {
    rows.customers = { data: path.endsWith('/c1') ? customer : [customer], count: 1 };
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/verification_code|otp_expires_at|1234/);
    expect(JSON.stringify(res.body)).toContain('Customer');
  }
});

test('export includes more than one database page and preserves branch scope', async () => {
  rows.sales = { data: Array.from({ length: 616 }, (_, i) => ({ id: `sale-${i}`, total_amount: 10, customer: { name: i === 0 ? '=SUM(A1)' : 'Customer' } })) };
  const res = await request(app).get('/sales/export?startDate=2026-09-01&endDate=2026-09-19&page=3');
  expect(res.status).toBe(200);
  const lines = res.text.trim().split('\r\n');
  expect(lines).toHaveLength(617);
  expect(lines[1]).toContain("'=SUM(A1)");
  const salesQueries = queries.filter(q => q.table === 'sales');
  expect(salesQueries).toHaveLength(2);
  for (const q of salesQueries) expect(q.calls).toContainEqual(['eq', 'location_id', mockUser.active_location_id]);
  expect(salesQueries[1].calls).toContainEqual(['range', 500, 999]);
});

test('receipt source failure is explicit and sends no incomplete ZIP', async () => {
  rows.business_ledger = { data: [{ id: 'r1', type: 'expense', receipt_url: 'file1.png' }, { id: 'r2', type: 'expense', receipt_url: 'file2.png' }] };
  const download = jest.fn().mockResolvedValueOnce({ data: { arrayBuffer: async () => Buffer.from('first file') } }).mockResolvedValueOnce({ error: new Error('missing') });
  mockDb.storage.from.mockReturnValue({ download });
  const res = await request(app).get('/ledger/download-receipts');
  expect(res.status).toBe(502); expect(res.body.error).toContain('No archive was created');
  expect(res.headers['content-type']).toContain('application/json');
});

test('customer lifetime total is independent of the 50-row history page and nets refunds', async () => {
  rows.customers = { data: { id: 'customer-1', business_id: mockUser.business_id } };
  rows.sales = { data: Array.from({ length: 116 }, (_, i) => ({ id: i, total_amount: 10, returns: i === 0 ? [{ total_refund_amount: 5 }] : [] })) };
  const res = await request(app).get('/customers/customer-1/purchase-summary');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ purchaseCount: 116, grossSpent: 1160, refunds: 5, netSpent: 1155, scope: 'Selected location', period: 'Lifetime' });
  expect(queries.find(q => q.table === 'sales').calls).toEqual(expect.arrayContaining([['in', 'status', ['completed', 'void_pending']], ['eq', 'location_id', mockUser.active_location_id]]));
});

test('commission payout made at another branch is not counted again as an operating expense', async () => {
  rows.business_ledger = { data: [{ id: 'paid-here', amount: 10, commission_payouts: [{ id: 'earned-elsewhere' }] }] };
  rows.commission_ledger = { data: [] };
  const res = await request(app).get('/reports/pnl?startDate=2026-09-01&endDate=2026-09-19&locationId=payout-branch');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ expenses: 0, commissions: 0, netProfit: 0 });
});


describe('delegated permissions', () => {
  test('scheduler can load staff and create a shift without user administration', async () => {
    mockUser.role = 'Scheduler'; mockUser.permissions = ['manage_hr_schedules'];
    expect((await request(app).get('/hr/schedule-staff')).status).toBe(200);
    expect((await request(app).post('/hr/schedules').send({ user_id: mockUser.id, location_id: mockUser.active_location_id,
      date: '2026-09-19', start_time: '09:00', end_time: '17:00' })).status).toBe(201);
    mockUser.permissions = [];
    expect((await request(app).get('/hr/schedule-staff')).status).toBe(403);
  });
  test('purchasing viewer can read but cannot create an order', async () => {
    mockUser.role = 'Purchasing Viewer'; mockUser.permissions = ['view_purchases'];
    expect((await request(app).get('/purchases')).status).toBe(200);
    expect((await request(app).post('/purchases').send({})).status).toBe(403);
  });
  test('return and marketing permissions are usable without business administration', async () => {
    mockUser.role = 'Custom Staff'; mockUser.permissions = ['manage_returns', 'manage_marketing'];
    expect((await request(app).get('/returns/search?query=receipt')).status).toBe(200);
    expect((await request(app).get('/marketing/templates')).status).toBe(200);
    mockUser.permissions = [];
    expect((await request(app).get('/returns/search?query=receipt')).status).toBe(403);
    expect((await request(app).get('/marketing/templates')).status).toBe(403);
  });
});
