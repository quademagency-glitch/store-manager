require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BIZ_ID = crypto.randomUUID();
const LOC_ID = crypto.randomUUID();

async function seed() {
  console.log('Seeding mock data...');
  
  // Create business
  const { error: bizErr } = await supabase.from('businesses').insert({
    id: BIZ_ID,
    name: 'Mock Enterprise',
    slug: 'mock-' + Date.now()
  });
  if (bizErr) console.error('bizErr', bizErr);

  // Create location
  const { error: locErr } = await supabase.from('locations').insert({
    id: LOC_ID,
    business_id: BIZ_ID,
    name: 'Main Branch'
  });
  if (locErr) console.error('locErr', locErr);

  // Create products
  const products = [
    { id: crypto.randomUUID(), business_id: BIZ_ID, name: 'Premium Widget', sku: 'WGT-001', price: 99.99 },
    { id: crypto.randomUUID(), business_id: BIZ_ID, name: 'Standard Widget', sku: 'WGT-002', price: 49.99 },
    { id: crypto.randomUUID(), business_id: BIZ_ID, name: 'Deluxe Service', sku: 'SRV-001', price: 199.99 },
  ];
  const { error: prodErr } = await supabase.from('products').insert(products);
  if (prodErr) console.error('prodErr', prodErr);

  // Create stock
  const stock = [
    { product_id: products[0].id, location_id: LOC_ID, quantity: 150 },
    { product_id: products[1].id, location_id: LOC_ID, quantity: 45 },
  ];
  const { error: stockErr } = await supabase.from('product_inventory').insert(stock);
  if (stockErr) console.error('stockErr', stockErr);

  // Create customers
  const customers = [
    { id: crypto.randomUUID(), business_id: BIZ_ID, name: 'John Doe', phone: '555-0101' },
    { id: crypto.randomUUID(), business_id: BIZ_ID, name: 'Jane Smith', phone: '555-0102' },
  ];
  const { error: custErr } = await supabase.from('customers').insert(customers);
  if (custErr) console.error('custErr', custErr);

  // Create sales
  const sales = [
    { id: crypto.randomUUID(), business_id: BIZ_ID, location_id: LOC_ID, total_amount: 199.98, status: 'completed' },
    { id: crypto.randomUUID(), business_id: BIZ_ID, location_id: LOC_ID, total_amount: 49.99, status: 'completed' },
  ];
  const { error: salesErr } = await supabase.from('sales').insert(sales);
  if (salesErr) console.error('salesErr', salesErr);

  console.log('Seeding complete! Business ID:', BIZ_ID);
  process.exit(0);
}

seed();
