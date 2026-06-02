import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';

export default function Alerts() {
  const { user } = useAuthContext();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending'); // 'pending', 'resolved', 'all'

  const fetchAlerts = async () => {
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
      console.error('Error fetching alerts:', err);
      setError('Failed to fetch alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const handleResolve = async (id) => {
    try {
      await api.put(`/api/alerts/${id}/resolve`);
      // Optimistically remove or update from list
      if (filter === 'pending') {
        setAlerts(prev => prev.filter(a => a.id !== id));
      } else {
        fetchAlerts();
      }
    } catch (err) {
      console.error('Error resolving alert:', err);
      alert('Failed to resolve alert.');
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'VOID': return <span className="badge badge-error">Voided Sale</span>;
      case 'DISCOUNT': return <span className="badge badge-warning">High Discount</span>;
      case 'SHRINKAGE': return <span className="badge badge-error">Shrinkage</span>;
      case 'CASH_OVERRIDE': return <span className="badge badge-warning">Cash Override</span>;
      default: return <span className="badge">{type}</span>;
    }
  };

  const canResolve = user?.permissions?.includes('manage_business') || user?.permissions?.includes('manage_platform') || user?.role === 'Manager' || user?.role === 'Admin';

  return (
    <div className="alerts-page page-container py-xl">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Alert Engine</h1>
          <p className="page-subtitle">Track voids, discounts, and suspicious activity.</p>
        </div>
        
        <div className="filter-group" style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button 
            className={`btn ${filter === 'resolved' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('resolved')}
          >
            Resolved
          </button>
          <button 
            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
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
                <td colSpan={canResolve && filter !== 'resolved' ? "6" : "5"} className="table-loading">
                  <div className="spinner"></div>
                  <p>Loading alerts...</p>
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={canResolve && filter !== 'resolved' ? "6" : "5"} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🛡️</div>
                  <p>No {filter !== 'all' ? filter : ''} alerts found.</p>
                </td>
              </tr>
            ) : (
              alerts.map(alert => (
                <tr key={alert.id}>
                  <td className="text-muted">{formatDate(alert.created_at)}</td>
                  <td>{getTypeBadge(alert.type)}</td>
                  <td>{alert.user?.name || alert.user?.email || 'System'}</td>
                  <td className="text-sm" style={{ maxWidth: '300px' }}>{alert.note}</td>
                  <td>
                    {alert.status === 'resolved' ? (
                      <span className="text-success text-sm">Resolved by {alert.resolved_by_user?.name || 'Admin'}</span>
                    ) : (
                      <span className="text-warning text-sm">Pending</span>
                    )}
                  </td>
                  {canResolve && filter !== 'resolved' && (
                    <td>
                      {alert.status === 'pending' && (
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => handleResolve(alert.id)}
                        >
                          Resolve
                        </button>
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
