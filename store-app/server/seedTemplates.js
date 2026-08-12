/**
 * Backfill script: give every active business the default accounting
 * templates if it somehow has none.
 *
 * The template set itself lives in services/accountingTemplateSeeder.js so
 * that self-service signup can seed a single business without shelling out
 * to this script.
 *
 *   node seedTemplates.js
 */
require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');
const { seedAccountingTemplates } = require('./services/accountingTemplateSeeder');

async function seed() {
  console.log('Fetching all active businesses...');
  const { data: businesses, error: bizErr } = await supabaseAdmin
    .from('businesses')
    .select('id')
    // Trialing businesses are real businesses with real users; they need
    // their templates just as much as paying ones do.
    .in('status', ['active', 'trialing']);

  if (bizErr || !businesses || businesses.length === 0) {
    console.error('No business found to attach templates to.', bizErr);
    process.exit(1);
  }

  for (const business of businesses) {
    const result = await seedAccountingTemplates(business.id);

    if (result.seeded) {
      console.log(`Seeded ${result.count} templates for ${business.id}`);
    } else if (result.reason === 'exists') {
      console.log(`Templates already exist for business ${business.id}. Skipping...`);
    } else {
      console.error(`Failed to seed templates for ${business.id}: ${result.error || result.reason}`);
    }
  }

  process.exit(0);
}

seed();
