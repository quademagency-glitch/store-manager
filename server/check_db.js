import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: businesses } = await supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Recent Businesses:', businesses.map(b => ({ id: b.id, name: b.name })));
  
  const { data: invoices } = await supabase.from('billing_invoices').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Recent Invoices:', invoices);

  const { data: subs } = await supabase.from('business_subscriptions').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Recent Subscriptions:', subs);
}
run();
