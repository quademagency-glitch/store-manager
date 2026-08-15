/**
 * Align platform_plans with the prices the landing page advertises.
 *
 * Applied against production on 2026-08-15. Kept because the change lives only
 * in data — plans are operator-managed through Platform Admin, not seeded by a
 * migration (015 seeds `Free` and nothing else) — so without this file there is
 * no record of what was changed or what the numbers were before.
 *
 * The two sides had drifted to roughly double: the site quoted GHS 250/mo for
 * Single Branch while the billing table held 450, and GHS 600 against 1000 for
 * Multi-Branch. The landing page is the side customers read and act on, so it
 * wins; the table moved to match it.
 *
 * Trial goes to 30 days everywhere. That is what the site promises and what
 * Signup.jsx shows, and auth.js already forces 30 for self-service signups via
 * its own TRIAL_DAYS. The 7/0/60/"2 months" spread left in these columns only
 * ever applied to operator-assigned subscriptions, which made it a second,
 * quieter set of promises nobody was reconciling.
 *
 * compare_at and the intro promo are cleared rather than rewritten. Against the
 * new prices the old "was" figures would advertise a ~49% discount that is not
 * real, and Single Branch's intro yearly (5000) had ended up *higher* than its
 * regular yearly (2750), which renders as nonsense. With both empty, PricingTab
 * derives "1 month free" from monthly x 12 on its own — the same badge the
 * landing page's annual toggle already shows.
 *
 * Idempotent: every value is absolute, so re-running changes nothing.
 *
 *   node scripts/debug/align-plan-pricing.js
 */
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** What the site promises, on every plan. */
const TRIAL = {
  trial_days: 30,
  trial_days_monthly: 30,
  trial_days_yearly: 30,
  trial_unit_monthly: 'days',
  trial_unit_yearly: 'days',
};

/** Anything that would render as a discount the site does not claim. */
const CLEAR_PROMO = {
  promo_mode: 'none',
  intro_price_monthly: null,
  intro_price_yearly: null,
  compare_at_price_monthly: null,
  compare_at_price_yearly: null,
};

const UPDATES = [
  { name: 'Single Branch', ...TRIAL, ...CLEAR_PROMO, price_monthly: 250, price_yearly: 2750, setup_fee: 1000 },
  { name: 'Multi-Branch', ...TRIAL, ...CLEAR_PROMO, price_monthly: 600, price_yearly: 6600, setup_fee: 2500 },
  // Quoted by hand, so only the trial promise has to match the site.
  { name: 'Franchise (Custom)', ...TRIAL },
];

(async () => {
  for (const { name, ...patch } of UPDATES) {
    const { data, error } = await db
      .from('platform_plans')
      .update(patch)
      .eq('name', name)
      .select('name');

    if (error) {
      console.error(`FAILED ${name}:`, error.message);
      process.exitCode = 1;
      continue;
    }
    // Matching zero rows means a plan was renamed in Platform Admin and this
    // file is now lying about production. Louder than a silent no-op.
    if (!data || data.length !== 1) {
      console.error(`FAILED ${name}: matched ${data ? data.length : 0} rows, expected 1`);
      process.exitCode = 1;
      continue;
    }
    console.log(`updated ${name}`);
  }
})();
