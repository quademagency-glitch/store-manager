const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
before(async () => {
  // Disposable schema contract for the touched tables; this is not a Supabase
  // deployment rehearsal. The assertions execute real PostgreSQL, not mocks.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE products(id uuid PRIMARY KEY, business_id uuid, cost_price numeric);
    CREATE TABLE sale_items(id uuid PRIMARY KEY, product_id uuid REFERENCES products, business_id uuid, quantity int);
    CREATE TABLE customers(id uuid, name text, verification_code text, otp_expires_at timestamptz, verification_code_expires_at timestamptz);
    GRANT ALL ON customers TO anon, authenticated;
    CREATE TABLE locations(id uuid PRIMARY KEY, business_id uuid);
    CREATE TABLE users(id uuid PRIMARY KEY, business_id uuid);
    CREATE TABLE commission_ledger(id uuid PRIMARY KEY, business_id uuid, user_id uuid, amount numeric CHECK(amount >= 0), paid_at timestamptz);
    CREATE TABLE business_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid, location_id uuid NOT NULL REFERENCES locations,
      user_id uuid REFERENCES users, type text CHECK(type IN ('expense', 'deposit_to_bank', 'pay_in')),
      amount numeric CHECK(amount > 0), description text, status text, approved_by uuid, approved_at timestamptz, metadata jsonb);
    INSERT INTO products VALUES ('${id(1)}', '${id(2)}', 20);
    INSERT INTO sale_items VALUES ('${id(3)}', '${id(1)}', '${id(2)}', 2);
    INSERT INTO locations VALUES ('${id(4)}', '${id(2)}');
    INSERT INTO users VALUES ('${id(5)}', '${id(2)}');
    INSERT INTO commission_ledger VALUES ('${id(6)}', '${id(2)}', '${id(5)}', 10, null);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../db/migrations/082_owner_audit_financial_integrity.sql'), 'utf8'));
});
after(async () => db.close());
test('existing costs are marked estimated; new costs are recorded and frozen', async () => {
  let row = (await db.query('SELECT unit_cost, cost_basis FROM sale_items WHERE id=$1', [id(3)])).rows[0];
  assert.deepEqual(row, { unit_cost: '20.0000', cost_basis: 'estimated' });
  await db.query('INSERT INTO sale_items(id, product_id, business_id, quantity) VALUES ($1,$2,$3,1)', [id(7),id(1),id(2)]);
  await db.exec('UPDATE products SET cost_price=999');
  row = (await db.query('SELECT unit_cost, cost_basis FROM sale_items WHERE id=$1', [id(7)])).rows[0];
  assert.deepEqual(row, { unit_cost: '20.0000', cost_basis: 'recorded' });
  await assert.rejects(db.query('UPDATE sale_items SET unit_cost=99 WHERE id=$1', [id(7)]), /immutable/);
});
test('authenticated and anonymous users cannot select verification secrets or call payout', async () => {
  const result = await db.query(`SELECT
    has_column_privilege('authenticated', 'customers', 'name', 'SELECT') AS public_read,
    has_column_privilege('authenticated', 'customers', 'verification_code', 'SELECT') AS secret_read,
    has_column_privilege('anon', 'customers', 'verification_code', 'SELECT') AS anon_read,
    has_function_privilege('authenticated', 'pay_commissions(uuid,uuid,uuid,uuid,uuid[])', 'EXECUTE') AS payout,
    has_function_privilege('service_role', 'pay_commissions(uuid,uuid,uuid,uuid,uuid[])', 'EXECUTE') AS server_payout`);
  assert.deepEqual(result.rows[0], { public_read: true, secret_read: false, anon_read: false, payout: false, server_payout: true });
});
const pay = () => db.query('SELECT pay_commissions($1,$2,$3,$4,$5) AS result', [id(2), id(4), id(5), id(5), [id(6)]]);
test('failed ledger insertion leaves commissions unpaid, then retry posts exactly once', async () => {
  await db.exec("ALTER TABLE business_ledger ADD CONSTRAINT injected_failure CHECK (amount < 1)");
  await assert.rejects(pay(), /injected_failure/);
  assert.equal((await db.query('SELECT paid_at FROM commission_ledger')).rows[0].paid_at, null);
  assert.equal((await db.query('SELECT count(*) FROM business_ledger')).rows[0].count, 0);
  await db.exec('ALTER TABLE business_ledger DROP CONSTRAINT injected_failure');
  assert.equal((await pay()).rows[0].result.total_paid, 10);
  assert.equal((await pay()).rows[0].result.total_paid, 0);
  const ledger = (await db.query('SELECT type, amount, status, metadata FROM business_ledger')).rows;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, 'expense'); assert.equal(ledger[0].amount, '10');
  assert.equal(ledger[0].status, 'approved');
  assert.deepEqual(ledger[0].metadata.commission_ids, [id(6)]);
});
test('a foreign-business payout selection fails without posting', async () => {
  await assert.rejects(db.query('SELECT pay_commissions($1,$2,$3,$4,$5)', [id(99),id(4),id(5),id(5),[id(6)]]), /valid payout location/);
  assert.equal((await db.query('SELECT count(*) FROM business_ledger')).rows[0].count, 1);
});
