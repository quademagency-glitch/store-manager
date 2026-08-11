#!/usr/bin/env node
/**
 * Schema drift: does `db/migrations/` still describe production?
 *
 * Migrations 027 and 063-065 were applied to production but their files are
 * not in this repo. A rebuild from the migration set therefore produces a
 * schema *missing* 063's security hardening — a fresh environment would be
 * less locked down than production, and nothing would say so. This reports
 * that difference instead of leaving it to be discovered.
 *
 * How it works: build the schema the migrations describe in a throwaway
 * Postgres cluster, introspect both it and production, and diff.
 *
 *   npm run db:drift
 *   SHADOW_DATABASE_URL=postgres://... npm run db:drift    # reuse a database
 *   npm run db:drift -- --keep                             # leave the cluster up
 *
 * Comparison is over portable catalog queries rather than pg_dump, because
 * pg_dump refuses to read a server newer than itself and production is 17.x
 * while local binaries here are 16.x.
 *
 * A non-empty diff is expected today. It is a report, not a gate.
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const { readMigrations } = require('./migrate');

const BOOTSTRAP = path.join(__dirname, 'shadow-bootstrap.sql');
const KEEP = process.argv.includes('--keep');

/* ── Introspection ───────────────────────────────────────────────────────
   Scoped to `public`, and to object classes our migrations actually create.
   Ordered inside SQL so two servers produce comparable output regardless of
   physical row order. */
const QUERIES = {
  columns: `
    SELECT table_name || '.' || column_name AS key,
           data_type || CASE WHEN is_nullable = 'YES' THEN ' NULL' ELSE ' NOT NULL' END AS val
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY 1`,
  constraints: `
    SELECT tc.table_name || '.' || tc.constraint_name AS key, tc.constraint_type AS val
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
    ORDER BY 1`,
  indexes: `
    SELECT tablename || '.' || indexname AS key, 'index' AS val
    FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
  rls_enabled: `
    SELECT c.relname AS key, c.relrowsecurity::text AS val
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY 1`,
  policies: `
    SELECT tablename || '.' || policyname AS key,
           cmd || ' to ' || array_to_string(roles, ',') AS val
    FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`,
  functions: `
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS key,
           CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS val
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY 1`,
  // The heart of migration 063: who may execute what.
  routine_grants: `
    SELECT routine_name || ' -> ' || grantee AS key, privilege_type AS val
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'public' AND grantee IN ('anon','authenticated','service_role')
    ORDER BY 1`,
  table_grants: `
    SELECT table_name || ' -> ' || grantee AS key,
           string_agg(privilege_type, ',' ORDER BY privilege_type) AS val
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role')
    GROUP BY 1 ORDER BY 1`,
};

async function introspect(client) {
  const out = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    const { rows } = await client.query(sql);
    out[name] = new Map(rows.map((r) => [r.key, r.val]));
  }
  return out;
}

function diffSection(shadow, live) {
  const missing = []; // in production, not produced by the migrations
  const extra = []; // produced by the migrations, absent from production
  const changed = [];

  for (const [k, v] of live) {
    if (!shadow.has(k)) missing.push(k);
    else if (shadow.get(k) !== v) changed.push(`${k}: migrations=${shadow.get(k)} production=${v}`);
  }
  for (const k of shadow.keys()) if (!live.has(k)) extra.push(k);

  return { missing, extra, changed };
}

/* ── Throwaway cluster ───────────────────────────────────────────────── */

function freePort() {
  const srv = net.createServer();
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function have(bin) {
  return spawnSync('which', [bin]).status === 0;
}

/**
 * Run a Postgres binary, surfacing its stderr on failure.
 *
 * execFileSync with `stdio: 'ignore'` throws "Command failed: initdb …" and
 * nothing else, which hid a one-line locale error behind a useless message.
 */
function runOrExplain(bin, args) {
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
  });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(-4).join('\n');
    throw new Error(`${bin} failed:\n${detail}`);
  }
  return res.stdout;
}

async function startShadowCluster() {
  for (const bin of ['initdb', 'pg_ctl']) {
    if (!have(bin)) {
      throw new Error(
        `\`${bin}\` not found. Install Postgres locally, or point the check at an ` +
          'existing scratch database with SHADOW_DATABASE_URL=postgres://…',
      );
    }
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quaderp-shadow-'));
  const dataDir = path.join(dir, 'data');
  const port = await freePort();

  // `--locale=C` and a scrubbed LC_ALL are not optional on macOS: initdb
  // rejects the inherited locale outright ("invalid locale settings"). C is
  // also the right choice here — collation must not vary by machine when the
  // whole point is comparing two schemas.
  runOrExplain('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']);
  // Unix socket in the temp dir so this cannot collide with a local server.
  runOrExplain('pg_ctl', [
    '-D', dataDir,
    '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`,
    '-w', '-l', path.join(dir, 'log'), 'start',
  ]);

  const admin = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  await admin.connect();
  await admin.query('CREATE DATABASE shadow');
  await admin.end();

  return {
    url: `postgres://postgres@127.0.0.1:${port}/shadow`,
    stop() {
      if (KEEP) {
        console.log(`\n--keep: cluster left running at ${dir} (port ${port})`);
        console.log(`Stop it with: pg_ctl -D ${dataDir} stop`);
        return;
      }
      // Teardown must never mask a real failure from the diff itself.
      spawnSync('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function buildShadow(url) {
  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(fs.readFileSync(BOOTSTRAP, 'utf8'));

  const migrations = readMigrations();
  const failures = [];
  for (const m of migrations) {
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      failures.push({ filename: m.filename, message: err.message.split('\n')[0] });
    }
  }
  return { client, migrations, failures };
}

/* ── Report ──────────────────────────────────────────────────────────── */

function report(shadowSchema, liveSchema) {
  let drifted = 0;

  for (const section of Object.keys(QUERIES)) {
    const d = diffSection(shadowSchema[section], liveSchema[section]);
    const total = d.missing.length + d.extra.length + d.changed.length;
    if (!total) continue;
    drifted += total;

    console.log(`\n### ${section}`);
    if (d.missing.length) {
      console.log(`  in production but NOT produced by the migrations (${d.missing.length}):`);
      for (const k of d.missing.slice(0, 25)) console.log(`    - ${k}`);
      if (d.missing.length > 25) console.log(`    … ${d.missing.length - 25} more`);
    }
    if (d.extra.length) {
      console.log(`  produced by the migrations but MISSING from production (${d.extra.length}):`);
      for (const k of d.extra.slice(0, 25)) console.log(`    + ${k}`);
      if (d.extra.length > 25) console.log(`    … ${d.extra.length - 25} more`);
    }
    if (d.changed.length) {
      console.log(`  differing (${d.changed.length}):`);
      for (const k of d.changed.slice(0, 25)) console.log(`    ~ ${k}`);
      if (d.changed.length > 25) console.log(`    … ${d.changed.length - 25} more`);
    }
  }

  return drifted;
}

async function main() {
  if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is not set; cannot read production.');

  let cluster = null;
  let shadowUrl = process.env.SHADOW_DATABASE_URL;
  let shadowClient = null;
  const live = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    if (!shadowUrl) {
      console.log('Starting a throwaway Postgres cluster…');
      cluster = await startShadowCluster();
      shadowUrl = cluster.url;
    } else {
      console.log('Using SHADOW_DATABASE_URL.');
    }

    console.log('Applying bootstrap + migrations to the shadow database…');
    const built = await buildShadow(shadowUrl);
    shadowClient = built.client;
    console.log(`  ${built.migrations.length} migrations, ${built.failures.length} failed to apply.`);

    if (built.failures.length) {
      console.log('\n### migrations that would NOT rebuild cleanly');
      for (const f of built.failures) console.log(`    ! ${f.filename}: ${f.message}`);
      console.log('  (A failure here means the diff below understates the real drift.)');
    }

    await live.connect();
    const [shadowSchema, liveSchema] = await Promise.all([introspect(shadowClient), introspect(live)]);

    console.log('\n=== Schema drift: migrations vs production ===');
    const drifted = report(shadowSchema, liveSchema);

    if (!drifted && !built.failures.length) {
      console.log('\nNo drift. The migration set reproduces production.');
      return 0;
    }
    console.log(
      `\n${drifted} difference(s). Objects listed as "in production but NOT produced by the ` +
        'migrations" are the fingerprint of the missing 027 and 063-065 files.',
    );
    return 1;
  } finally {
    await Promise.allSettled([shadowClient?.end(), live.end()]);
    cluster?.stop();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(2);
  });
