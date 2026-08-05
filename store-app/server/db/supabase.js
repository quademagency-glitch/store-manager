const { createClient } = require('@supabase/supabase-js');
const nodeFetch = require('node-fetch');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn('Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
}

// Service role client — bypasses RLS, used for admin operations
const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Node's native fetch (undici) keeps long-lived pooled/keep-alive
      // connections for the life of the process. Under real traffic this
      // client was observed intermittently getting "new row violates
      // row-level security policy" on inserts that a fresh process (or
      // curl) with identical credentials/headers always succeeded at —
      // consistent with a persistent connection getting pinned to a
      // Supabase-side backend with stale role/policy state. node-fetch
      // doesn't pool connections by default, forcing a fresh connection
      // per request, which resolved it (verified via a 10-request
      // reliability run: 0 failures after the switch, vs. consistent
      // failures before it).
      fetch: nodeFetch,
    },
  }
);

module.exports = { supabaseAdmin };
