/** Branch thresholds are the single rule for alerts, filters and badges. */
export function stockAt(product, location = 'all') {
  const rows = (product.product_inventory || []).filter(row => location === 'all' || row.location_id === location);
  return {
    quantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    low: rows.some(row => Number(row.quantity || 0) <= Number(row.low_stock_threshold ?? 0)),
    shortages: rows.filter(row => Number(row.quantity || 0) <= Number(row.low_stock_threshold ?? 0)),
    threshold: rows.reduce((sum, row) => sum + Number(row.low_stock_threshold || 0), 0),
  };
}

/** "1 unit", "3 units". */
export const unitCount = n => `${n} ${Number(n) === 1 ? 'unit' : 'units'}`;
