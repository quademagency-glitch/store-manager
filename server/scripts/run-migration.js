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

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const ref = new URL(supabaseUrl).hostname.split('.')[0];

async function runMigration() {
  console.log(`\n📄 Running migration: ${path.basename(sqlPath)}`);
  console.log(`   Project ref: ${ref}\n`);

  // Use the Supabase SQL HTTP endpoint
  // POST to /rest/v1/rpc/exec_sql or use the /sql endpoint
  // The most reliable approach: use the database's pooler connection string
  // Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

  // Try using the Supabase client to call a migration function
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });

  // Execute via the Supabase SQL API (available since late 2024)
  // This uses the /sql endpoint on the project
  try {
    const res = await fetch(`${supabaseUrl}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Migration completed successfully!\n');
      return;
    }

    // If /sql not available, print status
    const text = await res.text();
    if (res.status === 404) {
      // /sql endpoint not available on this project
      throw new Error('SQL endpoint not available');
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  } catch (err) {
    console.log(`⚠️  Could not run migration via API: ${err.message}`);
    console.log('');
    console.log('Please run this migration manually in the Supabase SQL Editor:');
    console.log(`  1. Open: https://supabase.com/dashboard/project/${ref}/sql/new`);
    console.log(`  2. Paste the contents of: ${path.basename(sqlPath)}`);
    console.log('  3. Click "Run"');
    console.log('');
  }
}

runMigration().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
