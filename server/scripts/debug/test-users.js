require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase.from('roles').select('*');
  console.log('Roles:', data);
  if (error) console.error(error);
  
  const { data: users, error: err2 } = await supabase.from('users').select('*');
  console.log('Users:', users.length);
})();
