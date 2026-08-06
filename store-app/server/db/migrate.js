#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Replaces `apply_migration.js` and `apply_pg.js`, both of which were stubs
 * that never applied anything — one read migration 059 and returned, the other
 * printed whether DATABASE_URL was set. Migrations were being applied by hand
 * with no record kept, so the only way to know whether one had run was to go
 * and look at the schema. Migration 066 sat written-but-unapplied for a week
 * that way.
 *
 * Usage:
 *   node db/migrate.js status              what is applied, what is pending
 *   node db/migrate.js up                  apply every pending migration
 *   node db/migrate.js up --dry-run        list what `up` would do
 *   node db/migrate.js baseline            record all files as applied, run none
 *
 * Connects with DIRECT_URL (a direct Postgres connection). The Supabase JS
 * client cannot run DDL, which is what defeated the previous attempts.
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'migrations');

/**
 * Keyed on filename, not migration number: 017 and 018 each have two distinct
 * files (017_customer_verification / 017_trial_unit_selection, and likewise
 * for 018), so the number is not unique. Lexicographic filename order is
 * stable and puts those pairs in a consistent sequence.
 */
const TRACKING = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename   TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by TEXT
  )`;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function readMigrations() {
  if (!fs.existsSync(DIR)) throw new Error(`no migrations directory at ${DIR}`);
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('._')) // ._ = macOS AppleDouble
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(DIR, filename), 'utf8');
      return { filename, sql, checksum: sha(sql) };
    });
}

async function connect() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error(
      'DIRECT_URL is not set. It must be a direct Postgres connection string — ' +
        'SUPABASE_URL and the service-role key cannot execute DDL.',
    );
  }
  // Supabase's pooler presents a cert chain Node does not chase by default.
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(TRACKING);
  return client;
}

async function appliedMap(client) {
  const { rows } = await client.query('SELECT filename, checksum, applied_at FROM public.schema_migrations');
  return new Map(rows.map((r) => [r.filename, r]));
}

/** Files whose contents changed after they were applied — the DB no longer matches the repo. */
function findDrift(files, applied) {
  return files
    .filter((f) => applied.has(f.filename) && applied.get(f.filename).checksum !== f.checksum)
    .map((f) => f.filename);
}

async function status(client) {
  const files = readMigrations();
  const applied = await appliedMap(client);
  const pending = files.filter((f) => !applied.has(f.filename));

  console.log(`${files.length} migration files, ${applied.size} applied, ${pending.length} pending\n`);

  if (applied.size === 0) {
    console.log('Nothing is recorded as applied.');
    console.log('If this database already has these migrations, run `baseline` first —');
    console.log('`up` would otherwise re-run all of them against a live schema.\n');
  }

  if (pending.length) {
    console.log('Pending:');
    for (const f of pending) console.log(`  ${f.filename}`);
    console.log('');
  }

  const drift = findDrift(files, applied);
  if (drift.length) {
    console.log('Changed since they were applied (the DB no longer matches these files):');
    for (const f of drift) console.log(`  ${f}`);
    console.log('Write a new migration rather than editing an applied one.\n');
  }

  // An earlier-sorting file appearing after later ones ran usually means a
  // branch merge dropped a migration in behind the current head.
  const appliedNames = files.filter((f) => applied.has(f.filename)).map((f) => f.filename);
  const newestApplied = appliedNames[appliedNames.length - 1];
  const outOfOrder = pending.filter((f) => newestApplied && f.filename < newestApplied);
  if (outOfOrder.length) {
    console.log('Pending but sorts BEFORE the newest applied migration:');
    for (const f of outOfOrder) console.log(`  ${f.filename}  (newest applied: ${newestApplied})`);
    console.log('`up` will still apply these, but check they do not assume a later schema.\n');
  }

  return { files, applied, pending };
}

async function up(client, { dryRun }) {
  const files = readMigrations();
  const applied = await appliedMap(client);

  if (applied.size === 0 && files.length > 1) {
    throw new Error(
      `Refusing to apply ${files.length} migrations to a database with no migration record.\n` +
        'If this database is already migrated, run `baseline` to adopt it.\n' +
        'If it is genuinely empty, run `baseline --empty` first to confirm that.',
    );
  }

  const drift = findDrift(files, applied);
  if (drift.length) {
    throw new Error(
      `These files changed after being applied:\n  ${drift.join('\n  ')}\n` +
        'Add a new migration instead of editing an applied one.',
    );
  }

  const pending = files.filter((f) => !applied.has(f.filename));
  if (!pending.length) {
    console.log('Up to date — nothing pending.');
    return;
  }

  if (dryRun) {
    console.log(`Would apply ${pending.length}:`);
    for (const f of pending) console.log(`  ${f.filename}`);
    return;
  }

  const by = `${os.userInfo().username}@${os.hostname()}`;
  for (const f of pending) {
    process.stdout.write(`applying ${f.filename} ... `);
    try {
      // One transaction per migration: a failure rolls back only that file, so
      // the recorded state always matches what actually ran.
      await client.query('BEGIN');
      await client.query(f.sql);
      await client.query(
        'INSERT INTO public.schema_migrations (filename, checksum, applied_by) VALUES ($1, $2, $3)',
        [f.filename, f.checksum, by],
      );
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('FAILED');
      throw new Error(`${f.filename} rolled back: ${err.message}\nNothing after it was applied.`);
    }
  }
  console.log(`\nApplied ${pending.length}.`);
}

/**
 * Adopt a database that was migrated by hand: record every file as applied
 * without executing any of it. This is the one-time bridge from "we ran these
 * by hand and kept no record" to a tracked history.
 */
async function baseline(client, { empty }) {
  const files = readMigrations();
  const applied = await appliedMap(client);
  const toRecord = files.filter((f) => !applied.has(f.filename));

  if (!toRecord.length) {
    console.log('Every migration is already recorded — nothing to baseline.');
    return;
  }

  if (!empty) {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'",
    );
    if (rows[0].n === 0) {
      throw new Error(
        'The public schema is empty, so these migrations have clearly not been applied.\n' +
          'Baselining would mark them done and they would never run. Use `up` instead.\n' +
          '(If you really mean to, pass --empty.)',
      );
    }
  }

  const by = `${os.userInfo().username}@${os.hostname()} (baseline)`;
  await client.query('BEGIN');
  for (const f of toRecord) {
    await client.query(
      'INSERT INTO public.schema_migrations (filename, checksum, applied_by) VALUES ($1, $2, $3)',
      [f.filename, f.checksum, by],
    );
  }
  await client.query('COMMIT');

  console.log(`Recorded ${toRecord.length} migrations as applied. None were executed.`);
  console.log('Future `up` runs will apply only files added after this point.');
}

async function main() {
  const [cmd = 'status'] = process.argv.slice(2);
  const flag = (f) => process.argv.includes(f);

  if (!['status', 'up', 'baseline'].includes(cmd)) {
    console.error(`Unknown command "${cmd}". Expected: status | up | baseline`);
    process.exit(2);
  }

  const client = await connect();
  try {
    if (cmd === 'status') await status(client);
    else if (cmd === 'up') await up(client, { dryRun: flag('--dry-run') });
    else await baseline(client, { empty: flag('--empty') });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
