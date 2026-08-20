import { useEffect } from 'react';
import { useReports } from '../../hooks/useReports';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import { useCurrency } from '../../hooks/useCurrency';
import '../../styles/reports.css';
import { EmptyStateRow } from '../../components/ui';

export default function AccountsReceivable() {
  const { loading, arAging, fetchArAging } = useReports();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);

  useEffect(() => {
    fetchArAging();
  }, [fetchArAging]);

  const summary = arAging?.summary || {};

  // Optional-chained through `aging` as well as `arAging`.
  //
  // The guard checked one level and then dereferenced two, so any 200 whose
  // body lacks `aging` threw on render and took the page out. The server
  // always sends { aging, summary }, and the hook leaves arAging null on
  // error, so this is not reachable from the live API today. It was reachable
  // from the empty-collection test mode, and that mattered more than it
  // sounds: a crashed page has no <tbody>, so the empty-state test for this
  // route had nothing to inspect and passed without checking anything.
  // NOTE ON THE ?. PLACEMENT: the bucket counts below were written as
  // `arAging.aging.current?.length`, which guards `current` and dereferences
  // `aging` unguarded. The optional chain has to sit on the link that can
  // actually be missing, which is `aging`. That is why they all read from this
  // one variable now rather than re-walking the chain five times.
  const buckets = arAging?.aging;
  const allInvoices = [
    ...(buckets?.current || []),
    ...(buckets?.days_30 || []),
    ...(buckets?.days_60 || []),
    ...(buckets?.days_90_plus || []),
  ];

  return (
    <div className="reports-page">
      <div className="page-header">
        <div>
          <h1>Accounts Receivable</h1>
          <p className="page-subtitle">Outstanding invoices and aging analysis</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchArAging} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Aging Buckets */}
      {arAging && (
        <>
          <div className="ar-bucket-grid">
            <div className="ar-bucket-card ar-current">
              <span className="ar-bucket-label">Current</span>
              <span className="ar-bucket-value">{fmt(summary.current)}</span>
              <span className="ar-bucket-count">{buckets?.current?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-30">
              <span className="ar-bucket-label">1-30 Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_30)}</span>
              <span className="ar-bucket-count">{buckets?.days_30?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-60">
              <span className="ar-bucket-label">31-60 Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_60)}</span>
              <span className="ar-bucket-count">{buckets?.days_60?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-90">
              <span className="ar-bucket-label">90+ Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_90_plus)}</span>
              <span className="ar-bucket-count">{buckets?.days_90_plus?.length || 0} invoices</span>
            </div>
          </div>

          {/* Total Outstanding */}
          <div className="ar-total-bar">
            <span>Total Outstanding</span>
            <span className="ar-total-value">{fmt(summary.totalOutstanding)}</span>
          </div>

          {/* Invoice Table */}
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allInvoices.length === 0 ? (
                  <EmptyStateRow colSpan={8} icon="billing" title="No outstanding invoices" />
                ) : (
                  allInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.invoice_number || inv.id?.slice(0, 8)}</td>
                      <td>{inv.customer?.name || '-'}</td>
                      <td>{fmt(inv.total_amount)}</td>
                      <td>{fmt(inv.amount_paid)}</td>
                      <td className="font-semibold">{fmt(inv.outstanding)}</td>
                      <td>{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td>
                        {inv.days_overdue > 0 ? (
                          <span className={`badge ${inv.days_overdue > 60 ? 'badge-error' : inv.days_overdue > 30 ? 'badge-warning' : 'badge-info'}`}>
                            {inv.days_overdue}d
                          </span>
                        ) : (
                          <span className="badge badge-success">Current</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${inv.status === 'overdue' ? 'badge-error' : inv.status === 'partial' ? 'badge-warning' : 'badge-info'}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!arAging && !loading && (
        <div className="empty-state-card" style={{ marginTop: '32px' }}>
          <p>Loading accounts receivable data...</p>
        </div>
      )}
    </div>
  );
}
