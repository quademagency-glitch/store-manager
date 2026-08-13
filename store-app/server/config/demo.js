/**
 * Demo tenant identity — the two values the sign-in route needs, and nothing
 * else.
 *
 * Separate from scripts/seed-demo-data.js on purpose. routes/auth.js only
 * wants the credentials, but importing them from the seeder dragged the whole
 * module into the boot path: seeder → demoResetCron → auth → index. The
 * seeder requires `pg`, so every production boot then depended on a package
 * that is only ever needed to rebuild the sandbox. That took the API down on
 * deploy — the process exited on `Cannot find module 'pg'` before it could
 * listen, and Railway held the previous build.
 *
 * Nothing here imports anything, which is the point.
 */

const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || 'demo@quaderp.app';
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || 'QuadERPDemo!2026';

/** Demo mode is opt-in per environment: unset means no demo tenant at all. */
function isDemoEnabled() {
  return String(process.env.DEMO_MODE_ENABLED || '').toLowerCase() === 'true';
}

module.exports = { DEMO_EMAIL, DEMO_PASSWORD, isDemoEnabled };
