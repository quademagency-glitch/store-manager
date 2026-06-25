/**
 * Run a SQL migration against the Supabase database
 * using the database's direct postgres connection via the pg library.
 *
 * Usage: node scripts/run-migration.js db/migrations/003_sales.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-migration.js <path-to-sql-file>');
  process.exit(1);
}

const sqlPath = path.resolve(__dirname, '..', file);
if (!fs.existsSync(sqlPath)) {
  console.error(`File not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf-8');

const directUrl = process.env.DIRECT_URL;

async function runMigration() {
  console.log(`\n📄 Running migration: ${path.basename(sqlPath)}\n`);

  if (!directUrl) {
    console.error('Missing DIRECT_URL in .env (Supabase Project Settings → Database → session-mode pooler connection string).');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✅ Migration completed successfully!\n');
  } finally {
    await client.end();
  }
}

runMigration().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
