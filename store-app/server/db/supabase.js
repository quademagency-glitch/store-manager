const { createClient } = require('@supabase/supabase-js');
const nodeFetch = require('node-fetch');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn('Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
}

// Service role client, bypasses RLS, used for admin operations
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
      // curl) with identical credentials/headers always succeeded at,
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

/**
 * A second client whose only job is password sign-in.
 *
 * signInWithPassword must never be called on supabaseAdmin. supabase-js
 * decides a request's identity like this (SupabaseClient._getAccessToken):
 *
 *     if (this.accessToken) return await this.accessToken();
 *     const { data } = await this.auth.getSession();
 *     return data.session?.access_token ?? this.supabaseKey;
 *
 * so the moment a client holds a session, every PostgREST request it makes
 * carries that user's JWT instead of the service key, and it keeps doing so
 * for the life of the process. `persistSession: false` does not help: it
 * stops the session being written to storage, not from being held in memory
 * and returned by getSession().
 *
 * This ran in production from 2026-08-20. Both /auth/login and
 * /auth/demo-login signed in on the shared admin client, so any worker that
 * had served a login was thereafter querying as that user. The audit trail
 * is where it showed: audit_logs grants INSERT to service_role only, so
 * every write after the first login on a worker failed with
 * "new row violates row-level security policy" and the table took one row in
 * three weeks while the demo and the login pages worked perfectly. Eight
 * workers made it look intermittent, and the note below about connection
 * pooling was an earlier attempt to explain the same symptom.
 *
 * Nothing here ever calls .from(), so this client holding a session is
 * harmless, which is the whole point of it being a separate object.
 *
 * The `accessToken` option looks like a neater fix and is not usable: setting
 * it makes any access to `.auth` throw, and this codebase needs
 * supabaseAdmin.auth.admin for createUser, generateLink and getUser.
 */
const supabaseSignIn = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: nodeFetch,
    },
  }
);

module.exports = { supabaseAdmin, supabaseSignIn };
