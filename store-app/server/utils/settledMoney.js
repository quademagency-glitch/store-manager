const { fetchAllRows } = require('./fetchAllRows');
const { applyReportRange } = require('./reportDates');

// A historical void request still represents a settled receipt until its
// supporting evidence is reconciled. Reservations and cancelled holds do not.
const SETTLED_STATUSES = ['completed', 'void_pending'];
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const saleCash = sale => sale.payment_method && sale.payment_method !== 'cash' ? 0 : Number(sale.cash_received ?? sale.total_amount ?? 0);
const refundCash = refund => Number(refund.cash_refund_amount ?? (refund.sale?.payment_method === 'cash' ? refund.total_refund_amount : 0));
const saleRevenue = sale => Number(sale.total_amount || 0) - Number(sale.tax_amount || 0);
function refundRevenue(refund) {
  const gross = Number(refund.sale?.total_amount || 0);
  const tax = Number(refund.tax_refund_amount ?? (gross > 0 ? Number(refund.total_refund_amount || 0) * Number(refund.sale?.tax_amount || 0) / gross : 0));
  return Number(refund.total_refund_amount || 0) - tax;
}
function scopeMoney(query, user, locationId = user.active_location_id, locationColumn = 'location_id') {
  query = query.eq('business_id', user.business_id);
  const admin = ['Business Admin', 'Platform Admin'].includes(user.role);
  if (locationId) {
    if (!admin && !user.location_ids?.includes(locationId)) throw Object.assign(new Error('Branch access denied'), { status: 403 });
    return query.eq(locationColumn, locationId);
  }
  return admin ? query : query.in(locationColumn, user.location_ids?.length ? user.location_ids : ['00000000-0000-0000-0000-000000000000']);
}
async function loadSettledMoney(db, user, range, { locationId = user.active_location_id, items = false } = {}) {
  const scoped = (query, column) => applyReportRange(scopeMoney(query, user, locationId), range, column).order('id');
  const [sales, refunds] = await Promise.all([
    fetchAllRows(() => scoped(db.from('sales').select('id,receipt_number,location_id,salesperson_id,status,total_amount,tax_amount,discount_amount,payment_method,cash_received,accounting_at,settlement_id' +
      (items ? ',sale_items(id,product_id,quantity,unit_price,unit_cost,cost_basis,product:products!product_id(id,name))' : '')).in('status', SETTLED_STATUSES), 'accounting_at')),
    fetchAllRows(() => scoped(db.from('returns').select('id,original_sale_id,processed_by,location_id,created_at,total_refund_amount,tax_refund_amount,cash_refund_amount,sale:sales!original_sale_id(total_amount,tax_amount,payment_method,salesperson_id)' +
      (items ? ',return_items(quantity,refund_amount,sale_item:sale_items!sale_item_id(id,product_id,unit_cost,cost_basis,product:products!product_id(id,name)))' : '')), 'created_at')),
  ]);
  return { sales, refunds };
}
module.exports = { SETTLED_STATUSES, roundMoney, saleCash, refundCash, saleRevenue, refundRevenue, scopeMoney, loadSettledMoney };
