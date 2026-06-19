const crypto = require('crypto');
const { supabaseAdmin } = require('../../db/supabase');

/**
 * Commits one validated customer row: inserts the customer (same
 * customer_code generation as routes/customers.js), and if an
 * opening_ar_amount was mapped, creates a single opening-balance ar_invoices
 * row directly — is_opening_balance=true, no payment auto-created. The
 * balance starts fully open; any historical collections are recorded later
 * through the normal AR payment flow if the business chooses to.
 */
async function commitCustomerRow(row, { businessId, userId, importBatchId }) {
  const customer_code = 'CUST-' + crypto.randomBytes(2).toString('hex').toUpperCase() + Math.floor(Math.random() * 1000);

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .insert([{
      business_id: businessId,
      name: row.name,
      phone: row.phone,
      customer_code,
      import_batch_id: importBatchId,
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`A customer with phone '${row.phone}' already exists (race condition with a concurrent import — please retry this row).`);
    }
    throw error;
  }

  if (row.opening_ar_amount > 0) {
    const { data: invoiceNumber, error: numErr } = await supabaseAdmin.rpc('generate_ar_invoice_number', { p_business_id: businessId });
    if (numErr) throw numErr;

    const { error: invErr } = await supabaseAdmin
      .from('ar_invoices')
      .insert([{
        business_id: businessId,
        customer_id: customer.id,
        invoice_number: invoiceNumber,
        description: row.opening_ar_description || `Opening balance as of ${row.opening_ar_as_of_date}`,
        total_amount: row.opening_ar_amount,
        is_opening_balance: true,
        as_of_date: row.opening_ar_as_of_date,
        issued_date: row.opening_ar_as_of_date,
        import_batch_id: importBatchId,
        created_by: userId,
      }]);

    if (invErr) throw invErr;
  }

  return customer;
}

module.exports = { commitCustomerRow };
