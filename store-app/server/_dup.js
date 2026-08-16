require('dotenv').config({ quiet: true });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(`
    select b.id, b.name, b.slug, b.status, b.is_demo, b.created_at, b.contact_email, b.phone,
           b.currency, b.country, b.trial_ends_at, b.subscription_plan_id,
           (select count(*) from users u where u.business_id=b.id)             as users,
           (select count(*) from products p where p.business_id=b.id)          as products,
           (select count(*) from sales s where s.business_id=b.id)             as sales,
           (select count(*) from locations l where l.business_id=b.id)         as locations,
           (select count(*) from customers x where x.business_id=b.id)         as customers,
           (select count(*) from accounting_templates t where t.business_id=b.id) as templates,
           (select max(s.created_at) from sales s where s.business_id=b.id)    as last_sale
    from businesses b
    where b.name ilike '%quadem digital%'
    order by b.created_at`);
  for (const r of rows) {
    console.log('─'.repeat(70));
    console.log(`  name        ${r.name}`);
    console.log(`  id          ${r.id}`);
    console.log(`  slug        ${r.slug}`);
    console.log(`  created     ${r.created_at}`);
    console.log(`  status      ${r.status}${r.is_demo ? ' (DEMO)' : ''}   currency ${r.currency||'—'}  country ${r.country||'—'}`);
    console.log(`  contact     ${r.contact_email||'—'}   phone ${r.phone||'—'}`);
    console.log(`  trial_ends  ${r.trial_ends_at||'—'}   plan ${r.subscription_plan_id?'set':'none'}`);
    console.log(`  CONTENT     users:${r.users} products:${r.products} sales:${r.sales} locations:${r.locations} customers:${r.customers} templates:${r.templates}`);
    console.log(`  last sale   ${r.last_sale||'never'}`);
  }
  await c.end();
})();
