require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function test() {
  const { data, error } = await supabaseAdmin.from('users').select('id, name, roles(name)').limit(1);
  console.log('Error:', error);
  console.log('User schema:', data[0]);
}
test();
