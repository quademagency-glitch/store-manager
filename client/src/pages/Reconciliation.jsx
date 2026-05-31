import { useState, useEffect, useMemo } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';

export default function Reconciliation() {
  const { reconciliationData, loading, fetchReconciliation, error } = useAnalytics();
  
  // Default to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReconciliation(selectedDate);
  }, [fetchReconciliation, selectedDate]);

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  // Calculate totals across all staff
  const totals = useMemo(() => {
    if (!reconciliationData || reconciliationData.length === 0) {
      return { salesTotal: 0, shrinkageTotal: 0, discountsTotal: 0, voidsTotal: 0 };
    }
    return reconciliationData.reduce((acc, row) => ({
      salesTotal: acc.salesTotal + Number(row.totalSalesRevenue || 0),
      shrinkageTotal: acc.shrinkageTotal + Number(row.totalShrinkageValue || 0),
      discountsTotal: acc.discountsTotal + Number(row.totalDiscounts || 0),
      voidsTotal: acc.voidsTotal + Number(row.totalVoidValue || 0)
    }), { salesTotal: 0, shrinkageTotal: 0, discountsTotal: 0, voidsTotal: 0 });
  }, [reconciliationData]);

  return (
    <div className="reconciliation-page page-container py-xl">
      <header className="page-header flex justify-between items-end">
        <div>
          <h1 className="page-title">End-of-day Reconciliation</h1>
          <p className="page-subtitle">Daily summary of sales and shrinkage per staff member.</p>
        </div>
        
        <div className="flex gap-md items-center">
          <label className="text-sm text-muted font-medium">Select Date:</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input"
            style={{ width: 'auto' }}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </header>

      {/* Totals Summary */}
      <div className="stats-grid mb-xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
          <div className="stat-details">
            <span className="stat-label">Total Day Sales</span>
            <span className="stat-value text-success">{fmt(totals.salesTotal)}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--color-warning)' }}>
          <div className="stat-details">
            <span className="stat-label">Total Day Discounts</span>
            <span className="stat-value text-warning">{fmt(totals.discountsTotal)}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--color-error)' }}>
          <div className="stat-details">
            <span className="stat-label">Total Day Voids</span>
            <span className="stat-value text-error">{fmt(totals.voidsTotal)}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--color-error)' }}>
          <div className="stat-details">
            <span className="stat-label">Total Day Shrinkage</span>
            <span className="stat-value text-error">{fmt(totals.shrinkageTotal)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-xl">
          <p>{error}</p>
        </div>
      )}

      <div className="content-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Role</th>
              <th>Sales (Rev/Cnt)</th>
              <th>Discounts Given</th>
              <th>Voids (Val/Cnt)</th>
              <th>Shrinkage (Val/Cnt)</th>
              <th>Net Contribution</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="table-loading">
                  <div className="spinner"></div>
                  <p>Loading reconciliation data...</p>
                </td>
              </tr>
            ) : reconciliationData.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📊</div>
                  <p>No activity found for this date.</p>
                </td>
              </tr>
            ) : (
              reconciliationData.map(row => {
                const net = row.totalSalesRevenue - row.totalShrinkageValue;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="font-medium">{row.name || 'Unknown'}</div>
                      <div className="text-sm text-muted">{row.email}</div>
                    </td>
                    <td>
                      <span className={`badge ${row.role?.toLowerCase() === 'manager' ? 'badge-primary' : 'badge-secondary'}`}>
                        {row.role}
                      </span>
                    </td>
                    <td>
                      <div className="font-medium text-success">{fmt(row.totalSalesRevenue)}</div>
                      <div className="text-sm text-muted">{row.salesCount} trans.</div>
                    </td>
                    <td className="font-medium text-warning">{fmt(row.totalDiscounts)}</td>
                    <td>
                      <div className="font-medium text-error">{fmt(row.totalVoidValue)}</div>
                      <div className="text-sm text-muted">{row.voidCount} void(s)</div>
                    </td>
                    <td>
                      <div className="font-medium text-error">{fmt(row.totalShrinkageValue)}</div>
                      <div className="text-sm text-muted">{row.shrinkageCount} item(s)</div>
                    </td>
                    <td className="font-bold" style={{ color: net >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {fmt(net)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
