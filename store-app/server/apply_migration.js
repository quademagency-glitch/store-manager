require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function apply() {
  const sql = fs.readFileSync('./db/migrations/059_customer_otp_expiry.sql', 'utf8');
  // Since supabaseAdmin client cannot run arbitrary DDL SQL via JS directly (unless there's an RPC or pg plugin), we will just use postgres connection if available, or we need to run it via an RPC if it exists.
}
apply();
