require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabaseAdmin.rpc('get_table_info', { table_name: 'customers' });
  if (error) {
     // fallback
     const { data: d2 } = await supabaseAdmin.from('customers').select('*').limit(1);
     console.log(Object.keys(d2[0] || {}));
  } else {
     console.log(data);
  }
}
check();
