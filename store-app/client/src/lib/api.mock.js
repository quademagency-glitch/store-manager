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
  '/analytics/summary': { todaySalesTotal: 14382.5, totalProducts: 154, lowStockCount: 3, theftAlertsCount: 2 },
  '/analytics/sales-trend': [
    { date: 'Jul 25', revenue: 9240 },
    { date: 'Jul 26', revenue: 11580 },
    { date: 'Jul 27', revenue: 12140 },
    { date: 'Jul 28', revenue: 8970 },
    { date: 'Jul 29', revenue: 10460 },
    { date: 'Jul 30', revenue: 13725 },
    { date: 'Jul 31', revenue: 14382.5 },
  ],
  /* Revenue is quantity × the catalogue price below, so the bar chart and the
     product list cannot drift into disagreeing with each other. */
  '/analytics/top-products': [
    { name: 'Perfumed Rice 5kg', revenue: 13916, quantity: 142 },
    { name: 'Milo Tin 400g', revenue: 10416, quantity: 168 },
    { name: 'Indomie Chicken (40 pack)', revenue: 9216, quantity: 96 },
    { name: 'Frytol Cooking Oil 2L', revenue: 6864, quantity: 88 },
    { name: 'Voltic Water 1.5L', revenue: 6110, quantity: 940 },
  ],
  '/analytics/inventory-health': [
    { name: 'In Stock', value: 120, fill: '#10b981' },
    { name: 'Low Stock', value: 12, fill: '#f59e0b' },
    { name: 'Out of Stock', value: 3, fill: '#ef4444' },
  ],
  '/analytics/staff-performance': [
    { name: 'Ama Mensah', email: 'ama@adomsuperstore.com', sales: 128, revenue: 41280 },
    { name: 'Kofi Boateng', email: 'kofi@adomsuperstore.com', sales: 96, revenue: 28640 },
    { name: 'Grace Owusu', email: 'grace@adomsuperstore.com', sales: 74, revenue: 19180 },
  ],
  /* `amount` is pre-formatted by the server, so it carries its own currency
     symbol rather than going through the page's formatter. It has to be GH₵
     here or the activity feed contradicts every other figure on the dashboard. */
  '/analytics/recent-activity': [
    { id: '1', type: 'sale', title: 'New Sale Completed', time: T0, amount: 'GH₵248.50', status: 'success' },
    { id: '2', type: 'stock', title: 'Stock Adjusted', time: '2026-07-31T11:00:00.000Z', amount: '15 items', status: 'warning' },
    { id: '3', type: 'sale', title: 'New Sale Completed', time: '2026-07-31T10:00:00.000Z', amount: 'GH₵96.00', status: 'success' },
  ],
  '/customers': [
    { id: 'c1', first_name: 'Adwoa', last_name: 'Nyarko', email: 'adwoa.nyarko@gmail.com', phone: '0203334455', total_spent: 2480, created_at: T0 },
    { id: 'c2', first_name: 'Yaw', last_name: 'Owusu', email: 'yaw.owusu@gmail.com', phone: '0553332211', total_spent: 1165, created_at: T0 },
    { id: 'c3', first_name: 'Esi', last_name: 'Quartey', email: 'esi.quartey@gmail.com', phone: '0205556677', total_spent: 640, created_at: T0 },
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
  //
  // Names, prices and SKUs are lifted from the real demo seeder
  // (server/scripts/seed-demo-data.js) so a screenshot taken from the mock
  // harness and one taken from the live sandbox show the same shop. `p6` sits
  // under its reorder threshold on purpose — the inventory pages need a
  // genuine low-stock row to show.
  '/products': [
    {
      id: 'p1', name: 'Perfumed Rice 5kg', sku: 'DEMO-005', category: 'Groceries', price: 98, stock_quantity: 64,
      product_inventory: [{ location_id: 'mock-loc', quantity: 64, low_stock_threshold: 10 }],
    },
    {
      id: 'p2', name: 'Milo Tin 400g', sku: 'DEMO-002', category: 'Drinks', price: 62, stock_quantity: 112,
      product_inventory: [{ location_id: 'mock-loc', quantity: 112, low_stock_threshold: 15 }],
    },
    {
      id: 'p3', name: 'Indomie Chicken (40 pack)', sku: 'DEMO-011', category: 'Household', price: 96, stock_quantity: 38,
      product_inventory: [{ location_id: 'mock-loc', quantity: 38, low_stock_threshold: 10 }],
    },
    {
      id: 'p4', name: 'Frytol Cooking Oil 2L', sku: 'DEMO-007', category: 'Personal Care', price: 78, stock_quantity: 52,
      product_inventory: [{ location_id: 'mock-loc', quantity: 52, low_stock_threshold: 12 }],
    },
    {
      id: 'p5', name: 'Voltic Water 1.5L', sku: 'DEMO-020', category: 'Pharmacy', price: 6.5, stock_quantity: 480,
      product_inventory: [{ location_id: 'mock-loc', quantity: 480, low_stock_threshold: 60 }],
    },
    {
      id: 'p6', name: 'Gino Tomato Paste 400g', sku: 'DEMO-009', category: 'Groceries', price: 18, stock_quantity: 7,
      product_inventory: [{ location_id: 'mock-loc', quantity: 7, low_stock_threshold: 24 }],
    },
  ],
  '/locations': [{ id: 'mock-loc', name: 'Adom Superstore — Osu' }],
  /* Bare array of distinct category names, as GET /api/pricing/categories
     returns. The price-tag printer, bulk price update and price list all read
     it. They used to swallow a failure entirely, so without this fixture their
     category pickers rendered permanently empty with nothing saying why; they
     now fall back to an empty list AND report the error, but the fixture is
     still needed so the mocked runs exercise a populated picker.
     Mirrors the catalogue in the demo seeder. */
  '/pricing/categories': ['Drinks', 'Groceries', 'Household', 'Personal Care', 'Pharmacy', 'Stationery'],

  // The real endpoint returns the business row plus `currency` and `country`
  // resolved against the active location. `country` is what supplies the
  // dialing code for phone numbers typed without one — without this fixture
  // the forms fall back to the *browser's* locale, so under a headless en-US
  // Chromium every Ghanaian number would be rejected as invalid and the whole
  // phone flow would be untestable under mocks.
  '/businesses/me': {
    id: 'mock-biz',
    name: 'Adom Superstore',
    currency: 'GHS',
    country: 'GH',
    contact_email: 'hello@adomsuperstore.com',
    phone: '0302123456',
    city: 'Accra',
    region: 'Greater Accra',
    address_line1: '18 Oxford Street, Osu',
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
    { id: 'u1', name: 'Ama Mensah', email: 'ama@adomsuperstore.com', status: 'active',
      roles: { name: 'Business Admin' }, user_locations: [{ location_id: 'mock-loc' }] },
    { id: 'u2', name: 'Kofi Boateng', email: 'kofi@adomsuperstore.com', status: 'active',
      roles: { name: 'Manager' }, user_locations: [{ location_id: 'mock-loc' }] },
    { id: 'u3', name: 'Grace Owusu', email: 'grace@adomsuperstore.com', status: 'active',
      roles: { name: 'Sales Executive' }, user_locations: [{ location_id: 'mock-loc' }] },
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
      message: 'Gino Tomato Paste 400g is below its reorder threshold', created_at: T0,
      product: { name: 'Gino Tomato Paste 400g', sku: 'DEMO-009' } },
    { id: 'a2', type: 'shrinkage', severity: 'critical', status: 'pending',
      message: 'Stock count variance on Perfumed Rice 5kg — 3 units unaccounted for', created_at: T0,
      product: { name: 'Perfumed Rice 5kg', sku: 'DEMO-005' } },
    { id: 'a3', type: 'shrinkage', severity: 'warning', status: 'resolved',
      message: 'Two units of Milo Tin 400g missing after the evening count', created_at: T0,
      product: { name: 'Milo Tin 400g', sku: 'DEMO-002' } },
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
        product: { name: 'Perfumed Rice 5kg', sku: 'DEMO-005' }, user: { name: 'Ama Mensah' } },
      { id: 'sm2', quantity_change: 50, reason: 'received', created_at: T0,
        product: { name: 'Milo Tin 400g', sku: 'DEMO-002' }, user: { name: 'Kofi Boateng' } },
      { id: 'sm3', quantity_change: -12, reason: 'sale', created_at: T0,
        product: { name: 'Voltic Water 1.5L', sku: 'DEMO-020' }, user: { name: 'Grace Owusu' } },
    ],
    total: 3, page: 1, totalPages: 1,
  },
  /* Payment methods are constrained to 'cash' | 'card' | 'mobile' by
     sales_payment_method_check — 'momo' would never come back from the server. */
  '/sales/history': {
    data: [
      { id: 'sale1', receipt_number: 'DEMO-00412', total_amount: 248.5, payment_method: 'cash',
        status: 'completed', created_at: T0, customer: { name: 'Adwoa Nyarko' } },
      { id: 'sale2', receipt_number: 'DEMO-00411', total_amount: 96, payment_method: 'mobile',
        status: 'completed', created_at: T0, customer: { name: 'Yaw Owusu' } },
      { id: 'sale3', receipt_number: 'DEMO-00410', total_amount: 461.5, payment_method: 'mobile',
        status: 'completed', created_at: T0, customer: { name: 'Esi Quartey' } },
    ],
    total: 3, page: 1, totalPages: 1,
  },
  '/customer-orders': {
    data: [
      { id: 'co1', order_number: 'ORD-2001', status: 'pending', total_amount: 1470,
        created_at: T0, customer: { name: 'Adwoa Nyarko' } },
    ],
    total: 1, page: 1, totalPages: 1,
  },

  // ── Accounting (routes/ledger.js, accountsPayable.js, accountsReceivable.js) ──
  '/ledger/till-balance': { view: 'basic', currentBalance: 8450.25 },

  /* Bare array, matching GET /api/ledger/pending. This route used to query
     Supabase straight from the browser, so it could not be mocked at all and
     its baseline captured a Postgres error string instead of the queue. */
  '/ledger/pending': [
    { id: 'le1', type: 'expense', amount: 240, description: 'Generator fuel', status: 'pending',
      created_at: T0, date: '2026-07-31', receipt_url: null, metadata: { vendor: 'Total Filling Station' },
      users: { name: 'Kofi Boateng', email: 'kofi@adomsuperstore.com' }, locations: { name: 'Adom Superstore — Osu' } },
    { id: 'le2', type: 'deposit_to_bank', amount: 5000, description: 'Daily banking', status: 'pending',
      created_at: T0, date: '2026-07-31', receipt_url: null, metadata: {},
      users: { name: 'Ama Mensah', email: 'ama@adomsuperstore.com' }, locations: { name: 'Adom Superstore — Osu' } },
  ],
  /* Shape mirrors GET /api/ledger/financial-summary exactly. The previous
     fixture invented `expenses.total_purchases` and a flat `net`, so every
     figure the Till Account summary reads — income.total, expenses.total,
     expenses.categories, deposits.total, net_position — came back undefined
     and the whole panel rendered GH₵0.00 with no category bars at all. */
  '/ledger/financial-summary': {
    period: { start: '2026-07-01', end: '2026-07-31' },
    income: { total_sales: 412800, other_income: 3400, total: 416200 },
    expenses: {
      categories: {
        'Stock Purchase': 318600,
        Rent: 12000,
        Utilities: 6400,
        Transport: 4850,
        Wages: 18200,
      },
      total: 360050,
    },
    deposits: { categories: { 'Bank Deposit': 285000, 'MoMo Cash-out': 42000 }, total: 327000 },
    net_position: 56150,
    entry_count: 214,
  },
  /* Outstanding is derived — BillingLedgerView computes
     `doc[amountField] - doc.amount_paid` — so `amount_paid` is the field that
     has to be here. A `balance` key is never read, which is why both rows
     previously rendered their outstanding column as NaN.
     AP's amount field is `amount`; AR's is `total_amount` (see KIND_CONFIG). */
  '/ap/bills': {
    data: [
      { id: 'b1', bill_number: 'BILL-301', status: 'open', amount: 12400, amount_paid: 0,
        due_date: T0, created_at: T0, supplier: { name: 'Accra Wholesale Ltd' } },
      { id: 'b2', bill_number: 'BILL-302', status: 'partial', amount: 6800, amount_paid: 4500,
        due_date: T0, created_at: T0, supplier: { name: 'Tema Distributors' } },
    ],
    total: 2, page: 1, totalPages: 1,
  },
  /* Matches the aging fixture below, which already had this right:
     total 4820 less 3180 paid leaves 1640 outstanding. Statuses come from
     KIND_CONFIG's AR vocabulary — 'unpaid' is an AP-ism and rendered as
     unstyled text where a real status gets a badge. */
  '/ar/invoices': {
    data: [
      { id: 'i1', invoice_number: 'INV-201', status: 'partial', total_amount: 4820, amount_paid: 3180,
        due_date: T0, created_at: T0, customer: { name: 'Adwoa Nyarko' } },
      { id: 'i2', invoice_number: 'INV-202', status: 'sent', total_amount: 1165, amount_paid: 0,
        due_date: T0, created_at: T0, customer: { name: 'Yaw Owusu' } },
    ],
    total: 2, page: 1, totalPages: 1,
  },
  '/accounting/templates': [
    { id: 't1', name: 'Standard Sales Entry', type: 'sale', is_active: true, created_at: T0 },
    { id: 't2', name: 'Purchase Entry', type: 'purchase', is_active: true, created_at: T0 },
  ],
  '/analytics/reconciliation': [
    { id: 'u1', name: 'Ama Mensah', email: 'ama@adomsuperstore.com', role: 'Business Admin',
      salesCount: 128, totalSalesRevenue: 41280, totalDiscounts: 640,
      voidCount: 1, totalVoidValue: 248.5, shrinkageCount: 0, totalShrinkageValue: 0 },
    { id: 'u2', name: 'Kofi Boateng', email: 'kofi@adomsuperstore.com', role: 'Manager',
      salesCount: 96, totalSalesRevenue: 28640, totalDiscounts: 310,
      voidCount: 0, totalVoidValue: 0, shrinkageCount: 3, totalShrinkageValue: 456 },
    { id: 'u3', name: 'Grace Owusu', email: 'grace@adomsuperstore.com', role: 'Sales Executive',
      salesCount: 74, totalSalesRevenue: 19180, totalDiscounts: 95,
      voidCount: 2, totalVoidValue: 174, shrinkageCount: 2, totalShrinkageValue: 214 },
  ],
  /* The loss-prevention pie chart groups by tags parsed out of `notes`
     ([THEFT_SUSPECTED] / [DAMAGE] / [ADMIN_ERROR] / [UNKNOWN]) — an entry
     without one lands in an "unknown" slice. A single row, as this fixture
     used to hold, drew a one-segment pie and a one-line table, which is not a
     picture of a loss-prevention tool. `value_lost` is quantity × price, the
     same arithmetic the server does. */
  '/analytics/shrinkage': [
    { id: 'sh1', quantity_change: -3, reason: 'shrinkage', created_at: T0, value_lost: 294,
      notes: '[THEFT_SUSPECTED] Stock count variance after the evening count.',
      product: { name: 'Perfumed Rice 5kg', sku: 'DEMO-005', price: 98 }, user: { name: 'Kofi Boateng' } },
    { id: 'sh2', quantity_change: -2, reason: 'shrinkage', created_at: '2026-07-30T16:20:00.000Z', value_lost: 124,
      notes: '[THEFT_SUSPECTED] Two tins missing from the shelf, no matching sale.',
      product: { name: 'Milo Tin 400g', sku: 'DEMO-002', price: 62 }, user: { name: 'Kofi Boateng' } },
    { id: 'sh3', quantity_change: -4, reason: 'shrinkage', created_at: '2026-07-29T11:05:00.000Z', value_lost: 312,
      notes: '[DAMAGE] Cartons soaked in the storeroom after the roof leak.',
      product: { name: 'Frytol Cooking Oil 2L', sku: 'DEMO-007', price: 78 }, user: { name: 'Grace Owusu' } },
    { id: 'sh4', quantity_change: -6, reason: 'shrinkage', created_at: '2026-07-28T09:40:00.000Z', value_lost: 108,
      notes: '[DAMAGE] Tins dented in transit from the Tema warehouse.',
      product: { name: 'Gino Tomato Paste 400g', sku: 'DEMO-009', price: 18 }, user: { name: 'Grace Owusu' } },
    { id: 'sh5', quantity_change: -16, reason: 'shrinkage', created_at: '2026-07-27T14:15:00.000Z', value_lost: 104,
      notes: '[ADMIN_ERROR] Counted into the wrong branch during the weekly stock take.',
      product: { name: 'Voltic Water 1.5L', sku: 'DEMO-020', price: 6.5 }, user: { name: 'Kofi Boateng' } },
    { id: 'sh6', quantity_change: -1, reason: 'shrinkage', created_at: '2026-07-26T18:30:00.000Z', value_lost: 96,
      notes: '[UNKNOWN] Discrepancy found at close; no cause established.',
      product: { name: 'Indomie Chicken (40 pack)', sku: 'DEMO-011', price: 96 }, user: { name: 'Ama Mensah' } },
  ],

  // ── Reports (routes/reports.js) ──
  /* Grocery margins, not software margins: a 22.8% gross and 12.8% net is what
     an Accra general store actually runs at. The old 50.2% gross would read as
     obviously invented to anyone in the trade. */
  '/reports/pnl': {
    period: { startDate: '2026-07-01', endDate: '2026-07-31', locationId: null },
    revenue: 412800, cogs: 318600, grossProfit: 94200,
    expenses: 41500, netProfit: 52700, grossMargin: 22.8, netMargin: 12.8,
  },
  /* `aging` is four *bucket arrays* keyed current/days_30/days_60/days_90_plus,
     and `summary` totals them under those same keys plus `totalOutstanding` —
     see GET /api/reports/ar-aging. The old fixture made `aging` a flat array of
     per-customer rows, so `arAging.aging.current` was undefined: every bucket
     tile showed zero and the invoice table below rendered its empty state. */
  '/reports/ar-aging': {
    aging: {
      current: [
        { id: 'i1', invoice_number: 'INV-201', customer_id: 'c1', customer: { name: 'Adwoa Nyarko' },
          total_amount: 4820, amount_paid: 3180, outstanding: 1640, status: 'partial',
          due_date: '2026-08-14', issued_date: '2026-07-15', days_overdue: 0 },
      ],
      days_30: [
        { id: 'i2', invoice_number: 'INV-202', customer_id: 'c2', customer: { name: 'Yaw Owusu' },
          total_amount: 1165, amount_paid: 0, outstanding: 1165, status: 'unpaid',
          due_date: '2026-07-18', issued_date: '2026-06-18', days_overdue: 13 },
      ],
      days_60: [
        { id: 'i3', invoice_number: 'INV-198', customer_id: 'c3', customer: { name: 'Esi Quartey' },
          total_amount: 940, amount_paid: 300, outstanding: 640, status: 'partial',
          due_date: '2026-06-20', issued_date: '2026-05-20', days_overdue: 41 },
      ],
      days_90_plus: [
        { id: 'i4', invoice_number: 'INV-181', customer_id: 'c2', customer: { name: 'Yaw Owusu' },
          total_amount: 380, amount_paid: 0, outstanding: 380, status: 'unpaid',
          due_date: '2026-04-22', issued_date: '2026-03-22', days_overdue: 100 },
      ],
    },
    summary: { current: 1640, days_30: 1165, days_60: 640, days_90_plus: 380, totalOutstanding: 3825 },
  },

  // ── CRM / loyalty ──
  /* Fields mirror `crm_communication_templates` (id, name, type, subject,
     content) exactly. An earlier version of this fixture invented `channel`
     and `body`, which crashed the page: the campaign tab renders
     `t.type.toUpperCase()` with no guard, so a row missing `type` takes the
     whole route down to the ErrorBoundary. */
  '/crm-communications/templates': [
    { id: 'ct1', name: 'Welcome Message', type: 'sms', subject: null,
      content: 'Akwaaba! Thanks for shopping at Adom Superstore.' },
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
    data: [
      { id: 'gc1', code: 'GIFT-ABCD', balance: 250, initial_value: 500, status: 'active', created_at: T0 },
      { id: 'gc2', code: 'GIFT-EFGH', balance: 0, initial_value: 200, status: 'redeemed', created_at: T0 },
    ],
    total: 2, page: 1, totalPages: 1,
  },

  // ── HR (routes/hr.js) ──
  '/hr/attendance/status': { clocked_in: false, active_log: null },
  '/hr/attendance/me': {
    data: [{ id: 'al1', clock_in: T0, clock_out: T0, hours: 8, location: { name: 'Adom Superstore — Osu' } }],
    total: 1, page: 1, limit: 20, totalPages: 1,
  },
  '/hr/attendance': {
    data: [
      { id: 'al1', clock_in: T0, clock_out: T0, hours: 8,
        user: { name: 'Ama Mensah' }, location: { name: 'Adom Superstore — Osu' } },
    ],
    total: 1, page: 1, limit: 20, totalPages: 1,
  },
  '/hr/schedules': [
    { id: 'sc1', shift_date: '2026-07-31', start_time: '08:00', end_time: '17:00',
      user: { name: 'Ama Mensah' }, location: { name: 'Adom Superstore — Osu' } },
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
    return { hit: true, data: emptyLike(data) };
  }
  return { hit: true, data };
}

/**
 * The empty version of a response, keeping its SHAPE.
 *
 * This used to be `Array.isArray(data) ? [] : {}`, which threw away every key
 * of an object response. `/businesses/me/setup-status` returns
 * `{ steps: [...], dismissed }` and became `{}`, so `status.steps` was
 * undefined and the page threw on render.
 *
 * Four pages crashed that way in empty mode, and the crash hid itself: a page
 * that has thrown renders no table, so the empty-state suite found no <tbody>
 * to object to and reported green for all 37 routes. The mode meant to prove
 * empty states worked was silently unable to reach four of them.
 *
 * An empty response from the API is not a shapeless one. The server still
 * sends `{ steps: [] }`, `{ branches: [] }`, `{ aging: { current: [] , ... } }`
 * when a business has no data, so the fixture has to as well, or "empty mode"
 * is testing a shape production never produces.
 *
 * Numbers go to 0 and booleans to false, because a business with no sales
 * genuinely has a total of 0. Strings are kept: they are names, currency codes
 * and ids, which a new business still has.
 */
function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, emptyLike(v)]),
    );
  }
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return value;
}
