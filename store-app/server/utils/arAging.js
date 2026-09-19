const { DAY_MS } = require('./reportDates');

const OPEN_AR_STATUSES = ['sent', 'overdue', 'partial'];

function ageInvoices(invoices, asOf = new Date().toISOString().slice(0, 10)) {
  const today = new Date(`${asOf}T00:00:00.000Z`).getTime();
  const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], over_90: [] };
  for (const invoice of invoices || []) {
    const outstanding = Math.round((Number(invoice.total_amount) - Number(invoice.amount_paid || 0)) * 100) / 100;
    if (outstanding <= 0) continue;
    // Undated invoices use the same net-30 fallback in both AR views.
    const issued = Date.parse(invoice.issued_date);
    const due = invoice.due_date ? Date.parse(invoice.due_date) : issued + 30 * DAY_MS;
    const effectiveDue = Number.isFinite(due) ? new Date(due).toISOString().slice(0, 10) : null;
    const days = effectiveDue ? Math.max(0, Math.floor((today - Date.parse(effectiveDue)) / DAY_MS)) : 0;
    const key = days === 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : 'over_90';
    buckets[key].push({ ...invoice, outstanding, days_overdue: days, effective_due_date: effectiveDue });
  }
  const totals = Object.fromEntries(Object.entries(buckets).map(([key, rows]) =>
    [key, Math.round(rows.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100]));
  return { buckets, totals, asOf };
}

module.exports = { ageInvoices, OPEN_AR_STATUSES };
