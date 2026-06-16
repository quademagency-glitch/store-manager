require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');

async function test() {
  const { data, error } = await supabaseAdmin.from('accounting_templates').select('*');
  console.log(data);
}
test();
