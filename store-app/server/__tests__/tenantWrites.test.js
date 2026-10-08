/**
 * Ids in a request body are claims (utils/ownership). Every case here was
 * accepted before 8 October 2026: one business could write stock, shifts,
 * payments or orders against another business's rows, or a branch manager
 * could act outside their branches.
 */
const express = require('express');
const request = require('supertest');

const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const ME = id(1), STAFF = id(2), OWNER = id(3);
const LOC = id(4), LOC2 = id(5), FOREIGN_LOC = id(9);
const PRODUCT = id(6), FOREIGN_PRODUCT = id(8), BATCH = id(7);
const BIZ = 'biz-own';

const mockUser = {};
const mockDb = { from: jest.fn(), rpc: jest.fn(), auth: { admin: { deleteUser: jest.fn() } } };
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('../middleware/authGuard', () => Object.assign((req, res, next) => { req.user = { ...mockUser }; next(); }, {
  invalidateUserCache: jest.fn(), invalidateBusinessCache: jest.fn(), invalidateRoleCache: jest.fn(),
}));
jest.mock('../middleware/apiCache', () => ({ apiCache: () => (req, res, next) => next(), invalidateCachePrefix: jest.fn() }));
jest.mock('../utils/auditLog', () => ({ logAuditEvent: jest.fn(), AUDIT_ACTIONS: {} }));
jest.mock('../services/lossPreventionEngine', () => ({ runChecks: jest.fn() }));
jest.mock('../services/emailService', () => ({ sendBusinessWelcomeEmail: jest.fn() }));
jest.mock('../services/webhookDispatcher', () => ({ dispatchWebhook: jest.fn(), attemptDelivery: jest.fn() }));

const app = express();
app.use(express.json());
for (const [path, file] of [['/stock', 'stock'], ['/stocktake', 'stocktake'], ['/products', 'products'], ['/units', 'units'],
  ['/hr', 'hr'], ['/users', 'users'], ['/ledger', 'ledger'], ['/ar', 'accountsReceivable'], ['/customer-orders', 'customerOrders'],
  ['/analytics', 'analytics'], ['/loyalty', 'loyalty'], ['/alerts', 'alerts'],
  ['/sales', 'sales'], ['/customers', 'customers'], ['/inventory-analytics', 'inventoryAnalytics']]) {
  app.use(path, require(`../routes/${file}`));
}

/* Rows of this business, per table. An ownership lookup (select('id') with an
   .in('id', ...)) answers from here; every other query answers from `rows`. */
let owned, rows, queries, mutations;
const queriesOn = (table) => queries.filter((q) => q.table === table).map((q) => q.calls);
beforeEach(() => {
  Object.keys(mockUser).forEach((k) => delete mockUser[k]);
  Object.assign(mockUser, {
    id: ME, name: 'Me', business_id: BIZ, role: 'Business Admin', permissions: [],
    location_ids: [], business_location_ids: [LOC, LOC2], active_location_id: LOC,
  });
  owned = { products: [PRODUCT], locations: [LOC, LOC2], users: [ME, STAFF, OWNER], product_batches: [BATCH] };
  rows = {}; queries = []; mutations = [];
  mockDb.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockDb.auth.admin.deleteUser.mockReset();
  mockDb.from.mockImplementation((table) => {
    const calls = []; queries.push({ table, calls });
    const answer = () => {
      const inIds = calls.find((c) => c[0] === 'in' && c[1] === 'id');
      if (inIds && calls.some((c) => c[0] === 'select' && c[1] === 'id') && owned[table]) {
        return { data: inIds[2].filter((x) => owned[table].includes(x)).map((x) => ({ id: x })), error: null };
      }
      const r = rows[table];
      return typeof r === 'function' ? r(calls) : (r || { data: [], error: null });
    };
    const chain = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (ok, ko) => Promise.resolve(answer()).then(ok, ko);
      return (...args) => {
        calls.push([key, ...args]);
        if (['insert', 'update', 'upsert', 'delete'].includes(key)) mutations.push({ table, op: key, payload: args[0] });
        if (key === 'single' || key === 'maybeSingle') return Promise.resolve(answer());
        return chain;
      };
    } });
    return chain;
  });
});
const writes = () => mutations.filter((m) => !['audit_logs'].includes(m.table));

describe('branch and product ownership on stock writes', () => {
  test('a Business Admin cannot adjust stock at another business\'s branch', async () => {
    const res = await request(app).post('/stock/adjust').send({ product_id: PRODUCT, location_id: FOREIGN_LOC, quantity_change: 5, movement_type: 'RECEIPT' });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('nor adjust another business\'s product at their own branch', async () => {
    const res = await request(app).post('/stock/adjust').send({ product_id: FOREIGN_PRODUCT, location_id: LOC, quantity_change: 5, movement_type: 'RECEIPT' });
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  test('a Business Admin cannot change a threshold at another business\'s branch', async () => {
    const res = await request(app).put(`/stock/${PRODUCT}/locations/${FOREIGN_LOC}/threshold`).send({ threshold: 3 });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('a count cannot be negative, name a foreign product or a foreign branch', async () => {
    const send = (body) => request(app).post('/stock/audits').send(body);
    expect((await send({ location_id: LOC, counts: [{ product_id: PRODUCT, counted_quantity: -4 }] })).status).toBe(400);
    expect((await send({ location_id: LOC, counts: [{ product_id: FOREIGN_PRODUCT, counted_quantity: 4 }] })).status).toBe(404);
    expect((await send({ location_id: FOREIGN_LOC, counts: [{ product_id: PRODUCT, counted_quantity: 4 }] })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('a batch cannot be registered at a foreign branch', async () => {
    const res = await request(app).post('/stock/batches').send({ product_id: PRODUCT, location_id: FOREIGN_LOC, batch_number: 'B1', quantity: 3, expiry_date: '2027-01-01' });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('a transfer is found within the business and claimed only while still pending', async () => {
    rows.stock_transfers = (calls) => (calls.some((c) => c[0] === 'update')
      ? { data: { id: 't1', status: 'COMPLETED', product_id: PRODUCT, quantity: 2, to_location_id: LOC2 }, error: null }
      : { data: { id: 't1', status: 'PENDING', from_location_id: LOC, to_location_id: LOC2 }, error: null });
    const res = await request(app).put('/stock/transfers/t1/complete');
    expect(res.status).toBe(200);
    const [lookup, claim] = queriesOn('stock_transfers');
    expect(lookup).toContainEqual(['eq', 'business_id', BIZ]);
    expect(claim).toEqual(expect.arrayContaining([['eq', 'business_id', BIZ], ['eq', 'status', 'PENDING']]));
  });

  test('a transfer someone else just completed moves no stock', async () => {
    rows.stock_transfers = (calls) => (calls.some((c) => c[0] === 'update')
      ? { data: null, error: null }
      : { data: { id: 't1', status: 'PENDING', from_location_id: LOC, to_location_id: LOC2 }, error: null });
    const res = await request(app).put('/stock/transfers/t1/cancel');
    expect(res.status).toBe(409);
    expect(writes().filter((m) => m.table !== 'stock_transfers')).toHaveLength(0);
  });
});

describe('stock takes', () => {
  test('another business\'s session cannot be read', async () => {
    rows.stock_take_sessions = { data: { id: 's1', business_id: 'biz-other', location_id: FOREIGN_LOC, status: 'in_progress' }, error: null };
    expect((await request(app).get('/stocktake/s1')).status).toBe(404);
  });

  test('scan, complete and cancel look the session up within the business', async () => {
    rows.stock_take_sessions = { data: null, error: null };
    expect((await request(app).post('/stocktake/s1/scan').send({ qr_code: 'QD-1' })).status).toBe(404);
    expect((await request(app).put('/stocktake/s1/complete')).status).toBe(404);
    expect((await request(app).put('/stocktake/s1/cancel')).status).toBe(404);
    for (const calls of queriesOn('stock_take_sessions')) expect(calls).toContainEqual(['eq', 'business_id', BIZ]);
    expect(writes()).toHaveLength(0);
  });

  test('a session cannot be started at a foreign branch', async () => {
    expect((await request(app).post('/stocktake/start').send({ location_id: FOREIGN_LOC })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
});

describe('products and tracked units', () => {
  test('a manager cannot create a product inside another business', async () => {
    Object.assign(mockUser, { role: 'Store Manager', permissions: ['manage_products'] });
    rows.products = { data: { id: PRODUCT }, error: null };
    const res = await request(app).post('/products').send({ name: 'X', sku: 'X1', price: 1, business_id: 'biz-other' });
    expect(res.status).toBe(201);
    expect(mutations.find((m) => m.table === 'products').payload[0].business_id).toBe(BIZ);
  });

  test('opening stock cannot be negative or at a foreign branch', async () => {
    expect((await request(app).post('/products').send({ name: 'X', sku: 'X1', price: 1, locationId: LOC, initialQuantity: -5 })).status).toBe(400);
    expect((await request(app).post('/products').send({ name: 'X', sku: 'X1', price: 1, locationId: FOREIGN_LOC, initialQuantity: 5 })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('units cannot be assigned to a foreign product, batch or branch', async () => {
    const assign = (body) => request(app).post('/units/assign').send({ qr_code: 'QD-1', ...body });
    expect((await assign({ product_id: FOREIGN_PRODUCT, location_id: LOC })).status).toBe(404);
    expect((await assign({ product_id: PRODUCT, location_id: LOC, batch_id: id(0) })).status).toBe(404);
    expect((await request(app).post('/units/bulk-assign').send({ qr_codes: ['QD-1'], product_id: PRODUCT, location_id: FOREIGN_LOC })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('branch staff list tracked units at their own branches only', async () => {
    Object.assign(mockUser, { role: 'Store Manager', permissions: ['view_inventory'], location_ids: [LOC], active_location_id: null });
    expect((await request(app).get(`/units?location_id=${LOC2}`)).status).toBe(403);
    expect((await request(app).get('/units')).status).toBe(200);
    expect(queriesOn('inventory_units').at(-1)).toContainEqual(['in', 'location_id', [LOC]]);
  });

  test('the untracked journey reads only this business\'s product and branch', async () => {
    rows.products = { data: null, error: null };
    const res = await request(app).get(`/units/untracked/journey?product_id=${FOREIGN_PRODUCT}&location_id=${LOC}`);
    expect(res.status).toBe(404);
    expect(queriesOn('products')[0]).toContainEqual(['eq', 'business_id', BIZ]);
  });
});

describe('HR', () => {
  test('geofence settings are read and written within the business', async () => {
    rows.locations = { data: null, error: null };
    expect((await request(app).get(`/hr/geofence/${FOREIGN_LOC}`)).status).toBe(404);
    expect((await request(app).put(`/hr/geofence/${FOREIGN_LOC}`).send({ geofence_radius_m: 50 })).status).toBe(404);
    for (const calls of queriesOn('locations')) expect(calls).toContainEqual(['eq', 'business_id', BIZ]);
  });

  test('a shift cannot be created for another business\'s staff or branch', async () => {
    const shift = { date: '2026-10-09', start_time: '09:00', end_time: '17:00' };
    expect((await request(app).post('/hr/schedules').send({ ...shift, user_id: id(0), location_id: LOC })).status).toBe(404);
    expect((await request(app).post('/hr/schedules').send({ ...shift, user_id: STAFF, location_id: FOREIGN_LOC })).status).toBe(404);
    expect((await request(app).patch('/hr/schedules/sh1').send({ location_id: FOREIGN_LOC })).status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  test('a role merely named "Manager" sees only its own commissions', async () => {
    Object.assign(mockUser, { role: 'Manager', permissions: ['view_my_commissions'] });
    expect((await request(app).get('/hr/commissions')).status).toBe(200);
    for (const calls of queriesOn('commission_ledger')) expect(calls).toContainEqual(['eq', 'user_id', ME]);
  });
});

describe('staff accounts', () => {
  const manager = () => Object.assign(mockUser, { role: 'Store Manager', permissions: ['manage_users', 'create_sales'] });
  const cashierRole = { name: 'Cashier', business_id: null, permissions: ['create_sales'] };
  const ownerRole = { name: 'Business Admin', business_id: null, permissions: ['manage_users', 'manage_business'] };

  test('a manager cannot demote or ban the business owner', async () => {
    manager();
    rows.roles = { data: cashierRole, error: null };
    rows.users = { data: { role_id: 'owner-role', status: 'active', business_id: BIZ, roles: ownerRole }, error: null };
    expect((await request(app).put(`/users/${OWNER}`).send({ role_id: 'cashier-role', status: 'banned' })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('nor set the owner\'s approval PIN', async () => {
    manager();
    rows.users = { data: { business_id: BIZ, roles: ownerRole }, error: null };
    expect((await request(app).put(`/users/${OWNER}/pin`).send({ pin: '1234' })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('status is one of the known values, and an admin cannot ban themselves', async () => {
    rows.roles = { data: cashierRole, error: null };
    rows.users = { data: { role_id: 'r1', status: 'active', business_id: BIZ, roles: cashierRole }, error: null };
    expect((await request(app).put(`/users/${STAFF}`).send({ role_id: 'r1', status: 'superuser' })).status).toBe(400);
    expect((await request(app).put(`/users/${ME}`).send({ role_id: 'r1', status: 'banned' })).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('staff cannot be given another business\'s branch', async () => {
    rows.roles = { data: cashierRole, error: null };
    rows.users = { data: { role_id: 'r1', status: 'active', business_id: BIZ, roles: cashierRole }, error: null };
    expect((await request(app).put(`/users/${STAFF}`).send({ role_id: 'r1', location_ids: [LOC, FOREIGN_LOC] })).status).toBe(400);
    expect((await request(app).post('/users/create').send({ email: 'x@example.invalid', password: 'Synthetic-pass-123!', role_name: 'Cashier', location_ids: [FOREIGN_LOC] })).status).toBe(400);
    expect(writes()).toHaveLength(0);
    expect(mockDb.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('money', () => {
  test('an expense cannot be posted to another business\'s till', async () => {
    expect((await request(app).post('/ledger').send({ type: 'expense', amount: 10, location_id: FOREIGN_LOC })).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test('an expense carries a receipt from this business\'s own folder, and only that', async () => {
    rows.business_ledger = { data: { id: 'e1' }, error: null };
    const expense = (receipt_url) => request(app).post('/ledger').send({ type: 'expense', amount: 10, location_id: LOC, receipt_url });
    expect((await expense(`${BIZ}/1728380000000_ab12c.png`)).status).toBe(201);
    expect((await expense('biz-other/1728380000000_ab12c.png')).status).toBe(400);
    expect((await expense(`${BIZ}/../biz-other/x.png`)).status).toBe(400);
    expect(writes()).toHaveLength(1);
  });

  test('a receipt archive never reads outside the business\'s folder', async () => {
    rows.business_ledger = { data: [{ id: 'r1', type: 'expense', receipt_url: 'biz-other/x.png' }], error: null };
    const download = jest.fn();
    mockDb.storage = { from: () => ({ download }) };
    expect((await request(app).get('/ledger/download-receipts?start_date=2026-10-01&end_date=2026-10-08')).status).toBe(409);
    expect(download).not.toHaveBeenCalled();
  });

  test('approve and reject act only on pending entries at the approver\'s branches', async () => {
    Object.assign(mockUser, { role: 'Manager', permissions: [], location_ids: [LOC] });
    rows.business_ledger = { data: [], error: null };
    expect((await request(app).put('/ledger/e1/reject')).status).toBe(404);
    expect((await request(app).put('/ledger/e1/approve')).status).toBe(404);
    for (const calls of queriesOn('business_ledger')) {
      expect(calls).toEqual(expect.arrayContaining([['eq', 'business_id', BIZ], ['eq', 'status', 'pending'], ['in', 'location_id', [LOC]]]));
    }
  });

  test('a deposit payment is one database call, never a separate debit', async () => {
    rows.ar_invoices = { data: { id: 'inv1', business_id: BIZ, total_amount: 100, amount_paid: 0, status: 'open', customer_id: 'c1', invoice_number: 'INV-1' }, error: null };
    mockDb.rpc.mockResolvedValue({ data: { success: true }, error: null });
    expect((await request(app).post('/ar/invoices/inv1/payments').send({ amount: 10, payment_method: 'customer_deposit' })).status).toBe(201);
    expect(mockDb.rpc).toHaveBeenCalledWith('record_ar_deposit_payment', expect.objectContaining({ p_invoice_id: 'inv1', p_amount: 10, p_business_id: BIZ }));
    expect(mutations.filter((m) => m.table === 'store_credit_ledger')).toHaveLength(0);
  });

  test('voiding a deposit payment returns the deposit, once', async () => {
    rows.ar_payments = (calls) => (calls.some((c) => c[0] === 'update')
      ? { data: { id: 'p1', voided_at: 'now' }, error: null }
      : { data: { id: 'p1', business_id: BIZ, invoice_id: 'inv1', amount: 30, payment_method: 'customer_deposit', voided_at: null, ledger_entry_id: null }, error: null });
    rows.ar_invoices = { data: { id: 'inv1', total_amount: 40, amount_paid: 30, customer_id: 'c1', invoice_number: 'INV-1' }, error: null };
    expect((await request(app).put('/ar/payments/p1/void')).status).toBe(200);
    const claim = queriesOn('ar_payments').find((calls) => calls.some((c) => c[0] === 'update'));
    expect(claim).toContainEqual(['is', 'voided_at', null]);
    expect(mutations).toContainEqual(expect.objectContaining({ table: 'store_credit_ledger', op: 'insert', payload: expect.objectContaining({ customer_id: 'c1', type: 'refund', amount: 30 }) }));

    // A second click finds nothing left to claim and returns nothing.
    mutations.length = 0;
    rows.ar_payments = (calls) => (calls.some((c) => c[0] === 'update')
      ? { data: null, error: null }
      : { data: { id: 'p1', business_id: BIZ, invoice_id: 'inv1', amount: 30, payment_method: 'customer_deposit', voided_at: null, ledger_entry_id: null }, error: null });
    expect((await request(app).put('/ar/payments/p1/void')).status).toBe(400);
    expect(mutations.filter((m) => m.table === 'store_credit_ledger')).toHaveLength(0);
  });

  test('a customer payment cannot be posted to another business\'s branch', async () => {
    rows.ar_invoices = { data: { id: 'inv1', business_id: BIZ, total_amount: 100, amount_paid: 0, status: 'open' }, error: null };
    const res = await request(app).post('/ar/invoices/inv1/payments').send({ amount: 10, payment_method: 'cash', location_id: FOREIGN_LOC });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
    expect(mockDb.rpc).not.toHaveBeenCalled();
  });
});

describe('orders, analytics, loyalty, alerts', () => {
  test('customer orders need manage_sales, and their lines this business\'s products', async () => {
    Object.assign(mockUser, { role: 'Cashier', permissions: ['create_sales'] });
    expect((await request(app).get('/customer-orders')).status).toBe(403);
    Object.assign(mockUser, { role: 'Business Admin', permissions: [] });
    rows.customers = { data: { id: 'c1', business_id: BIZ }, error: null };
    const res = await request(app).post('/customer-orders').send({ customer_id: 'c1', items: [{ product_id: FOREIGN_PRODUCT, quantity: 1, unit_price: 5 }] });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('a Platform Admin\'s dashboard reset is still limited to one business', async () => {
    Object.assign(mockUser, { role: 'Platform Admin', active_location_id: undefined });
    rows.sales = { data: [], error: null };
    expect((await request(app).delete('/analytics/reset')).status).toBe(200);
    for (const table of ['sales', 'stock_movements', 'alerts']) {
      for (const calls of queriesOn(table)) expect(calls).toContainEqual(['eq', 'business_id', BIZ]);
    }
  });

  test('analytics follow the permissions the dashboard shows them under', async () => {
    Object.assign(mockUser, { role: 'Cashier', permissions: ['create_sales'] });
    for (const path of ['summary', 'recent-activity', 'sales-trend', 'top-products', 'inventory-health', 'staff-performance', 'shrinkage']) {
      expect([path, (await request(app).get(`/analytics/${path}`)).status]).toEqual([path, 403]);
    }
  });

  test('gift card codes need manage_loyalty', async () => {
    Object.assign(mockUser, { role: 'Cashier', permissions: ['create_sales'] });
    expect((await request(app).get('/loyalty/gift-cards')).status).toBe(403);
    expect((await request(app).get('/loyalty/gift-cards/lookup/GC-1')).status).toBe(403);
  });

  test('an alert cannot be cleared by its subject or outside the resolver\'s branches', async () => {
    Object.assign(mockUser, { role: 'Store Manager', permissions: ['view_alerts'], location_ids: [LOC] });
    rows.alerts = { data: { id: 'a1', business_id: BIZ, location_id: LOC, status: 'open', user_id: ME }, error: null };
    expect((await request(app).put('/alerts/a1/resolve')).status).toBe(403);
    rows.alerts = { data: { id: 'a1', business_id: BIZ, location_id: LOC2, status: 'open', user_id: STAFF }, error: null };
    expect((await request(app).put('/alerts/a1/resolve')).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
});

describe('limits on guessing and sending codes', () => {
  const realFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'success' }) })); });
  afterAll(() => { global.fetch = realFetch; });

  test('manager PINs stop being checked after five failures', async () => {
    Object.assign(mockUser, { role: 'Cashier', permissions: ['create_sales'] });
    rows.audit_logs = { count: 5, error: null };
    expect((await request(app).post('/sales/verify-pin').send({ pin: '1234' })).status).toBe(429);
    expect(queriesOn('users')).toHaveLength(0); // no PIN was compared
  });

  test('a customer code is not re-sent more than three times in ten minutes', async () => {
    rows.customers = { data: { business_id: BIZ, phone: '+233241234567', name: 'C', verification_code: null, otp_expires_at: null }, error: null };
    rows.audit_logs = { count: 3, error: null };
    expect((await request(app).post('/customers/c1/send-verification')).status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  test('five wrong guesses void the code', async () => {
    rows.customers = { data: { business_id: BIZ, verification_code: '4821', otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString() }, error: null };
    rows.audit_logs = { count: 5, error: null };
    expect((await request(app).post('/customers/c1/verify').send({ code: '0000' })).status).toBe(429);
    expect(mutations).toContainEqual(expect.objectContaining({ table: 'customers', op: 'update', payload: { verification_code: null, otp_expires_at: null } }));
  });
});

describe('reads', () => {
  test('a sale needs view_sales, or create_sales and being its salesperson', async () => {
    Object.assign(mockUser, { role: 'Stock Clerk', permissions: ['view_inventory'], location_ids: [LOC] });
    expect((await request(app).get('/sales/s1')).status).toBe(403);
    Object.assign(mockUser, { role: 'Cashier', permissions: ['create_sales'] });
    rows.sales = { data: { id: 's1' }, error: null };
    expect((await request(app).get('/sales/s1')).status).toBe(200);
    expect(queriesOn('sales')[0]).toContainEqual(['eq', 'salesperson_id', ME]);
  });

  test('inventory analytics read only this business\'s branches', async () => {
    rows.locations = { data: [{ id: LOC }, { id: LOC2 }], error: null };
    expect((await request(app).get('/inventory-analytics/valuation')).status).toBe(200);
    const inventory = queriesOn('product_inventory');
    expect(inventory.length).toBeGreaterThan(0);
    for (const calls of inventory) expect(calls).toContainEqual(['in', 'location_id', [LOC, LOC2]]);
  });
});

describe('SKUs', () => {
  test('the importer checks SKUs against this business only, never the whole platform', async () => {
    const { validateProductRows } = require('../services/importValidators');
    rows.locations = { data: [{ id: LOC }], error: null };
    await validateProductRows([{ name: 'Fridge', sku: 'HS-220', price: '10' }], BIZ);
    const skuQuery = queriesOn('products').find((calls) => calls.some((c) => c[0] === 'in' && c[1] === 'sku'));
    expect(skuQuery).toContainEqual(['eq', 'business_id', BIZ]);
  });
});
