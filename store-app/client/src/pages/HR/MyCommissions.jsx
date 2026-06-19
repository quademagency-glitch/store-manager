import { useState, useEffect } from 'react';
import { useHR } from '../../hooks/useHR';
import { useAuthContext } from '../../lib/AuthContext';
import { useToast } from '../../hooks/useToast';
import '../../styles/hr.css';

export default function MyCommissions() {
  const { user } = useAuthContext();
  const toast = useToast();
  const { loading, commissions, fetchCommissions } = useHR();

  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  useEffect(() => {
    fetchCommissions({ unpaidOnly });
  }, [fetchCommissions, unpaidOnly]);

  const handleFilter = () => {
    fetchCommissions({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      unpaidOnly,
    });
  };

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const summary = commissions?.summary || {};

  return (
    <div className="hr-page">
      <div className="page-header">
        <h1>My Commissions</h1>
        <p className="page-subtitle">Track your sales commissions</p>
      </div>

      {/* Summary Cards */}
      <div className="hr-summary-grid">
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2V22" strokeLinecap="round" /><path d="M17 7H9.5C7.57 7 6 8.57 6 10.5S7.57 14 9.5 14h5c1.93 0 3.5 1.57 3.5 3.5S16.43 21 14.5 21H6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">Total Earned</span>
            <span className="hr-summary-value">{fmt(summary.totalEarned)}</span>
          </div>
        </div>
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">Paid Out</span>
            <span className="hr-summary-value">{fmt(summary.totalPaid)}</span>
          </div>
        </div>
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">Pending</span>
            <span className="hr-summary-value">{fmt(summary.totalUnpaid)}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="hr-filter-bar">
        <h3>Commission History</h3>
        <div className="hr-filters">
          <input type="date" className="form-input" value={dateRange.startDate} onChange={e => setDateRange(p => ({ ...p, startDate: e.target.value }))} />
          <input type="date" className="form-input" value={dateRange.endDate} onChange={e => setDateRange(p => ({ ...p, endDate: e.target.value }))} />
          <label className="hr-checkbox-label">
            <input type="checkbox" checked={unpaidOnly} onChange={e => setUnpaidOnly(e.target.checked)} />
            Unpaid only
          </label>
          <button className="btn btn-secondary" onClick={handleFilter}>Filter</button>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Sale</th>
              <th>Rule</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(commissions?.data || []).length === 0 ? (
              <tr><td colSpan="5" className="empty-state">No commissions found.</td></tr>
            ) : (
              (commissions.data).map(c => (
                <tr key={c.id}>
                  <td>{formatDate(c.created_at)}</td>
                  <td>
                    {c.sale ? (
                      <span className="badge badge-secondary">
                        {c.sale.receipt_number || c.sale.id?.slice(0, 8)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {c.rule ? (
                      <span>{c.rule.name} ({c.rule.type === 'percentage' ? `${c.rule.value}%` : fmt(c.rule.value)})</span>
                    ) : '—'}
                  </td>
                  <td className="font-semibold">{fmt(c.amount)}</td>
                  <td>
                    {c.paid_at
                      ? <span className="badge badge-success">Paid {formatDate(c.paid_at)}</span>
                      : <span className="badge badge-warning">Pending</span>
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {commissions.totalPages > 1 && (
        <div className="pagination-row">
          {Array.from({ length: commissions.totalPages }, (_, i) => (
            <button
              key={i}
              className={`btn btn-sm ${commissions.page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => fetchCommissions({ page: i + 1, unpaidOnly })}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
