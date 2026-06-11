import { useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, role, hasPermission } = useAuthContext();
  const { summary, recentActivity, loading, fetchSummary, fetchRecentActivity } = useAnalytics();
  
  useEffect(() => {
    fetchSummary();
    fetchRecentActivity();
  }, [fetchSummary, fetchRecentActivity]);

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  const timeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' mins ago';
    return Math.floor(seconds) + ' seconds ago';
  };

  const handleResetDashboard = async () => {
    if (window.confirm("WARNING: This will PERMANENTLY delete all sales, stock movements, and alerts for this business/location. Inventory levels will NOT be reset. Are you absolutely sure you want to wipe the dashboard data?")) {
      try {
        const res = await api.delete('/analytics/reset');
        if (res.message) {
          alert('Dashboard has been reset.');
          fetchSummary();
          fetchRecentActivity();
        }
      } catch (err) {
        alert(err.message || 'Failed to reset dashboard');
      }
    }
  };

  return (
    <>
      {/* Dynamic Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="banner-content">
          <h1 className="banner-title">
            Good morning, <span className="highlight-text">{user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}</span>! 👋
          </h1>
          <p className="banner-subtitle">
            Here's what's happening in your store today.
          </p>
        </div>
        <div className="banner-role">
          <span className={`role-badge role-badge-${role?.toLowerCase().replace(/\s+/g, '-')}`}>
            {role || 'Unknown'}
          </span>
        </div>
        <div className="banner-glow-1"></div>
        <div className="banner-glow-2"></div>
      </div>

      <div className="dashboard-content">
        
        {/* Quick Actions Panel */}
        <div className="dashboard-quick-actions">
          {hasPermission('create_sales') && (
            <Link to="/sales" className="action-btn">
              <div className="action-icon action-icon-primary">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </div>
              <span>New Sale</span>
            </Link>
          )}
          {hasPermission('manage_products') && (
            <Link to="/products" className="action-btn">
              <div className="action-icon action-icon-secondary">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <span>Add Product</span>
            </Link>
          )}
          {hasPermission('manage_inventory') && (
            <Link to="/inventory" className="action-btn">
              <div className="action-icon action-icon-warning">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 8L12 4L20 8V16L12 20L4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 12V20" stroke="currentColor" strokeWidth="2" /><path d="M4 8L12 12L20 8" stroke="currentColor" strokeWidth="2" /></svg>
              </div>
              <span>Check Stock</span>
            </Link>
          )}
          {hasPermission('view_analytics') && (
            <Link to="/reconciliation" className="action-btn">
              <div className="action-icon action-icon-info">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 17H21M5 21H19M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <span>View Reports</span>
            </Link>
          )}
          <Link to="/till-account" className="action-btn">
            <div className="action-icon action-icon-secondary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
                <path d="M7 14H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span>Till Account</span>
          </Link>
          {(role === 'Business Admin' || role === 'Manager') && (
            <button onClick={handleResetDashboard} className="action-btn">
              <div className="action-icon action-icon-error" style={{ color: 'var(--color-error)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
              </div>
              <span>Reset Dash</span>
            </button>
          )}
        </div>

        {/* Enhanced Stats Grid */}
        <div className="stats-grid">
          {hasPermission('view_sales') && (
            <div className="stat-card">
              <div className="stat-icon stat-icon-sales">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Today's Sales</span>
                <div className="stat-value-row">
                  <span className="stat-value">{loading ? '...' : fmt(summary?.todaySalesTotal)}</span>
                  <span className="stat-trend trend-up">↑ 12%</span>
                </div>
                <span className="stat-hint">vs yesterday</span>
              </div>
            </div>
          )}

          {hasPermission('manage_products') && (
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
                <div className="stat-value-row">
                  <span className="stat-value">{loading ? '...' : summary?.totalProducts || 0}</span>
                  <span className="stat-trend trend-neutral">- 0%</span>
                </div>
                <span className="stat-hint">Active catalog</span>
              </div>
            </div>
          )}

          {hasPermission('manage_inventory') && (
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
                <div className="stat-value-row">
                  <span className="stat-value">{loading ? '...' : summary?.lowStockCount || 0}</span>
                  <span className={`stat-trend ${(summary?.lowStockCount > 0) ? 'trend-down' : 'trend-neutral'}`}>
                    {(summary?.lowStockCount > 0) ? '↑ Action needed' : 'All good'}
                  </span>
                </div>
                <span className="stat-hint">Items low on stock</span>
              </div>
            </div>
          )}

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
                <div className="stat-value-row">
                  <span className="stat-value">{loading ? '...' : summary?.theftAlertsCount || 0}</span>
                  <span className={`stat-trend ${(summary?.theftAlertsCount > 0) ? 'trend-down' : 'trend-up'}`}>
                    {(summary?.theftAlertsCount > 0) ? '↑ Investigate' : '↓ 0%'}
                  </span>
                </div>
                <span className="stat-hint">Shrinkage events (30d)</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="dashboard-bento">
          <div className="bento-card col-span-full">
            <div className="bento-header">
              <h3 className="bento-title">Recent Activity</h3>
              <button className="btn btn-secondary btn-sm">View All</button>
            </div>
            <div className="activity-feed">
              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.map(activity => (
                  <div key={activity.id} className="activity-item">
                    <div className={`activity-indicator activity-${activity.status}`}></div>
                    <div className="activity-content">
                      <h4 className="activity-title">{activity.title}</h4>
                      <span className="activity-time">{timeAgo(activity.time)}</span>
                    </div>
                    <div className="activity-amount">{activity.amount}</div>
                  </div>
                ))
              ) : (
                <div className="activity-item" style={{ justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                  No recent activity found.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
