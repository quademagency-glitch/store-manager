#!/usr/bin/env node
/**
 * Build (or rebuild) the public demo business.
 *
 *   node scripts/seed-demo-data.js            reset and reseed
 *   node scripts/seed-demo-data.js --if-empty seed only if it does not exist
 *
 * Also called on a schedule by services/demoResetCron.js, which is what keeps
 * the sandbox usable: visitors can create sales, edit products and generally
 * make a mess, and every reset puts it back.
 *
 * Everything is deterministic apart from the sales spread, same products,
 * same prices, same people every time, so a screenshot taken from the demo
 * today matches one taken next month. Sales are randomised within fixed
 * bounds and dated across the last 30 days, because a dashboard whose charts
 * are flat is a poor advertisement.
 *
 * Data is Ghanaian on purpose: GHS prices at realistic Accra retail levels,
 * and names a Ghanaian shop owner would recognise as their own customers.
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { DEMO_EMAIL, DEMO_PASSWORD } = require('../config/demo');

const DEMO_BUSINESS_NAME = 'Adom Superstore (Demo)';
const DEMO_SLUG = 'demo';

const SALES_DAYS = 30;
const TARGET_SALES = 100;

/* ── Catalogue ────────────────────────────────────────────────
   50 products across the categories a Ghanaian general store
   actually carries, priced in GHS. `cost` drives the profit
   figures on the P&L report, so margins are plausible rather
   than uniform. */
const PRODUCTS = [
  ['Ideal Milk 170g', 'Groceries', 8.5, 6.2], ['Milo Tin 400g', 'Groceries', 62, 48],
  ['Nescafé Classic 100g', 'Groceries', 54, 41], ['Lipton Yellow Label 50s', 'Groceries', 28, 20],
  ['Perfumed Rice 5kg', 'Groceries', 98, 79], ['Jasmine Rice 5kg', 'Groceries', 112, 92],
  ['Frytol Cooking Oil 2L', 'Groceries', 78, 63], ['Sunflower Oil 1L', 'Groceries', 45, 35],
  ['Gino Tomato Paste 400g', 'Groceries', 18, 13], ['Tin Tomatoes 800g', 'Groceries', 26, 19],
  ['Indomie Chicken (40 pack)', 'Groceries', 96, 78], ['Spaghetti 500g', 'Groceries', 12, 8.5],
  ['Sugar 1kg', 'Groceries', 22, 17], ['Salt 1kg', 'Groceries', 6, 4],
  ['Gari 2kg', 'Groceries', 34, 26], ['Beans 2kg', 'Groceries', 48, 38],
  ['Groundnut Paste 500g', 'Groceries', 30, 22], ['Shito 250ml', 'Groceries', 25, 17],

  ['Voltic Water 750ml', 'Drinks', 4, 2.6], ['Voltic Water 1.5L', 'Drinks', 6.5, 4.4],
  ['Coca-Cola 500ml', 'Drinks', 8, 5.8], ['Fanta Orange 500ml', 'Drinks', 8, 5.8],
  ['Malta Guinness 330ml', 'Drinks', 12, 8.8], ['Kalyppo Juice 250ml', 'Drinks', 5, 3.4],
  ['Alvaro Pear 330ml', 'Drinks', 11, 8], ['Club Beer 625ml', 'Drinks', 18, 13.5],

  ['Key Soap Bar', 'Household', 14, 10], ['Omo Detergent 900g', 'Household', 42, 33],
  ['Sunlight Dishwash 400ml', 'Household', 22, 16], ['Parazone Bleach 750ml', 'Household', 19, 14],
  ['Toilet Roll (4 pack)', 'Household', 26, 19], ['Mosquito Coil (10s)', 'Household', 9, 6],
  ['Broom', 'Household', 15, 9], ['Bucket 20L', 'Household', 38, 27],
  ['Matches (10 boxes)', 'Household', 7, 4.5], ['Candles (6 pack)', 'Household', 16, 11],

  ['Colgate Toothpaste 100ml', 'Personal Care', 24, 18], ['Toothbrush', 'Personal Care', 9, 5.5],
  ['Lifebuoy Soap', 'Personal Care', 11, 7.5], ['Nivea Body Lotion 400ml', 'Personal Care', 68, 54],
  ['Shea Butter 250g', 'Personal Care', 32, 22], ['Dettol Antiseptic 250ml', 'Personal Care', 46, 36],
  ['Always Pads (8s)', 'Personal Care', 21, 15], ['Baby Wipes (80s)', 'Personal Care', 29, 21],

  ['Paracetamol (24s)', 'Pharmacy', 12, 7], ['Vitamin C (30s)', 'Pharmacy', 35, 25],
  ['Plasters (20s)', 'Pharmacy', 16, 11],

  ['Exercise Book (10s)', 'Stationery', 40, 30], ['Biro Pens (10s)', 'Stationery', 18, 12],
  ['A4 Paper Ream', 'Stationery', 72, 58],
];

/* 30 customers. Ghanaian given names and surnames, a realistic mix of
   day-name names and regional surnames. */
const CUSTOMERS = [
  ['Ama Mensah', '0244123456'], ['Kwame Asante', '0201234567'], ['Akosua Boateng', '0264445566'],
  ['Yaw Owusu', '0553332211'], ['Efua Darko', '0277889900'], ['Kofi Adjei', '0246667788'],
  ['Adwoa Nyarko', '0203334455'], ['Kwabena Osei', '0559998877'], ['Abena Frimpong', '0271112233'],
  ['Kojo Amoah', '0248889911'], ['Esi Quartey', '0205556677'], ['Kwaku Danquah', '0554443322'],
  ['Akua Sarpong', '0279990011'], ['Yaa Agyeman', '0242223344'], ['Kwesi Tetteh', '0207778899'],
  ['Afia Bonsu', '0551110022'], ['Nana Ampofo', '0273335566'], ['Serwaa Antwi', '0245558833'],
  ['Kojo Baffour', '0209992244'], ['Maame Ofori', '0556667711'], ['Kwadwo Larbi', '0271113399'],
  ['Araba Hayford', '0243337755'], ['Fiifi Koomson', '0206668822'], ['Mansa Appiah',  '0554442266'],
  ['Kobby Annan', '0278884433'], ['Naa Ayikai', '0241119966'], ['Selorm Agbeko', '0202225588'],
  ['Delali Kudjo', '0557773311'], ['Elikem Nutsugah', '0276662299'], ['Sena Fiadzo', '0244447722'],
];

const LOCATIONS = [
  { name: 'Adom Superstore, Osu', address: '18 Oxford Street, Osu, Accra' },
  { name: 'Adom Superstore, Madina', address: 'Madina Market Road, Accra' },
];

/* Three staff, one per role, so a visitor can see how permissions play out. */
const STAFF = [
  { name: 'Grace Owusu', email: 'grace.demo@quaderp.app', role: 'Manager' },
  { name: 'Daniel Mensah', email: 'daniel.demo@quaderp.app', role: 'Sales Executive' },
  { name: 'Priscilla Asare', email: 'priscilla.demo@quaderp.app', role: 'Sales Executive' },
];

/* Weighted, not uniform: cash still dominates Ghanaian retail, mobile money is
   a strong second, card a distant third. Values are constrained by
   sales_payment_method_check to exactly 'cash' | 'card' | 'mobile'. */
const PAYMENT_METHODS = ['cash', 'cash', 'cash', 'mobile', 'mobile', 'card'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

/** Throw on a Supabase error so the top-level catch can report which step failed. */
function must(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.message}`);
  return data;
}

/** Find the demo business, if it exists. */
async function findDemoBusiness() {
  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('id, name, is_demo')
    .eq('is_demo', true)
    .maybeSingle();
  if (error) throw new Error(`lookup demo business: ${error.message}`);
  return data;
}

/** Every address the seeder ever creates an auth account for. */
const DEMO_EMAILS = new Set([DEMO_EMAIL, ...STAFF.map((s) => s.email)]);

/**
 * Remove the demo accounts from auth.users.
 *
 * Keyed on the known email set rather than on the business's `public.users`
 * rows, which is how this went wrong the first time round: a run whose auth
 * deletion failed left orphans behind, and because the *next* teardown had
 * already wiped `public.users`, it had nothing left to look them up by. The
 * orphans then blocked every future seed with "email already registered",
 * permanently.
 *
 * Reading from the fixed list instead makes the teardown self-healing, it
 * cleans up after a half-finished run it had no part in.
 */
async function deleteDemoAuthUsers() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    logger.warn({ err: error }, '[demo] could not list auth users');
    return;
  }

  for (const user of data.users.filter((u) => DEMO_EMAILS.has(u.email))) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      logger.warn({ err: deleteError, email: user.email }, '[demo] could not delete auth user');
    }
  }
}

/**
 * Work out a safe delete order for every business-scoped table.
 *
 * `DELETE FROM businesses` does not do this on its own. Of the 46 tables
 * carrying a business_id, six, products, sales, sale_items, stock_movements,
 * returns and users, were created without ON DELETE CASCADE, so the business
 * row cannot be removed until they are cleared by hand. And they cannot be
 * cleared in any order: sale_items references sales, sales references both
 * products and users, returns references sales.
 *
 * A hardcoded list would work today and rot the first time someone adds a
 * table. So the order is derived from the live foreign-key graph instead: a
 * topological sort with children before parents. New tables are handled the
 * day they are created, by nobody.
 *
 * @param {import('pg').Client} client
 * @returns {Promise<string[]>} table names, safe to delete in this order
 */
async function resolveDeleteOrder(client) {
  const { rows: scoped } = await client.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'business_id'
  `);
  const tables = new Set(scoped.map((r) => r.table_name));

  const { rows: edges } = await client.query(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND c.conrelid <> c.confrelid
  `);

  // parent → children, restricted to the tables we are actually deleting from.
  const strip = (t) => t.replace(/^public\./, '');
  const children = new Map([...tables].map((t) => [t, new Set()]));
  for (const { child, parent } of edges) {
    const c = strip(child);
    const p = strip(parent);
    if (tables.has(c) && tables.has(p)) children.get(p).add(c);
  }

  // Depth-first post-order: everything that points at a table is emitted
  // before the table itself. `visiting` breaks cycles rather than recursing
  // forever, a cycle means no total order exists, and an arbitrary one is
  // the best available answer.
  const order = [];
  const done = new Set();
  const visiting = new Set();

  const visit = (table) => {
    if (done.has(table) || visiting.has(table)) return;
    visiting.add(table);
    for (const child of children.get(table)) visit(child);
    visiting.delete(table);
    done.add(table);
    order.push(table);
  };

  for (const table of tables) visit(table);
  return order;
}

/**
 * Delete the demo business and everything hanging off it.
 *
 * Runs over DIRECT_URL rather than the Supabase JS client, in one
 * transaction: 46 dependent deletes that half-succeed would leave a demo
 * business nobody can sign into and nothing can clean up. The Supabase client
 * cannot open a transaction.
 *
 * Order matters and is not the intuitive one. The auth accounts go **last**,
 * after the transaction. Deleting an auth user cascades into `public.users`,
 * and while this business still has sales, `sales.salesperson_id`, which has
 * no ON DELETE rule, refuses that delete. GoTrue surfaces it only as
 * "Database error deleting user", so the accounts silently survived, and on
 * the next run their addresses were already taken. Clearing the app rows
 * first leaves nothing pointing at them.
 */
async function teardown(businessId) {

  // Required at point of use, not at the top of the file. This module sits in
  // the demo cron's dependency chain, and a top-level `require('pg')` meant
  // every production boot needed the driver, which is how a deploy that had
  // nothing to do with the demo failed to start at all.
  const { Client } = require('pg');

  // Checked rather than passed straight through, because `pg` treats a missing
  // connection string as "use the defaults" and quietly dials localhost:5432.
  // On Railway, where DIRECT_URL was never set, that produced an
  // ECONNREFUSED AggregateError whose .message is the empty string, so the
  // nightly failure logged as `teardown:` and nothing else. The demo tenant
  // sat frozen from 2026-08-13 to 2026-08-21 and no log said why.
  if (!process.env.DIRECT_URL) {
    throw new Error(
      'DIRECT_URL is not set, so the demo tenant cannot be torn down. It must ' +
      'be a direct Postgres connection string (the Supabase session pooler on ' +
      'port 5432 works and is IPv4). Set it in the Railway service variables. ' +
      'Without it this job fails every night and the demo is never rebuilt.'
    );
  }

  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const order = await resolveDeleteOrder(client);
    await client.query('BEGIN');

    for (const table of order) {
      await client.query(`DELETE FROM public.${table} WHERE business_id = $1`, [businessId]);
    }
    await client.query('DELETE FROM public.businesses WHERE id = $1', [businessId]);

    await client.query('COMMIT');
    logger.info({ businessId, tables: order.length }, '[demo] app data removed');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // `err.message` alone is not enough to rely on. An AggregateError from a
    // failed connection carries an empty message and puts everything useful in
    // .code and .errors, so interpolating the message alone throws away the
    // entire diagnosis. Fall back through the fields that are actually
    // populated, and keep the original as `cause`.
    const detail = err.message || err.code || err.name || 'unknown error';
    throw new Error(`teardown: ${detail}`, { cause: err });
  } finally {
    await client.end();
  }

  // Now that nothing references them.
  await deleteDemoAuthUsers();
  logger.info({ businessId }, '[demo] teardown complete');
}

async function seed() {
  // ── Business ──────────────────────────────────────────────
  // Slug is set explicitly rather than left to the trigger: the demo has to
  // keep the same tenant URL (demo.app.quaderp.app) across reseeds, or every
  // link anyone has saved to it breaks the next time this script runs.
  //
  // That URL is not, however, how visitors reach the demo. The landing page
  // sends them to app.quaderp.app/login?demo=1, which Login.jsx recognises and
  // signs in automatically, arriving at the tenant URL directly just shows a
  // login form with no credentials on it.
  const business = must('create business', await supabaseAdmin
    .from('businesses')
    .insert({
      name: DEMO_BUSINESS_NAME,
      slug: DEMO_SLUG,
      status: 'active',
      is_demo: true,
      contact_email: DEMO_EMAIL,
      phone: '0302123456',
      currency: 'GHS',
      country: 'GH',
      tax_rate: 0,
      city: 'Accra',
      region: 'Greater Accra',
      address_line1: '18 Oxford Street, Osu',
    })
    .select('id, name, slug')
    .single());

  const businessId = business.id;
  logger.info({ businessId }, '[demo] business created');

  // ── Locations ─────────────────────────────────────────────
  const locations = must('create locations', await supabaseAdmin
    .from('locations')
    .insert(LOCATIONS.map((l) => ({ ...l, business_id: businessId, currency: 'GHS', country: 'GH' })))
    .select('id, name'));

  // ── Owner + staff ─────────────────────────────────────────
  // The owner is created first and separately: it is the account the public
  // demo-login route signs in as, so its email must be exactly DEMO_EMAIL.
  const owner = await createStaffUser(businessId, {
    name: 'Demo Owner',
    email: DEMO_EMAIL,
    role: 'Business Admin',
  }, locations);

  // Fatal, unlike the staff below: this is the account /auth/demo-login signs
  // in as. Without it the seed would "succeed" and leave a demo nobody can
  // get into, far worse than failing loudly here.
  if (!owner) {
    throw new Error(`could not create the demo owner account (${DEMO_EMAIL})`);
  }

  const staff = [];
  for (const member of STAFF) {
    staff.push(await createStaffUser(businessId, member, locations));
  }
  const salespeople = [owner, ...staff].filter(Boolean);
  logger.info({ count: salespeople.length }, '[demo] staff created');

  // ── Products + per-location stock ─────────────────────────
  const products = must('create products', await supabaseAdmin
    .from('products')
    .insert(PRODUCTS.map(([name, category, price, cost], i) => ({
      business_id: businessId,
      name,
      category,
      price,
      cost_price: cost,
      sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
      product_code: `D${String(i + 1).padStart(3, '0')}`,
    })))
    .select('id, name, price, cost_price'));

  const inventory = [];
  for (const product of products) {
    for (const location of locations) {
      // A few products sit at or below their reorder level on purpose, so the
      // inventory pages have genuine low-stock rows to show.
      //
      // Note this does NOT light up the dashboard's "low stock" tile: that
      // counts rows in `alerts` of type 'LOW_STOCK', and the alerts CHECK
      // constraint (migration 014) only permits VOID, DISCOUNT, SHRINKAGE and
      // CASH_OVERRIDE, so no such row can exist for anyone. Left alone here
      // rather than worked around; the tile is broken for every tenant, not
      // just the demo.
      const scarce = Math.random() < 0.08;
      inventory.push({
        product_id: product.id,
        location_id: location.id,
        quantity: scarce ? randInt(0, 4) : randInt(18, 140),
        low_stock_threshold: 5,
      });
    }
  }
  must('create inventory', await supabaseAdmin.from('product_inventory').insert(inventory));
  logger.info({ products: products.length }, '[demo] catalogue created');

  // ── Customers ─────────────────────────────────────────────
  const customers = must('create customers', await supabaseAdmin
    .from('customers')
    .insert(CUSTOMERS.map(([name, phone], i) => ({
      business_id: businessId,
      name,
      phone,
      is_verified: true,
      customer_code: `DC${String(i + 1).padStart(3, '0')}`,
    })))
    .select('id, name'));

  // ── Sales across the last 30 days ─────────────────────────
  const { sales, items } = buildSales({ businessId, products, customers, locations, salespeople });
  must('create sales', await supabaseAdmin.from('sales').insert(sales));
  must('create sale items', await supabaseAdmin.from('sale_items').insert(items));
  logger.info({ sales: sales.length, items: items.length }, '[demo] sales history created');

  // ── Shrinkage movements ───────────────────────────────────
  // The Loss Prevention report reads `stock_movements` where movement_type is
  // SHRINKAGE, not `alerts`, so without these rows that page is empty in the
  // sandbox no matter how many SHRINKAGE alerts exist below. It is one of the
  // screens a shop owner asks about first, and an empty one answers badly.
  const shrinkage = buildShrinkage({ businessId, products, locations, salespeople });
  must('create shrinkage movements', await supabaseAdmin.from('stock_movements').insert(shrinkage));
  logger.info({ count: shrinkage.length }, '[demo] shrinkage history created');

  // ── A handful of alerts ───────────────────────────────────
  // Enough for the Alerts page and the loss-prevention report to have
  // something to show. Types are limited to what the alerts CHECK constraint
  // permits, and each points at a real sale so drilling in works.
  const alerts = buildAlerts({ businessId, sales, salespeople });
  must('create alerts', await supabaseAdmin.from('alerts').insert(alerts));

  return { businessId, slug: business.slug, counts: {
    locations: locations.length,
    staff: salespeople.length,
    products: products.length,
    customers: customers.length,
    sales: sales.length,
    alerts: alerts.length,
  } };
}

/**
 * Create one auth user and let handle_new_user() write the profile row, the
 * same path routes/users.js uses. Returns the user id, or null if the account
 * could not be created (a leftover auth user from a failed teardown, say), * seeding carries on with whoever it did manage to create.
 */
async function createStaffUser(businessId, { name, email, role }, locations) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name, business_id: businessId, role },
  });

  if (error || !data?.user) {
    logger.warn({ err: error, email }, '[demo] could not create staff account');
    return null;
  }

  // Everyone works across both branches, so the location switcher has
  // something to switch between.
  await supabaseAdmin.from('user_locations').insert(
    locations.map((l) => ({ user_id: data.user.id, location_id: l.id })),
  );

  return data.user.id;
}

/**
 * Generate the sales history.
 *
 * Weighted towards recent days and towards weekends, because a chart with a
 * visible shape demonstrates the reports far better than uniform noise does.
 */
function buildSales({ businessId, products, customers, locations, salespeople }) {
  const sales = [];
  const items = [];
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  let receiptSeq = 1;

  for (let dayOffset = SALES_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = new Date(now - dayOffset * DAY);
    const isWeekend = [0, 6].includes(date.getDay());

    // Recent days get slightly more traffic, weekends noticeably more.
    const recencyBoost = 1 + (SALES_DAYS - dayOffset) / SALES_DAYS;
    const base = (TARGET_SALES / SALES_DAYS) * recencyBoost * (isWeekend ? 1.5 : 1);
    const count = Math.max(1, Math.round(base * (0.7 + Math.random() * 0.6)));

    for (let i = 0; i < count; i++) {
      const saleId = crypto.randomUUID();
      // Trading hours, 8am to 8pm.
      const at = new Date(date);
      at.setHours(randInt(8, 19), randInt(0, 59), randInt(0, 59), 0);

      const lineCount = randInt(1, 5);
      const chosen = new Set();
      let total = 0;

      for (let l = 0; l < lineCount; l++) {
        const product = pick(products);
        if (chosen.has(product.id)) continue; // no duplicate lines on one receipt
        chosen.add(product.id);

        const quantity = randInt(1, 4);
        const unitPrice = Number(product.price);
        total += unitPrice * quantity;

        items.push({
          sale_id: saleId,
          product_id: product.id,
          quantity,
          unit_price: unitPrice,
          business_id: businessId,
        });
      }

      // Roughly half of sales are to a known customer; walk-ins are the rest.
      const customer = Math.random() < 0.5 ? pick(customers) : null;

      sales.push({
        id: saleId,
        business_id: businessId,
        location_id: pick(locations).id,
        salesperson_id: pick(salespeople),
        customer_id: customer ? customer.id : null,
        total_amount: Number(total.toFixed(2)),
        payment_method: pick(PAYMENT_METHODS),
        discount_amount: 0,
        status: 'completed',
        receipt_number: `DEMO-${String(receiptSeq++).padStart(5, '0')}`,
        created_at: at.toISOString(),
      });
    }
  }

  return { sales, items };
}

/**
 * Stock lost to theft, damage and miscounts over the last few weeks.
 *
 * The report groups these by a bracketed tag it parses back out of `notes`, * [THEFT_SUSPECTED], [DAMAGE], [ADMIN_ERROR], [UNKNOWN], which is the same
 * shape POST /api/stock writes when a movement is recorded with a
 * shrinkage_reason. A note without one lands in an "unknown" slice, so the tag
 * is not decoration: it is what gives the breakdown chart its segments.
 *
 * Products are looked up by name so the value lost is the real catalogue price
 * rather than a number invented here that would contradict the price list.
 */
function buildShrinkage({ businessId, products, locations, salespeople }) {
  const byName = new Map(products.map((p) => [p.name, p]));
  const DAY = 24 * 60 * 60 * 1000;

  const specs = [
    ['Perfumed Rice 5kg', -3, 'THEFT_SUSPECTED', 'Stock count variance after the evening count.', 1],
    ['Milo Tin 400g', -2, 'THEFT_SUSPECTED', 'Two tins missing from the shelf, no matching sale.', 2],
    ['Frytol Cooking Oil 2L', -4, 'DAMAGE', 'Cartons soaked in the storeroom after the roof leak.', 3],
    ['Gino Tomato Paste 400g', -6, 'DAMAGE', 'Tins dented in transit from the Tema warehouse.', 5],
    ['Voltic Water 1.5L', -16, 'ADMIN_ERROR', 'Counted into the wrong branch during the weekly stock take.', 8],
    ['Indomie Chicken (40 pack)', -1, 'UNKNOWN', 'Discrepancy found at close; no cause established.', 11],
    ['Ideal Milk 170g', -5, 'DAMAGE', 'Crushed carton written off at goods-in.', 14],
    ['Club Beer 625ml', -2, 'THEFT_SUSPECTED', 'Bottles unaccounted for after the weekend shift.', 18],
  ];

  return specs
    .filter(([name]) => byName.has(name))
    .map(([name, quantityChange, reason, note, daysAgo]) => ({
      business_id: businessId,
      location_id: pick(locations).id,
      product_id: byName.get(name).id,
      user_id: pick(salespeople),
      quantity_change: quantityChange,
      movement_type: 'SHRINKAGE',
      notes: `[${reason}] ${note}`,
      created_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
    }));
}

/**
 * A few operational alerts hung off real sales.
 *
 * Types are constrained by migration 014 to VOID, DISCOUNT, SHRINKAGE and
 * CASH_OVERRIDE, deliberately not LOW_STOCK, which the constraint does not
 * allow however much the dashboard would like to count it.
 */
function buildAlerts({ businessId, sales, salespeople }) {
  const recent = sales.slice(-40);
  const specs = [
    { type: 'SHRINKAGE', note: 'Stock count variance on Perfumed Rice 5kg, 3 units unaccounted for.', status: 'pending' },
    { type: 'SHRINKAGE', note: 'Two units of Milo Tin 400g missing after the evening count.', status: 'pending' },
    { type: 'DISCOUNT', note: 'Discount above the usual limit applied at checkout.', status: 'resolved' },
    { type: 'VOID', note: 'Sale voided within a minute of being rung up.', status: 'pending' },
    { type: 'CASH_OVERRIDE', note: 'Till drawer opened without an accompanying sale.', status: 'resolved' },
    { type: 'DISCOUNT', note: 'Repeat discount to the same customer in one shift.', status: 'resolved' },
  ];

  return specs.map((spec, i) => {
    const sale = recent[i * 6] || recent[i] || sales[sales.length - 1];
    return {
      business_id: businessId,
      location_id: sale.location_id,
      type: spec.type,
      user_id: sale.salesperson_id || pick(salespeople),
      reference_id: sale.id,
      note: spec.note,
      status: spec.status,
      created_at: sale.created_at,
    };
  });
}

/**
 * Reset and reseed. Exported so the cron can call it without spawning a
 * process.
 *
 * @param {{ ifEmpty?: boolean }} options
 *   `ifEmpty` seeds only when no demo business exists, used on server
 *   startup, where wiping the sandbox out from under whoever is currently
 *   browsing it would be rude.
 */
async function reseedDemo({ ifEmpty = false } = {}) {
  const existing = await findDemoBusiness();

  if (existing && ifEmpty) {
    logger.info({ businessId: existing.id }, '[demo] business already exists; leaving it alone');
    return { skipped: true, businessId: existing.id };
  }

  if (existing) {
    logger.info({ businessId: existing.id }, '[demo] tearing down previous demo business');
    await teardown(existing.id);
  } else {
    // No business, but a previous run may still have left auth accounts
    // behind, and those alone are enough to block the seed below.
    await deleteDemoAuthUsers();
  }

  const result = await seed();
  logger.info({ ...result.counts }, '[demo] seed complete');
  return { skipped: false, ...result };
}

module.exports = { reseedDemo, findDemoBusiness, DEMO_EMAIL, DEMO_PASSWORD, DEMO_BUSINESS_NAME };

// Run directly: node scripts/seed-demo-data.js [--if-empty]
if (require.main === module) {
  reseedDemo({ ifEmpty: process.argv.includes('--if-empty') })
    .then((r) => {
      console.log(r.skipped ? 'Demo business already present; nothing to do.' : 'Demo data seeded.');
      if (!r.skipped) console.table(r.counts);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Demo seed failed:', err.message);
      process.exit(1);
    });
}
