import { useEffect, useMemo } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';

export default function Alerts() {
  const { shrinkageEvents, loading, fetchShrinkageEvents, error } = useAnalytics();

  useEffect(() => {
    fetchShrinkageEvents();
  }, [fetchShrinkageEvents]);

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const fmt = (amount) => `$${Number(amount).toFixed(2)}`;

  const totalValueLost = useMemo(() => {
    return shrinkageEvents.reduce((acc, event) => acc + (event.value_lost || 0), 0);
  }, [shrinkageEvents]);

  return (
    <div className="alerts-page page-container py-xl">
      <header className="page-header">
        <div>
          <h1 className="page-title">Theft & Shrinkage Alerts</h1>
          <p className="page-subtitle">Detailed log of all stock shrinkage and damage events.</p>
        </div>
        
        <div className="alert-summary-card" style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', padding: '16px 24px', borderRadius: '12px', textAlign: 'right' }}>
          <div style={{ color: '#fca5a5', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Value Lost</div>
          <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>{fmt(totalValueLost)}</div>
        </div>
      </header>

      {error && (
        <div className="alert alert-error">
          <p>{error}</p>
        </div>
      )}

      <div className="content-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Reported By</th>
              <th>Quantity Lost</th>
              <th>Value Lost</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="table-loading">
                  <div className="spinner"></div>
                  <p>Loading alerts...</p>
                </td>
              </tr>
            ) : shrinkageEvents.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🛡️</div>
                  <p>No shrinkage events recorded.</p>
                </td>
              </tr>
            ) : (
              shrinkageEvents.map(event => (
                <tr key={event.id}>
                  <td className="text-muted">{formatDate(event.created_at)}</td>
                  <td>
                    <div className="font-medium">{event.product?.name || 'Unknown'}</div>
                    <div className="text-sm text-muted text-mono mt-xs">{event.product?.sku}</div>
                  </td>
                  <td>{event.user?.email?.split('@')[0] || 'Unknown'}</td>
                  <td className="font-bold text-error">{event.quantity_change}</td>
                  <td className="font-bold text-error">{fmt(event.value_lost)}</td>
                  <td className="text-muted text-sm" style={{ maxWidth: '250px' }}>{event.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
