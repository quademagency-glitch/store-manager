#!/usr/bin/env node
/**
 * Restores a snapshot written by backup-db.js.
 *
 * The runbook used to say "load each table, parents before children" and then
 * stop, which left the hardest, least-rehearsed step of disaster recovery to be
 * improvised at the worst possible moment. This is that step.
 *
 *   node scripts/restore-db.js --from <snapshot-dir> --dry-run
 *   node scripts/restore-db.js --from <snapshot-dir>                 # into a live schema
 *   node scripts/restore-db.js --from <snapshot-dir> --schema rehearsal
 *
 * Target is DIRECT_URL, or --url to point somewhere else. A restore into the
 * database you are currently running is almost never what you want, so
 * anything that writes to `public` demands --i-mean-it.
 *
 * DESIGN NOTES
 *
 * `--dry-run` reads and validates every file without connecting to anything.
 * That is the mode worth running regularly: it is free, safe, and catches the
 * failures that actually happen — a truncated download, a snapshot taken
 * against a schema that has since changed, a table whose row count no longer
 * matches its manifest entry.
 *
 * `--schema` restores into a scratch schema alongside the live one, which is
 * how you rehearse without a second database. What that proves is real but
 * bounded, and the runbook says so: it exercises the files, the ordering and
 * the verification queries, but not that migrations apply to an empty database.
 *
 * Rows are inserted with an explicit column list taken from each row's own
 * keys, not from a hardcoded schema, so a snapshot stays restorable after a
 * column is added. Unknown columns are dropped with a warning rather than
 * aborting: a restore that refuses to run because the schema moved on is a
 * restore you cannot use in the emergency it was written for.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { Client } = require('pg');

require('dotenv').config({ quiet: true });

// Must match backup-db.js. Parents before children, so a straight top-to-bottom
// pass never trips a foreign key.
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

const BATCH = 500;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const log = (m) => console.log(m);
const warn = (m) => console.warn(`  !     ${m}`);

/** Yields parsed objects from a .ndjson or .ndjson.gz file. */
async function* readRows(file) {
  const raw = fs.createReadStream(file);
  const stream = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    n += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (err) {
      // Name the line. "Unexpected end of JSON input" with no location is
      // useless against a 500MB file, and a truncated final line is by far the
      // most common corruption — it is what a half-finished download looks like.
      throw new Error(`${path.basename(file)} line ${n}: ${err.message}`);
    }
  }
}

async function targetColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  const from = arg('from');
  const dryRun = arg('dry-run', false) === true;
  const schema = arg('schema', 'public');
  const truncate = arg('truncate', false) === true;

  if (!from || from === true) {
    console.error('Usage: node scripts/restore-db.js --from <snapshot-dir> [--dry-run] [--schema <name>]');
    process.exit(2);
  }
  if (!fs.existsSync(path.join(from, 'manifest.json'))) {
    console.error(`No manifest.json in ${from} — is that a snapshot directory?`);
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'));

  log(`Snapshot:   ${from}`);
  log(`Taken:      ${manifest.created_at}`);
  log(`Scope:      ${typeof manifest.scope === 'string' ? manifest.scope : JSON.stringify(manifest.scope)}`);
  log(`Migrations: ${(manifest.schema_migrations || []).length} recorded`);
  log(`Redacted:   ${(manifest.redacted_columns || []).join(', ') || 'none'}`);
  log('');

  // ── Validate the files before touching a database ────────────────────────
  const present = [];
  let mismatches = 0;

  for (const table of TABLES) {
    const entry = manifest.tables?.[table];
    if (!entry || entry.skipped) continue;

    const file = path.join(from, entry.file);
    if (!fs.existsSync(file)) {
      warn(`${table}: manifest lists ${entry.file}, which is missing`);
      mismatches += 1;
      continue;
    }

    let count = 0;
    let firstRow = null;
    for await (const row of readRows(file)) {
      if (count === 0) firstRow = row;
      count += 1;
    }

    if (count !== entry.rows) {
      // The single most valuable check here. A snapshot that copied only part
      // way looks completely normal until the counts are compared.
      warn(`${table}: file has ${count} rows, manifest says ${entry.rows}`);
      mismatches += 1;
    }

    present.push({ table, file, rows: count, columns: firstRow ? Object.keys(firstRow) : [] });
    log(`  ok    ${table.padEnd(24)} ${count} rows`);
  }

  const total = present.reduce((n, t) => n + t.rows, 0);
  log(`\n${present.length} tables, ${total} rows.`);

  if (mismatches > 0) {
    console.error(`\n✗ ${mismatches} problem(s) above. This snapshot is not intact — do not restore it.`);
    process.exit(1);
  }
  log('✓ Snapshot is internally consistent.');

  if (dryRun) {
    log('\nDry run: nothing was written, and no database was contacted.');
    log('Verified the files parse, are all present, and match the manifest counts.');
    log('It does NOT verify that the schema still accepts them — for that, restore');
    log('into a scratch schema with --schema.');
    return;
  }

  // ── Write ────────────────────────────────────────────────────────────────
  const connectionString = arg('url') === null || arg('url') === true
    ? process.env.DIRECT_URL
    : arg('url');

  if (!connectionString) {
    console.error('\nDIRECT_URL is not set and no --url given.');
    process.exit(2);
  }

  if (schema === 'public' && arg('i-mean-it') !== true) {
    console.error(`
Refusing to write into the "public" schema without --i-mean-it.

This overwrites live data. If you are rehearsing, restore into a scratch
schema instead, which is safe and proves nearly as much:

  node scripts/restore-db.js --from ${from} --schema rehearsal

If this really is a recovery into an empty database, add --i-mean-it.`);
    process.exit(2);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  log(`\nConnected. Restoring into schema "${schema}".`);

  if (schema !== 'public') {
    // A rehearsal schema is created from the live table definitions so the
    // restore is exercised against the real column types and constraints.
    // No data, no foreign keys: the point is to prove the rows load and the
    // counts come back, not to re-run referential integrity, and copying FKs
    // would force an ordering this scratch copy does not need.
    log('Building scratch schema from the live table definitions…');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${JSON.stringify(schema).replace(/"/g, '"')}`);
    for (const { table } of present) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (LIKE public."${table}" INCLUDING DEFAULTS)`,
      );
    }
  }

  let written = 0;
  try {
    await client.query('BEGIN');

    if (truncate) {
      for (const { table } of [...present].reverse()) {
        await client.query(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
      }
    }

    for (const { table, file, rows } of present) {
      const cols = await targetColumns(client, schema, table);
      if (cols.size === 0) {
        warn(`${table}: no such table in "${schema}" — skipped`);
        continue;
      }

      let batch = [];
      let done = 0;
      let dropped = null;

      const flush = async () => {
        if (batch.length === 0) return;
        const keys = Object.keys(batch[0]);
        const params = [];
        const tuples = batch.map((row) => {
          const ph = keys.map((k) => {
            params.push(row[k] === undefined ? null : row[k]);
            return `$${params.length}`;
          });
          return `(${ph.join(',')})`;
        });
        await client.query(
          `INSERT INTO "${schema}"."${table}" (${keys.map((k) => `"${k}"`).join(',')})
           VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`,
          params,
        );
        done += batch.length;
        batch = [];
      };

      for await (const row of readRows(file)) {
        const filtered = {};
        for (const [k, v] of Object.entries(row)) {
          if (cols.has(k)) filtered[k] = v;
          else if (!dropped) dropped = k;
        }
        // Batch on a stable key set: a row missing an optional key would
        // otherwise change the column list mid-batch and corrupt the tuple
        // alignment. Flushing on the boundary keeps each INSERT uniform.
        if (batch.length && Object.keys(batch[0]).join() !== Object.keys(filtered).join()) await flush();
        batch.push(filtered);
        if (batch.length >= BATCH) await flush();
      }
      await flush();

      if (dropped) warn(`${table}: snapshot has columns this schema lacks (e.g. "${dropped}") — dropped`);
      log(`  ok    ${table.padEnd(24)} ${done}/${rows} rows`);
      written += done;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\nRestore failed and was rolled back: ${err.message}`);
    await client.end();
    process.exit(1);
  }

  log(`\nDone. ${written} rows into "${schema}".`);
  if (schema !== 'public') {
    log(`\nVerify, then clean up:\n  DROP SCHEMA "${schema}" CASCADE;`);
  } else {
    log('\nNow run the verification queries in docs/disaster-recovery.md.');
    log('Credentials were NOT restored — they are redacted from snapshots by design.');
    log('Reissue manager PINs, API keys and gateway secrets before going live.');
  }
  await client.end();
}

main().catch((err) => {
  console.error('Restore failed:', err.message);
  process.exit(1);
});
