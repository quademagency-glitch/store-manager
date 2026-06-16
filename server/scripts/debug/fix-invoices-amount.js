require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');

async function fixInvoicesAmount() {
  const businessId = '855c70f9-4aac-4f9f-8a4b-1e472496d4a3';
  const planId = '110919c7-eeee-4fd3-9d4c-dc51136edf86'; // Premium
  
  const { data: plan } = await supabaseAdmin
    .from('platform_plans')
    .select('price_monthly')
    .eq('id', planId)
    .single();

  const price = plan.price_monthly;
  console.log('Actual Premium Plan Price:', price);

  const { error } = await supabaseAdmin
    .from('billing_invoices')
    .update({ amount: price })
    .eq('business_id', businessId)
    .eq('paystack_reference', 'manual_fix_month_1');
    
  const { error: err2 } = await supabaseAdmin
    .from('billing_invoices')
    .update({ amount: price })
    .eq('business_id', businessId)
    .eq('paystack_reference', 'manual_fix_month_2');

  if (error || err2) {
    console.error('Error updating invoices:', error || err2);
  } else {
    console.log('Successfully updated invoice amounts to', price);
  }
}

fixInvoicesAmount();
