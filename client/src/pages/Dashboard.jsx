import { useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';

export default function Dashboard() {
  const { user, role, signOut, hasPermission } = useAuthContext();

  const { summary, loading, fetchSummary } = useAnalytics();

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleSignOut = async () => {
    await signOut();
  };

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  return (
    <>
      <header className="page-header">
          <div>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">
              Welcome back, <strong>{user?.email?.split('@')[0] || 'User'}</strong>
            </p>
          </div>
          <div className="dashboard-role-badge">
            <span className={`role-badge role-badge-${role?.toLowerCase()}`}>
              {role || 'Unknown'}
            </span>
          </div>
        </header>

        <div className="dashboard-content">
          {/* Stats Cards — placeholders for future data */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon stat-icon-sales">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Today's Sales</span>
                <span className="stat-value">{loading ? '...' : fmt(summary?.todaySalesTotal)}</span>
                <span className="stat-hint">Total revenue today</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-products">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M4 8L12 4L20 8V16L12 20L4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 12V20" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 8L12 12L20 8" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Products</span>
                <span className="stat-value">{loading ? '...' : summary?.totalProducts || 0}</span>
                <span className="stat-hint">Active items in catalog</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-stock">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 17H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M5 21H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Stock Alerts</span>
                <span className="stat-value">{loading ? '...' : summary?.lowStockCount || 0}</span>
                <span className="stat-hint">Items low on stock</span>
              </div>
            </div>

            {hasPermission('view_analytics') && (
              <div className="stat-card">
                <div className="stat-icon stat-icon-alerts">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3L21 20H3L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M12 10V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="12" cy="16.5" r="1" fill="currentColor" />
                  </svg>
                </div>
                <div className="stat-details">
                  <span className="stat-label">Theft Alerts</span>
                  <span className="stat-value">{loading ? '...' : summary?.theftAlertsCount || 0}</span>
                  <span className="stat-hint">Shrinkage events (30d)</span>
                </div>
              </div>
            )}
          </div>

          {/* Empty State */}
          <div className="dashboard-empty-state">
            <div className="empty-state-icon">🚀</div>
            <h2>All Core Systems Live!</h2>
            <p>Auth, Products, Sales, Inventory, and Analytics are fully operational.</p>
          </div>
      </div>
    </>
  );
}
