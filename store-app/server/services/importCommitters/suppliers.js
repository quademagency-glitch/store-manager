const { supabaseAdmin } = require('../../db/supabase');

/**
 * Commits one validated supplier row: inserts the supplier (same defaults
 * as routes/suppliers.js), and if an opening_ap_amount was mapped, creates
 * a single opening-balance ap_bills row directly — is_opening_balance=true,
 * no payment auto-created.
 */
async function commitSupplierRow(row, { businessId, userId, importBatchId }) {
  const { data: supplier, error } = await supabaseAdmin
    .from('suppliers')
    .insert({
      business_id: businessId,
      name: row.name,
      contact_person: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      payment_terms: 'Net 30',
      lead_time_days: 7,
      import_batch_id: importBatchId,
    })
    .select()
    .single();

  if (error) throw error;

  if (row.opening_ap_amount > 0) {
    const { data: billNumber, error: numErr } = await supabaseAdmin.rpc('generate_ap_bill_number', { p_business_id: businessId });
    if (numErr) throw numErr;

    const { error: billErr } = await supabaseAdmin
      .from('ap_bills')
      .insert([{
        business_id: businessId,
        supplier_id: supplier.id,
        bill_number: billNumber,
        description: row.opening_ap_description || `Opening balance as of ${row.opening_ap_as_of_date}`,
        amount: row.opening_ap_amount,
        is_opening_balance: true,
        as_of_date: row.opening_ap_as_of_date,
        issue_date: row.opening_ap_as_of_date,
        import_batch_id: importBatchId,
        created_by: userId,
      }]);

    if (billErr) throw billErr;
  }

  return supplier;
}

module.exports = { commitSupplierRow };
