const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: plans } = await supabase.from('platform_plans').select('*');
  console.log('Plans:', plans);
}
run();
