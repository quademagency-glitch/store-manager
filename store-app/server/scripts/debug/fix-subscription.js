require('dotenv').config();
const { supabaseAdmin } = require('./db/supabase');

async function fixSub() {
  const businessId = '855c70f9-4aac-4f9f-8a4b-1e472496d4a3';
  const planId = '110919c7-eeee-4fd3-9d4c-dc51136edf86'; // Premium

  // 1. Update business
  const { error: err1 } = await supabaseAdmin
    .from('businesses')
    .update({ 
      subscription_plan_id: planId,
      status: 'active'
    })
    .eq('id', businessId);
    
  if (err1) console.error('Error updating business:', err1);
  else console.log('Business updated successfully.');

  // 2. Upsert subscription
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const subData = {
    business_id: businessId,
    plan_id: planId,
    status: 'active',
    current_period_start: now.toISOString(),
    current_period_end: nextMonth.toISOString(),
    billing_cycle: 'monthly',
  };

  const { data: existingSub } = await supabaseAdmin
    .from('business_subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .single();

  if (existingSub) {
    const { error: err2 } = await supabaseAdmin
      .from('business_subscriptions')
      .update(subData)
      .eq('id', existingSub.id);
    if (err2) console.error('Error updating subscription:', err2);
    else console.log('Subscription updated successfully.');
  } else {
    const { error: err2 } = await supabaseAdmin
      .from('business_subscriptions')
      .insert([subData]);
    if (err2) console.error('Error inserting subscription:', err2);
    else console.log('Subscription inserted successfully.');
  }
}

fixSub();
