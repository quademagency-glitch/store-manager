import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';

export default function Alerts() {
  const { user } = useAuthContext();
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending'); // 'pending', 'resolved', 'all'
  const [typeFilter, setTypeFilter] = useState('all');

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      let url = '/api/alerts';
      if (filter !== 'all') {
        url += `?status=${filter}`;
      }
      const res = await api.get(url);
      setAlerts(res.data);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching alerts:', err);
      setError('Failed to fetch alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleResolve = async (id) => {
    try {
      await api.put(`/api/alerts/${id}/resolve`);
      if (filter === 'pending') {
        setAlerts(prev => prev.filter(a => a.id !== id));
      } else {
        fetchAlerts();
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error resolving alert:', err);
      toast.error('Failed to resolve alert.');
    }
  };

  const handleApproveVoid = async (alertObj) => {
    const saleId = alertObj.reference_id;
    if (!saleId) return;
    try {
      await api.put(`/api/sales/${saleId}/approve-void`);
      toast.success('Void approved. Sale voided and stock restored.');
      fetchAlerts();
    } catch (err) {
      toast.error(err.message || 'Failed to approve void');
    }
  };

  const handleRejectVoid = async (alertObj) => {
    const saleId = alertObj.reference_id;
    if (!saleId) return;
    try {
      await api.put(`/api/sales/${saleId}/reject-void`);
      toast.info('Void rejected. Sale remains completed.');
      fetchAlerts();
    } catch (err) {
      toast.error(err.message || 'Failed to reject void');
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const getTypeBadge = (type) => {
    const badges = {
      'VOID': { label: 'Voided Sale', cls: 'badge-error' },
      'VOID_REQUEST': { label: 'Void Request', cls: 'badge-warning' },
      'DISCOUNT': { label: 'Discount', cls: 'badge-warning' },
      'HIGH_DISCOUNT': { label: 'High Discount', cls: 'badge-error' },
      'SHRINKAGE': { label: 'Shrinkage', cls: 'badge-error' },
      'CASH_OVERRIDE': { label: 'Cash Override', cls: 'badge-warning' },
      'LOW_STOCK': { label: 'Low Stock', cls: 'badge-warning' },
      'SUSPICIOUS_PATTERN': { label: 'Suspicious', cls: 'badge-error' },
      'AUDIT_DISCREPANCY': { label: 'Audit Issue', cls: 'badge-error' },
      'STOCK_TAKE_MISSING': { label: 'Missing Items', cls: 'badge-error' },
      'AFTER_HOURS': { label: 'After Hours', cls: 'badge-warning' },
    };
    const badge = badges[type] || { label: type, cls: '' };
    return <span className={`badge ${badge.cls}`}>{badge.label}</span>;
  };

  const getSeverityBadge = (severity) => {
    const colors = {
      critical: { bg: 'rgba(239,68,68,0.2)', color: '#ef4444', label: '● Critical' },
      high: { bg: 'rgba(249,115,22,0.2)', color: '#f97316', label: '● High' },
      medium: { bg: 'rgba(234,179,8,0.2)', color: '#eab308', label: '● Medium' },
      low: { bg: 'rgba(34,197,94,0.2)', color: '#22c55e', label: '● Low' }
    };
    const s = colors[severity] || colors.medium;
    return (
      <span style={{
        fontSize: '0.75rem', fontWeight: 600, color: s.color,
        background: s.bg, padding: '2px 8px', borderRadius: '4px'
      }}>
        {s.label}
      </span>
    );
  };

  const canResolve = user?.permissions?.includes('manage_business') || user?.permissions?.includes('manage_platform') || user?.role === 'Manager' || user?.role === 'Admin';

  // Filter by type
  const filteredAlerts = typeFilter === 'all' ? alerts : alerts.filter(a => a.type === typeFilter);

  // Stats
  const pendingCount = alerts.filter(a => a.status === 'pending').length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'pending').length;
  const highCount = alerts.filter(a => a.severity === 'high' && a.status === 'pending').length;

  const alertTypes = ['all', 'VOID_REQUEST', 'VOID', 'HIGH_DISCOUNT', 'DISCOUNT', 'SUSPICIOUS_PATTERN', 'SHRINKAGE', 'STOCK_TAKE_MISSING', 'AFTER_HOURS', 'LOW_STOCK'];

  return (
    <div className="alerts-page page-container py-xl">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Loss Prevention Alerts</h1>
          <p className="page-subtitle">Track voids, discounts, suspicious patterns, and stock take results.</p>
        </div>
        
        <div className="filter-group" style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('pending')}>
            Pending {pendingCount > 0 && <span style={{ marginLeft: '4px', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '10px', fontSize: '0.8rem' }}>{pendingCount}</span>}
          </button>
          <button className={`btn ${filter === 'resolved' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('resolved')}>Resolved</button>
          <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>All</button>
        </div>
      </header>

      {/* Stats Bar */}
      {filter === 'pending' && pendingCount > 0 && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {criticalCount > 0 && (
            <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}>
              🔴 {criticalCount} Critical
            </div>
          )}
          {highCount > 0 && (
            <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.85rem', fontWeight: 600, color: '#f97316' }}>
              🟠 {highCount} High
            </div>
          )}
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.85rem' }}>
            {pendingCount} pending total
          </div>
        </div>
      )}

      {/* Type Filter */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '4px' }}>
        {alertTypes.map(t => (
          <button key={t}
            className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error">
          <p>{error}</p>
        </div>
      )}

      <div className="glass-panel" style={{ marginTop: '0.5rem' }}>
        <table className="glass-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Severity</th>
              <th>Type</th>
              <th>User / Staff</th>
              <th>Details</th>
              <th>Status</th>
              {canResolve && filter !== 'resolved' && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canResolve && filter !== 'resolved' ? "7" : "6"} className="text-center py-xl text-muted">
                  <div className="spinner mx-auto mb-sm"></div>
                  <p>Loading alerts...</p>
                </td>
              </tr>
            ) : filteredAlerts.length === 0 ? (
              <tr>
                <td colSpan={canResolve && filter !== 'resolved' ? "7" : "6"} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🛡️</div>
                  <p>No {filter !== 'all' ? filter : ''} alerts found.</p>
                </td>
              </tr>
            ) : (
              filteredAlerts.map(alertItem => (
                <tr key={alertItem.id} style={{
                  borderLeft: alertItem.severity === 'critical' ? '3px solid #ef4444' :
                              alertItem.severity === 'high' ? '3px solid #f97316' : 'none'
                }}>
                  <td className="text-muted">{formatDate(alertItem.created_at)}</td>
                  <td>{getSeverityBadge(alertItem.severity)}</td>
                  <td>{getTypeBadge(alertItem.type)}</td>
                  <td>{alertItem.user?.name || alertItem.user?.email || 'System'}</td>
                  <td className="text-sm" style={{ maxWidth: '300px' }}>
                    <div>{alertItem.note}</div>
                    {/* Expandable metadata for suspicious patterns */}
                    {alertItem.metadata && alertItem.type === 'SUSPICIOUS_PATTERN' && alertItem.metadata.pattern && (
                      <div style={{ marginTop: '4px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', fontSize: '0.75rem' }}>
                        Pattern: <strong>{alertItem.metadata.pattern.replace(/_/g, ' ')}</strong>
                        {alertItem.metadata.void_count && <> · {alertItem.metadata.void_count} voids</>}
                        {alertItem.metadata.total_value && <> · ${alertItem.metadata.total_value.toFixed(2)}</>}
                      </div>
                    )}
                    {/* Missing items from stock take */}
                    {alertItem.metadata && alertItem.type === 'STOCK_TAKE_MISSING' && alertItem.metadata.missing_items && (
                      <div style={{ marginTop: '4px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', fontSize: '0.75rem' }}>
                        Missing: {alertItem.metadata.missing_items.slice(0, 5).map((m, i) => (
                          <span key={i}>{m.product} ({m.qr_code}){i < Math.min(alertItem.metadata.missing_items.length, 5) - 1 ? ', ' : ''}</span>
                        ))}
                        {alertItem.metadata.missing_items.length > 5 && <span> +{alertItem.metadata.missing_items.length - 5} more</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    {alertItem.status === 'resolved' ? (
                      <span className="text-success text-sm">Resolved</span>
                    ) : (
                      <span className="text-warning text-sm">Pending</span>
                    )}
                  </td>
                  {canResolve && filter !== 'resolved' && (
                    <td>
                      {alertItem.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {alertItem.type === 'VOID_REQUEST' ? (
                            <>
                              <button 
                                className="btn btn-sm" 
                                style={{ background: '#22c55e', color: 'white', fontSize: '0.75rem' }}
                                onClick={() => handleApproveVoid(alertItem)}
                              >
                                ✅ Approve
                              </button>
                              <button 
                                className="btn btn-sm"
                                style={{ background: '#ef4444', color: 'white', fontSize: '0.75rem' }}
                                onClick={() => handleRejectVoid(alertItem)}
                              >
                                ❌ Reject
                              </button>
                            </>
                          ) : (
                            <button 
                              className="btn btn-sm btn-outline"
                              onClick={() => handleResolve(alertItem.id)}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
