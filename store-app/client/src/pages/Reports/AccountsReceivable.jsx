import { useState, useEffect } from 'react';
import { useReports } from '../../hooks/useReports';
import { useToast } from '../../hooks/useToast';
import '../../styles/reports.css';

export default function AccountsReceivable() {
  const toast = useToast();
  const { loading, arAging, fetchArAging } = useReports();

  useEffect(() => {
    fetchArAging();
  }, [fetchArAging]);

  const fmt = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const summary = arAging?.summary || {};

  const allInvoices = arAging ? [
    ...(arAging.aging.current || []),
    ...(arAging.aging.days_30 || []),
    ...(arAging.aging.days_60 || []),
    ...(arAging.aging.days_90_plus || []),
  ] : [];

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
              <span className="ar-bucket-count">{arAging.aging.current?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-30">
              <span className="ar-bucket-label">1–30 Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_30)}</span>
              <span className="ar-bucket-count">{arAging.aging.days_30?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-60">
              <span className="ar-bucket-label">31–60 Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_60)}</span>
              <span className="ar-bucket-count">{arAging.aging.days_60?.length || 0} invoices</span>
            </div>
            <div className="ar-bucket-card ar-90">
              <span className="ar-bucket-label">90+ Days</span>
              <span className="ar-bucket-value">{fmt(summary.days_90_plus)}</span>
              <span className="ar-bucket-count">{arAging.aging.days_90_plus?.length || 0} invoices</span>
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
                  <tr><td colSpan="8" className="empty-state">No outstanding invoices.</td></tr>
                ) : (
                  allInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.invoice_number || inv.id?.slice(0, 8)}</td>
                      <td>{inv.customer?.name || '—'}</td>
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
