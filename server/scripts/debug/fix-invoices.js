require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');

async function fixInvoices() {
  const businessId = '855c70f9-4aac-4f9f-8a4b-1e472496d4a3';
  const planId = '110919c7-eeee-4fd3-9d4c-dc51136edf86'; // Premium
  
  // Get the subscription ID
  const { data: sub } = await supabaseAdmin
    .from('business_subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .single();

  const subId = sub ? sub.id : null;

  // Insert two invoices
  const now = new Date();
  
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const invoices = [
    {
      business_id: businessId,
      subscription_id: subId,
      amount: 150, // Assuming Premium is 150 GHS, or adjust accordingly
      currency: 'GHS',
      status: 'paid',
      payment_method: 'paystack',
      paystack_reference: 'manual_fix_month_1',
      description: `Premium Plan — monthly payment`,
      paid_at: lastMonth.toISOString(),
      created_at: lastMonth.toISOString()
    },
    {
      business_id: businessId,
      subscription_id: subId,
      amount: 150, 
      currency: 'GHS',
      status: 'paid',
      payment_method: 'paystack',
      paystack_reference: 'manual_fix_month_2',
      description: `Premium Plan — monthly payment`,
      paid_at: now.toISOString(),
      created_at: now.toISOString()
    }
  ];

  const { error } = await supabaseAdmin
    .from('billing_invoices')
    .insert(invoices);

  if (error) {
    console.error('Error inserting invoices:', error);
  } else {
    console.log('Successfully inserted 2 invoices.');
  }
}

fixInvoices();
