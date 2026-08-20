#!/usr/bin/env node
/**
 * Portable database snapshot.
 *
 * WHY, given Supabase already backs up daily: those backups live inside the
 * same account as the thing they protect. They do not help if the account is
 * lost, suspended or billed out, if a migration is applied to the wrong
 * project, or if you ever want to leave. This produces a snapshot you hold,
 * in a format anything can read.
 *
 * It is deliberately NOT a substitute for Supabase's point-in-time recovery,
 * which is far better at "undo the last twenty minutes". See
 * docs/disaster-recovery.md for which tool answers which question.
 *
 * Usage:
 *   node scripts/backup-db.js                    # all tenants, ./backups
 *   node scripts/backup-db.js --out /mnt/backup  # elsewhere
 *   node scripts/backup-db.js --business <uuid>  # one tenant only
 *   node scripts/backup-db.js --gzip             # compress
 *
 * Requires DIRECT_URL. Writes NDJSON, one JSON object per line, so a
 * multi-gigabyte table never has to be held in memory at either end.
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { Client } = require('pg');

// Ordered so a restore can run top to bottom without tripping foreign keys:
// parents before children.
const TABLES = [
  'businesses', 'platform_plans', 'locations', 'roles', 'users',
  'products', 'product_batches', 'inventory_units', 'product_inventory',
  'suppliers', 'purchase_orders',
  'customers', 'customer_orders',
  'sales', 'sale_items', 'returns',
  'stock_movements', 'stock_transfers',
  'ar_invoices', 'ar_payments', 'ap_bills', 'ap_payments',
  'business_ledger', 'accounting_templates',
  'loyalty_rules', 'loyalty_ledger', 'gift_cards', 'store_credit_ledger',
  'attendance_logs', 'shift_schedules', 'commission_rules', 'commission_ledger',
  'business_subscriptions', 'billing_invoices',
  'audit_logs',
];

// Never written to a backup file. Restoring these would recreate live
// credentials from a snapshot that may be months old and stored who knows
// where; they should be reissued instead.
const REDACT_COLUMNS = new Set([
  'manager_pin', 'secret_key', 'webhook_secret', 'key_hash',
  'api_key', 'public_key', 'password', 'password_hash',
]);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : (i !== -1 ? true : fallback);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1`, [table]);
  return rows.length > 0;
}

async function hasColumn(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column]);
  return rows.length > 0;
}

/**
 * Streams a table as NDJSON.
 *
 * Uses a server-side CURSOR rather than SELECT *: a plain query buffers the
 * entire result in the client before a single row is emitted, which for a busy
 * tenant's sales table is exactly the memory spike a backup must not cause.
 */
async function* streamTable(client, table, businessId) {
  const scoped = businessId && await hasColumn(client, table, 'business_id');
  const where = scoped ? 'WHERE business_id = $1' : '';
  const params = scoped ? [businessId] : [];

  await client.query('BEGIN');
  await client.query(`DECLARE backup_cursor NO SCROLL CURSOR FOR SELECT * FROM public.${table} ${where}`, params);

  let total = 0;
  try {
    for (;;) {
      const { rows } = await client.query('FETCH 500 FROM backup_cursor');
      if (rows.length === 0) break;
      for (const row of rows) {
        for (const col of Object.keys(row)) {
          if (REDACT_COLUMNS.has(col)) row[col] = null;
        }
        yield `${JSON.stringify(row)}\n`;
        total += 1;
      }
    }
  } finally {
    await client.query('CLOSE backup_cursor');
    await client.query('COMMIT');
  }
  return total;
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error('DIRECT_URL is not set. It must be a DIRECT Postgres connection string, \n' +
                  'the Supabase JS client cannot do this. See store-app/server/db/README.md.');
    process.exit(2);
  }

  const outDir = arg('out', path.join(process.cwd(), 'backups'));
  const businessId = arg('business', null);
  const gzip = arg('gzip', false) === true;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(outDir, `backup-${stamp}${businessId ? `-${businessId.slice(0, 8)}` : ''}`);
  fs.mkdirSync(dir, { recursive: true });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  log(`Connected. Writing to ${dir}`);

  const manifest = {
    created_at: new Date().toISOString(),
    scope: businessId ? { business_id: businessId } : 'all tenants',
    format: gzip ? 'NDJSON (gzip)' : 'NDJSON',
    redacted_columns: [...REDACT_COLUMNS],
    tables: {},
    schema_migrations: [],
  };

  // Record which migrations the snapshot was taken at. Restoring data into a
  // schema it predates is the classic way a restore appears to work and then
  // fails days later.
  if (await tableExists(client, 'schema_migrations')) {
    const { rows } = await client.query('SELECT filename FROM public.schema_migrations ORDER BY filename');
    manifest.schema_migrations = rows.map((r) => r.filename);
  }

  for (const table of TABLES) {
    if (!(await tableExists(client, table))) {
      log(`  skip  ${table} (not in this database)`);
      manifest.tables[table] = { skipped: 'table not present' };
      continue;
    }

    const file = path.join(dir, `${table}.ndjson${gzip ? '.gz' : ''}`);
    let count = 0;
    const source = Readable.from((async function* () {
      const it = streamTable(client, table, businessId);
      for (;;) {
        const next = await it.next();
        if (next.done) { count = next.value ?? count; break; }
        count += 1;
        yield next.value;
      }
    })());

    const out = fs.createWriteStream(file);
    if (gzip) await pipeline(source, zlib.createGzip(), out);
    else await pipeline(source, out);

    manifest.tables[table] = { rows: count, file: path.basename(file) };
    log(`  ok    ${table.padEnd(24)} ${count} rows`);
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await client.end();

  const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  log(`\nDone. ${Object.keys(manifest.tables).length} tables, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  log(`Snapshot: ${dir}`);
  log('\nThis file is only a backup once it is somewhere else. Copy it off this machine.');
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
