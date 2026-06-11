const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: qdeSub } = await supabase.from('business_subscriptions').select('*').eq('business_id', 'c19a28f2-ac95-4b68-b760-0a808655ca14');
  console.log('Quadem Digital Enterprise Sub:', qdeSub);
  
  const { data: qdeInvs } = await supabase.from('billing_invoices').select('*').eq('business_id', 'c19a28f2-ac95-4b68-b760-0a808655ca14');
  console.log('Quadem Digital Enterprise Invoices:', qdeInvs);
}
run();
