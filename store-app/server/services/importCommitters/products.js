const { supabaseAdmin } = require('../../db/supabase');

/**
 * Commits one validated product row: inserts the product, then sets opening
 * stock, the exact same sequence as the existing single-product "initial
 * stock" flow in routes/products.js (insert product -> product_inventory ->
 * a RECEIPT stock_movement). No QR/unit-level tracking is touched.
 *
 * `row.location_id` is already resolved by validateProductRows, which falls
 * back to the business's only location and refuses a quantity it cannot
 * place. By the time a row reaches here, a quantity above zero always has a
 * location to go to.
 */
async function commitProductRow(row, { businessId, userId, importBatchId }) {
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert([{
      name: row.name,
      sku: row.sku,
      category: row.category,
      price: row.price,
      cost_price: row.cost_price || 0,
      qr_code_data: row.sku,
      business_id: businessId,
      import_batch_id: importBatchId,
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`A product with SKU '${row.sku}' already exists (race condition with a concurrent import, please retry this row).`);
    }
    throw error;
  }

  if (row.location_id && row.opening_quantity > 0) {
    const { error: invError } = await supabaseAdmin
      .from('product_inventory')
      .insert({
        product_id: product.id,
        location_id: row.location_id,
        quantity: row.opening_quantity,
        low_stock_threshold: 5,
      });

    if (invError) throw invError;

    // The movement is the audit trail for the balance above, and undo finds
    // it by reference_id. Letting this fail quietly leaves stock that no
    // history explains and that undo cannot reverse, so it throws like the
    // rest of the row.
    const { error: moveError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id: product.id,
        user_id: userId,
        business_id: businessId,
        location_id: row.location_id,
        quantity_change: row.opening_quantity,
        movement_type: 'RECEIPT',
        reference_id: importBatchId,
        notes: 'Opening stock, bulk import',
      });

    if (moveError) throw moveError;
  }

  return product;
}

module.exports = { commitProductRow };
