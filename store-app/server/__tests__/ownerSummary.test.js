/**
 * The owner's end-of-day summary: the numbers agree with the reports' rules,
 * the email is escaped, only owners who switched it on receive it (one email
 * each), a day is claimed before sending, and a send that did not happen
 * releases the claim instead of being recorded as sent.
 */
let results = {};
let writes = [];

function mockQuery(table) {
  const calls = [];
  const resolve = () => { const r = results[table]; return typeof r === 'function' ? r(calls) : r || { data: [], error: null }; };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(resolve()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(resolve());
      if (['insert', 'update', 'delete'].includes(prop)) return (payload) => { calls.push([prop, payload]); writes.push({ table, op: prop, payload, calls }); return chain; };
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockQuery(t)) } }));
jest.mock('../services/emailService', () => ({ sendCustomEmail: jest.fn(async () => ({ success: true })) }));
jest.mock('../utils/cronLock', () => ({ claimCronRun: jest.fn(async () => true), PG_UNIQUE_VIOLATION: '23505' }));

const emailService = require('../services/emailService');
const { buildSummary, renderSummaryEmail, sendDailySummaries } = require('../services/ownerSummary');

const isCount = (calls) => calls.some(([m, , opts]) => m === 'select' && opts?.head);
beforeEach(() => {
  writes = [];
  emailService.sendCustomEmail.mockClear().mockResolvedValue({ success: true });
  results = {
    businesses: { data: { name: 'Omek <Gigs>', currency: 'GHS' }, error: null },
    locations: { data: [{ id: 'osu', name: 'Osu' }, { id: 'tema', name: 'Tema' }], error: null },
    sales: { data: [{ location_id: 'osu', total_amount: 300 }, { location_id: 'tema', total_amount: 200 }], error: null },
    returns: { data: [{ location_id: 'osu', total_refund_amount: 50 }], error: null },
    till_sessions: (calls) => (isCount(calls) ? { count: 1, error: null }
      : calls.some(([m, c, v]) => m === 'eq' && c === 'status' && v === 'open') ? { data: [{ location_id: 'tema', register_name: 'Front' }], error: null }
      : { data: [{ location_id: 'osu', register_name: 'Main', expected_cash: 250, counted_cash: 240, variance: -10, status: 'closed' }], error: null }),
    product_inventory: { data: [
      { quantity: 2, low_stock_threshold: 3, location_id: 'osu', product: { name: 'Rice 5kg' } },
      { quantity: 5, low_stock_threshold: null, location_id: 'tema', product: { name: 'Gino Tomato' } },
      { quantity: 40, low_stock_threshold: 10, location_id: 'osu', product: { name: 'Milo' } },
    ], error: null },
    return_inspections: { count: 2, error: null },
    loss_cases: { count: 0, error: null },
    purchase_orders: { count: 1, error: null },
    ap_bills: { count: 0, error: null },
  };
});

test('the summary nets refunds, splits branches and uses the dashboard\'s low-stock default', async () => {
  const s = await buildSummary('biz', '2026-10-08');
  expect(s.sales).toEqual({ count: 2, gross: 500, refunds: 50, refundCount: 1, net: 450 });
  expect(s.branches).toEqual(expect.arrayContaining([{ name: 'Osu', sales: 300, count: 1, refunds: 50 }, { name: 'Tema', sales: 200, count: 1, refunds: 0 }]));
  expect(s.tills).toEqual([{ branch: 'Osu', register: 'Main', expected: 250, counted: 240, variance: -10, reviewed: false }]);
  expect(s.openTills).toEqual([{ branch: 'Tema', register: 'Front' }]);
  expect(s.lowStock.count).toBe(2); // null threshold falls back to 5, as the dashboard does
  expect(s.pending).toEqual({ tillReviews: 1, returnInspections: 2, investigations: 0, deliveries: 1, billsDue: 0 });
});

test('the email escapes names and reads plainly', async () => {
  const { subject, html } = renderSummaryEmail(await buildSummary('biz', '2026-10-08'));
  expect(subject).toMatch(/^Omek <Gigs>: GH₵\s?450\.00 net sales on Thursday,? 8 October$/);
  results.businesses = { data: { name: 'Shop\r\nBcc: x@example.invalid', currency: 'GHS' }, error: null };
  expect(renderSummaryEmail(await buildSummary('biz', '2026-10-08')).subject).not.toMatch(/[\r\n]/);
  expect(html).toContain('Omek &lt;Gigs&gt;');
  expect(html).not.toContain('<Gigs>');
  expect(html).toMatch(/short GH₵\s?10\.00/);
  expect(html).toContain('<strong>Still open:</strong> Tema');
  expect(html).toContain('2 returned items to inspect');
  expect(html).toContain('1 delivery expected from suppliers');
  expect(html).not.toMatch(/investigation/);
});

describe('sendDailySummaries', () => {
  const users = (rows) => ({ data: rows, error: null });
  const owner = (email, business = 'biz', extra = {}) => ({ email, business_id: business, status: 'active', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active', is_demo: false }, ...extra });

  test('claims the day, then emails each opted-in owner once', async () => {
    results.users = users([
      owner('a@example.invalid'), owner('b@example.invalid'),
      owner('cashier@example.invalid', 'biz', { roles: { name: 'Sales Executive', permissions: ['create_sales'] } }),
      owner('demo@example.invalid', 'demo', { businesses: { status: 'active', is_demo: true } }),
    ]);
    results.owner_daily_summaries = { data: null, error: null };
    expect(await sendDailySummaries(new Date('2026-10-08T20:00:00Z'))).toBe(1);
    const claim = writes.find((w) => w.table === 'owner_daily_summaries' && w.op === 'insert');
    expect(claim.payload).toEqual({ business_id: 'biz', summary_date: '2026-10-08' });
    expect(emailService.sendCustomEmail).toHaveBeenCalledTimes(1);
    const [recipients, , , gateway, options] = emailService.sendCustomEmail.mock.calls[0];
    expect(recipients).toEqual(['a@example.invalid', 'b@example.invalid']);
    expect(gateway).toBeNull();
    expect(options).toEqual({ idempotencyKey: 'owner-summary-biz-2026-10-08' });
    expect(writes.some((w) => w.op === 'update' && w.payload.recipients === 2)).toBe(true);
  });

  test('an already claimed day is not sent again', async () => {
    results.users = users([owner('a@example.invalid')]);
    results.owner_daily_summaries = { data: null, error: { code: '23505', message: 'duplicate' } };
    expect(await sendDailySummaries(new Date('2026-10-08T20:00:00Z'))).toBe(0);
    expect(emailService.sendCustomEmail).not.toHaveBeenCalled();
  });

  test('a simulated or failed send releases the claim and is not counted', async () => {
    results.users = users([owner('a@example.invalid')]);
    results.owner_daily_summaries = { data: null, error: null };
    emailService.sendCustomEmail.mockResolvedValue({ success: true, simulated: true });
    expect(await sendDailySummaries(new Date('2026-10-08T20:00:00Z'))).toBe(0);
    expect(writes.some((w) => w.table === 'owner_daily_summaries' && w.op === 'delete')).toBe(true);
    expect(writes.some((w) => w.op === 'update' && w.payload.sent_at)).toBe(false);
  });
});
