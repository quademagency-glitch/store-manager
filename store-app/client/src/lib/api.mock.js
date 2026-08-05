import { MOCK_MODE } from './mockMode';

/**
 * Fixture data for the Playwright visual harness. Only reachable when
 * VITE_USE_MOCKS is set — see src/lib/mockMode.js.
 *
 * Timestamps are fixed, not relative to `Date.now()`, so screenshots are
 * byte-stable across runs and don't need masking.
 */
const T0 = '2026-07-31T12:00:00.000Z';

const FIXTURES = {
  '/analytics/summary': { todaySalesTotal: 12450.5, totalProducts: 154, lowStockCount: 3, theftAlertsCount: 0 },
  '/analytics/sales-trend': [
    { date: 'Jul 25', revenue: 4500 },
    { date: 'Jul 26', revenue: 6200 },
    { date: 'Jul 27', revenue: 5800 },
    { date: 'Jul 28', revenue: 7100 },
    { date: 'Jul 29', revenue: 8400 },
    { date: 'Jul 30', revenue: 11200 },
    { date: 'Jul 31', revenue: 12450 },
  ],
  '/analytics/top-products': [
    { name: 'Premium Widget', revenue: 4200, quantity: 42 },
    { name: 'Deluxe Service', revenue: 3100, quantity: 15 },
    { name: 'Standard Widget', revenue: 1800, quantity: 60 },
  ],
  '/analytics/inventory-health': [
    { name: 'In Stock', value: 120, fill: '#10b981' },
    { name: 'Low Stock', value: 12, fill: '#f59e0b' },
    { name: 'Out of Stock', value: 3, fill: '#ef4444' },
  ],
  '/analytics/staff-performance': [
    { name: 'Jane Smith', email: 'jane@quaderp.com', sales: 45, revenue: 8400 },
    { name: 'John Doe', email: 'john@quaderp.com', sales: 38, revenue: 5200 },
  ],
  '/analytics/recent-activity': [
    { id: '1', type: 'sale', title: 'New Sale Completed', time: T0, amount: '$1,200.00', status: 'success' },
    { id: '2', type: 'stock', title: 'Stock Adjusted', time: '2026-07-31T11:00:00.000Z', amount: '15 items', status: 'warning' },
    { id: '3', type: 'sale', title: 'New Sale Completed', time: '2026-07-31T10:00:00.000Z', amount: '$450.00', status: 'success' },
  ],
  '/customers': [
    { id: 'c1', first_name: 'Alice', last_name: 'Johnson', email: 'alice@example.com', phone: '555-0101', total_spent: 450, created_at: T0 },
    { id: 'c2', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com', phone: '555-0102', total_spent: 1200, created_at: T0 },
  ],
  // `product_inventory` mirrors what the real endpoint selects:
  //   product_inventory(location_id, quantity, low_stock_threshold)
  //
  // It is the field the POS actually reads. Without it the cart computed a
  // stock of 0 and refused every product with "This product is out of stock",
  // which made the entire per-unit scanning flow — cart, Unit 1..N rows, Scan
  // QR, the checkout gate — unreachable under mocks, and therefore invisible
  // to both the visual and invariant suites. `stock_quantity` alone looked
  // like stock but is not what addToCart consults.
  '/products': [
    {
      id: 'p1', name: 'Premium Widget', sku: 'WGT-001', price: 99.99, stock_quantity: 145,
      product_inventory: [{ location_id: 'mock-loc', quantity: 145, low_stock_threshold: 10 }],
    },
    {
      id: 'p2', name: 'Standard Widget', sku: 'WGT-002', price: 49.99, stock_quantity: 450,
      product_inventory: [{ location_id: 'mock-loc', quantity: 450, low_stock_threshold: 25 }],
    },
  ],
  '/locations': [{ id: 'mock-loc', name: 'Main Branch' }],

  // The real endpoint returns the business row plus `currency` and `country`
  // resolved against the active location. `country` is what supplies the
  // dialing code for phone numbers typed without one — without this fixture
  // the forms fall back to the *browser's* locale, so under a headless en-US
  // Chromium every Ghanaian number would be rejected as invalid and the whole
  // phone flow would be untestable under mocks.
  '/businesses/me': {
    id: 'mock-biz',
    name: 'QuadERP Demo Store',
    currency: 'GHS',
    country: 'GH',
    contact_email: 'admin@quaderp.com',
    phone: '0241234567',
  },

  /* ─────────────────────────────────────────────────────────────────────
     Everything below closes a gap found by crawling all 38 app routes: only
     7 resolved cleanly, so 31 pages were screenshotting their *error* state
     and the baselines recorded a red "Failed to fetch data." banner instead
     of the UI. The visual suite cannot regress a screen it never renders.

     Envelope shapes are taken from the server handlers, not guessed — the
     paginated ones return `{ data, total, page, totalPages }` while the
     plain lists return a bare array, and a page reading `res.data` off an
     array (or `.map` off an envelope) breaks in a way a fixture is supposed
     to catch rather than cause.
     ───────────────────────────────────────────────────────────────────── */

  // ── Admin / access control (routes/users.js, roles.js) ──
  '/users': [
    { id: 'u1', name: 'Ama Mensah', email: 'ama@quaderp.com', status: 'active',
      roles: { name: 'Business Admin' }, user_locations: [{ location_id: 'mock-loc' }] },
    { id: 'u2', name: 'Kofi Boateng', email: 'kofi@quaderp.com', status: 'active',
      roles: { name: 'Manager' }, user_locations: [{ location_id: 'mock-loc' }] },
  ],
  '/roles': [
    { id: 'r1', name: 'Business Admin', permissions: ['manage_business', 'manage_users'], is_system: true },
    { id: 'r2', name: 'Manager', permissions: ['view_products', 'create_sales'], is_system: true },
    { id: 'r3', name: 'Cashier', permissions: ['create_sales'], is_system: false },
  ],

  // ── Store operations ──
  '/suppliers': [
    { id: 's1', name: 'Accra Wholesale Ltd', contact_person: 'Yaw Darko',
      phone: '+233302123456', email: 'sales@accrawholesale.com', balance: 4200 },
    { id: 's2', name: 'Tema Distributors', contact_person: 'Efua Sarpong',
      phone: '+233303987654', email: 'orders@temadist.com', balance: 0 },
  ],
  '/alerts': [
    { id: 'a1', type: 'low_stock', severity: 'warning', status: 'pending',
      message: 'Premium Widget is below its reorder threshold', created_at: T0,
      product: { name: 'Premium Widget', sku: 'WGT-001' } },
    { id: 'a2', type: 'shrinkage', severity: 'critical', status: 'resolved',
      message: 'Stock count mismatch on Standard Widget', created_at: T0,
      product: { name: 'Standard Widget', sku: 'WGT-002' } },
  ],
  '/purchase-orders': {
    data: [
      { id: 'po1', po_number: 'PO-1001', status: 'pending', total_amount: 12500, currency: 'GHS',
        created_at: T0, expected_date: T0, supplier: { name: 'Accra Wholesale Ltd' } },
      { id: 'po2', po_number: 'PO-1002', status: 'received', total_amount: 3400, currency: 'GHS',
        created_at: T0, received_date: T0, supplier: { name: 'Tema Distributors' } },
    ],
    total: 2, page: 1, totalPages: 1,
  },
  '/stock': {
    data: [
      { id: 'sm1', quantity_change: -3, reason: 'sale', created_at: T0,
        product: { name: 'Premium Widget', sku: 'WGT-001' }, user: { name: 'Ama Mensah' } },
      { id: 'sm2', quantity_change: 50, reason: 'received', created_at: T0,
        product: { name: 'Standard Widget', sku: 'WGT-002' }, user: { name: 'Kofi Boateng' } },
    ],
    total: 2, page: 1, totalPages: 1,
  },
  '/sales/history': {
    data: [
      { id: 'sale1', receipt_number: 'RCP-5001', total_amount: 149.98, payment_method: 'cash',
        status: 'completed', created_at: T0, customer: { name: 'Alice Johnson' } },
      { id: 'sale2', receipt_number: 'RCP-5002', total_amount: 99.99, payment_method: 'momo',
        status: 'completed', created_at: T0, customer: { name: 'Bob Smith' } },
    ],
    total: 2, page: 1, totalPages: 1,
  },
  '/customer-orders': {
    data: [
      { id: 'co1', order_number: 'ORD-2001', status: 'pending', total_amount: 560,
        created_at: T0, customer: { name: 'Alice Johnson' } },
    ],
    total: 1, page: 1, totalPages: 1,
  },

  // ── Accounting (routes/ledger.js, accountsPayable.js, accountsReceivable.js) ──
  '/ledger/till-balance': { view: 'basic', currentBalance: 8450.25 },
  '/ledger/financial-summary': {
    period: { start: '2026-07-01', end: '2026-07-31' },
    income: { total_sales: 82400, other_income: 1200 },
    expenses: { total_purchases: 41000, other_expenses: 6800 },
    net: 35800,
  },
  '/ap/bills': {
    data: [
      { id: 'b1', bill_number: 'BILL-301', status: 'unpaid', amount: 4200, balance: 4200,
        due_date: T0, created_at: T0, supplier: { name: 'Accra Wholesale Ltd' } },
    ],
    total: 1, page: 1, totalPages: 1,
  },
  '/ar/invoices': {
    data: [
      { id: 'i1', invoice_number: 'INV-201', status: 'partial', amount: 1800, balance: 600,
        due_date: T0, created_at: T0, customer: { name: 'Alice Johnson' } },
    ],
    total: 1, page: 1, totalPages: 1,
  },
  '/accounting/templates': [
    { id: 't1', name: 'Standard Sales Entry', type: 'sale', is_active: true, created_at: T0 },
    { id: 't2', name: 'Purchase Entry', type: 'purchase', is_active: true, created_at: T0 },
  ],
  '/analytics/reconciliation': [
    { id: 'u1', name: 'Ama Mensah', email: 'ama@quaderp.com', role: 'Business Admin',
      salesCount: 45, totalSalesRevenue: 8400, totalDiscounts: 120,
      voidCount: 1, totalVoidValue: 200, shrinkageCount: 0, totalShrinkageValue: 0 },
    { id: 'u2', name: 'Kofi Boateng', email: 'kofi@quaderp.com', role: 'Manager',
      salesCount: 38, totalSalesRevenue: 5200, totalDiscounts: 60,
      voidCount: 0, totalVoidValue: 0, shrinkageCount: 2, totalShrinkageValue: 340 },
  ],
  '/analytics/shrinkage': [
    { id: 'sh1', quantity_change: -2, reason: 'damage', created_at: T0, value_lost: 199.98,
      product: { name: 'Premium Widget', sku: 'WGT-001', price: 99.99 }, user: { name: 'Kofi Boateng' } },
  ],

  // ── Reports (routes/reports.js) ──
  '/reports/pnl': {
    period: { startDate: '2026-07-01', endDate: '2026-07-31', locationId: null },
    revenue: 82400, cogs: 41000, grossProfit: 41400,
    expenses: 6800, netProfit: 34600, grossMargin: 50.2, netMargin: 42,
  },
  '/reports/ar-aging': {
    aging: [
      { customer_id: 'c1', customer_name: 'Alice Johnson', current: 400, days_30: 200, days_60: 0, days_90: 0, total: 600 },
      { customer_id: 'c2', customer_name: 'Bob Smith', current: 0, days_30: 0, days_60: 150, days_90: 50, total: 200 },
    ],
    summary: { current: 400, days_30: 200, days_60: 150, days_90: 50, total: 800 },
  },

  // ── CRM / loyalty ──
  /* Fields mirror `crm_communication_templates` (id, name, type, subject,
     content) exactly. An earlier version of this fixture invented `channel`
     and `body`, which crashed the page: the campaign tab renders
     `t.type.toUpperCase()` with no guard, so a row missing `type` takes the
     whole route down to the ErrorBoundary. */
  '/crm-communications/templates': [
    { id: 'ct1', name: 'Welcome Message', type: 'sms', subject: null,
      content: 'Welcome to QuadERP Demo Store!' },
    { id: 'ct2', name: 'Receipt Follow-up', type: 'email', subject: 'Your receipt',
      content: 'Thanks for shopping with us.' },
  ],
  // Secrets come back masked from the server — mirror that, never a real key.
  '/crm-communications/gateways': [
    { id: 'g1', provider: 'arkesel', type: 'sms', display_name: 'Arkesel SMS',
      sender_id: 'QUADERP', api_key: '••••••••', is_active: true, is_default: true },
    { id: 'g2', provider: 'resend', type: 'email', display_name: 'Resend Email',
      sender_id: 'noreply@quaderp.app', api_key: '••••••••', is_active: true, is_default: true },
  ],
  '/loyalty/rules': { id: 'lr1', points_per_currency: 1, redemption_rate: 0.01, is_active: true },
  '/loyalty/gift-cards': {
    data: [{ id: 'gc1', code: 'GIFT-ABCD', balance: 250, initial_value: 500, status: 'active', created_at: T0 }],
    total: 1, page: 1, totalPages: 1,
  },

  // ── HR (routes/hr.js) ──
  '/hr/attendance/status': { clocked_in: false, active_log: null },
  '/hr/attendance/me': {
    data: [{ id: 'al1', clock_in: T0, clock_out: T0, hours: 8, location: { name: 'Main Branch' } }],
    total: 1, page: 1, limit: 20, totalPages: 1,
  },
  '/hr/attendance': {
    data: [
      { id: 'al1', clock_in: T0, clock_out: T0, hours: 8,
        user: { name: 'Ama Mensah' }, location: { name: 'Main Branch' } },
    ],
    total: 1, page: 1, limit: 20, totalPages: 1,
  },
  '/hr/schedules': [
    { id: 'sc1', shift_date: '2026-07-31', start_time: '08:00', end_time: '17:00',
      user: { name: 'Ama Mensah' }, location: { name: 'Main Branch' } },
  ],
  '/hr/commission-rules': [
    { id: 'cr1', name: 'Standard 5%', rate: 5, basis: 'revenue', is_active: true },
  ],
  '/hr/commissions': {
    data: [{ id: 'cm1', amount: 420, status: 'unpaid', created_at: T0, user: { name: 'Ama Mensah' } }],
    summary: { totalEarned: 420, totalPaid: 0, totalUnpaid: 420 },
    total: 1, page: 1, limit: 20, totalPages: 1,
  },

  // ── Platform / billing ──
  '/subscriptions/plans': [
    { id: 'pl1', name: 'Starter', price: 0, currency: 'GHS', interval: 'month' },
    { id: 'pl2', name: 'Growth', price: 250, currency: 'GHS', interval: 'month' },
  ],
  '/subscriptions/business/mock-biz': {
    id: 'sub1', status: 'active', current_period_end: T0, plan: { name: 'Growth', price: 250, currency: 'GHS' },
  },
  '/billing/invoices': [
    { id: 'bi1', invoice_number: 'QDE-0001', amount: 250, currency: 'GHS', status: 'paid', created_at: T0 },
  ],
  '/billing/invoices/mock-biz': [
    { id: 'bi1', invoice_number: 'QDE-0001', amount: 250, currency: 'GHS', status: 'paid',
      description: 'Growth plan — July 2026', created_at: T0 },
  ],

  // ── Onboarding + device pairing ──
  '/businesses/me/setup-status': {
    steps: [
      { key: 'profile', label: 'Complete your business profile', complete: true, actionPath: '/business-admin/organization' },
      { key: 'locations', label: 'Add at least one location', complete: true, actionPath: '/business-admin/locations' },
      { key: 'accounting_templates', label: 'Set up accounting templates', complete: true, actionPath: '/business-admin/setup' },
      { key: 'products', label: 'Import products and opening stock', complete: true, actionPath: '/imports/products' },
      { key: 'customers', label: 'Import customers and opening balances', complete: false, actionPath: '/imports/customers' },
      { key: 'suppliers', label: 'Import suppliers and opening balances', complete: false, actionPath: '/imports/suppliers' },
      { key: 'team', label: 'Invite your team', complete: true, actionPath: '/business-admin/team' },
    ],
    dismissed: false,
  },
  '/scanner/status': { linked: false },
  // Fixed, obviously-fake value: a changing token would make the QR on the
  // profile page render differently on every capture.
  '/scanner/token': { token: 'mock-scanner-token' },
};

const MISS = { hit: false, data: undefined };

/**
 * Resolve an endpoint against the fixtures.
 *
 * Matching is on the exact pathname (query string stripped) — NOT a substring
 * test. A substring test made `/products/123/batches` return the `/products`
 * collection, which silently fed list data to detail views.
 *
 * In 'empty' mode every known collection resolves to `[]` so empty states can
 * be exercised across the app without hand-building scenarios.
 */
export function resolveMock(endpoint) {
  const path = String(endpoint).split('?')[0].replace(/\/+$/, '') || '/';

  if (!Object.prototype.hasOwnProperty.call(FIXTURES, path)) {
    /* A miss falls through to the real network path in api.js, which has no
       session under the harness and throws "No authentication token found" —
       so the page screenshots its *error* state and the baseline records a red
       banner instead of the UI. That is silent today: the thrown error names
       no endpoint. Name it here so a gap is obvious rather than mysterious. */
    console.warn(`[mock] no fixture for ${path} — page will render its error state`);
    return MISS;
  }

  const data = FIXTURES[path];
  if (MOCK_MODE === 'empty') {
    return { hit: true, data: Array.isArray(data) ? [] : {} };
  }
  return { hit: true, data };
}
