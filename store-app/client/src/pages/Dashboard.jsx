import { useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user, role, hasPermission } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
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
    const confirmed = await confirm({ title: 'Reset Dashboard', message: 'WARNING: This will PERMANENTLY delete all sales, stock movements, and alerts for this business/location. Inventory levels will NOT be reset. Are you absolutely sure you want to wipe the dashboard data?', variant: 'danger', confirmText: 'Reset Data' });
    if (confirmed) {
      try {
        const res = await api.delete('/analytics/reset');
        if (res.message) {
          toast.success('Dashboard has been reset.');
          fetchSummary();
          fetchRecentActivity();
        }
      } catch (err) {
        toast.error(err.message || 'Failed to reset dashboard');
      }
    }
  };

  const todayTxCount = summary?.todayTransactionCount ?? null;

  return (
    <>
      {/* Dynamic Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="banner-content">
          <h1 className="banner-title">
            {getGreeting()}, <span className="highlight-text">{user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}</span>! 👋
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
        </div>

        {/* Enhanced Stats Grid */}
        <div className="stats-grid">
          {hasPermission('view_sales') && (
            <Link to="/sales-record" className="stat-card" aria-label="View today's sales records">
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
                  {!loading && todayTxCount !== null && (
                    <span className="stat-trend trend-neutral">{todayTxCount} tx</span>
                  )}
                </div>
                <span className="stat-hint">Today's transactions</span>
              </div>
            </Link>
          )}

          {hasPermission('manage_products') && (
            <Link to="/products" className="stat-card" aria-label="View product catalog">
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
                  <span className="stat-trend trend-neutral">Active catalog</span>
                </div>
                <span className="stat-hint">Listed in inventory</span>
              </div>
            </Link>
          )}

          {hasPermission('manage_inventory') && (
            <Link to="/inventory" className="stat-card" aria-label="View stock and low-stock alerts">
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
            </Link>
          )}

          {hasPermission('view_analytics') && (
            <Link to="/alerts" className="stat-card" aria-label="View loss prevention and theft alerts">
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
                    {(summary?.theftAlertsCount > 0) ? '↑ Investigate' : 'All clear'}
                  </span>
                </div>
                <span className="stat-hint">Shrinkage events (30d)</span>
              </div>
            </Link>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="dashboard-bento">
          <div className="bento-card col-span-full">
            <div className="bento-header">
              <h3 className="bento-title">Recent Activity</h3>
              <Link to="/sales-record" className="btn btn-secondary btn-sm">View All</Link>
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

        {/* Danger Zone — admin only */}
        {(role === 'Business Admin' || role === 'Manager') && (
          <div style={{
            marginTop: 'var(--space-2xl)',
            padding: 'var(--space-lg) var(--space-xl)',
            border: '1px solid var(--color-error-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-error-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-lg)',
          }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-error)', fontSize: '0.9rem', marginBottom: '2px' }}>Danger Zone</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.825rem' }}>
                Permanently wipe all sales, stock movements, and alerts for this location. This cannot be undone.
              </div>
            </div>
            <button
              onClick={handleResetDashboard}
              style={{
                flexShrink: 0,
                padding: '0.5rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-error)',
                background: 'transparent',
                color: 'var(--color-error)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Reset Dashboard
            </button>
          </div>
        )}

      </div>
    </>
  );
}
