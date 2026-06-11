const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: inv } = await supabase.from('billing_invoices').select('*').limit(1);
  console.log(inv);
}
run();
