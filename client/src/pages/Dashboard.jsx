import { useEffect, useState } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, role, signOut, hasPermission } = useAuthContext();
  const { summary, loading, fetchSummary } = useAnalytics();
  
  // Mock recent activity data
  const [recentActivity, setRecentActivity] = useState([
    { id: 1, type: 'sale', title: 'New Sale Completed', time: '10 mins ago', amount: '$129.99', status: 'success' },
    { id: 2, type: 'stock', title: 'Low Stock Alert: iPhone 15 Pro', time: '1 hour ago', amount: '2 left', status: 'warning' },
    { id: 3, type: 'sale', title: 'New Sale Completed', time: '3 hours ago', amount: '$45.00', status: 'success' },
    { id: 4, type: 'alert', title: 'Suspicious Void Detected', time: 'Yesterday', amount: '-$20.00', status: 'error' },
  ]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

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
          <Link to="/sales" className="action-btn">
            <div className="action-icon action-icon-primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <span>New Sale</span>
          </Link>
          <Link to="/products" className="action-btn">
            <div className="action-icon action-icon-secondary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <span>Add Product</span>
          </Link>
          <Link to="/inventory" className="action-btn">
            <div className="action-icon action-icon-warning">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 8L12 4L20 8V16L12 20L4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 12V20" stroke="currentColor" strokeWidth="2" /><path d="M4 8L12 12L20 8" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <span>Check Stock</span>
          </Link>
          {hasPermission('view_analytics') && (
            <Link to="/reconciliation" className="action-btn">
              <div className="action-icon action-icon-info">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 17H21M5 21H19M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <span>View Reports</span>
            </Link>
          )}
        </div>

        {/* Enhanced Stats Grid */}
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
              <div className="stat-value-row">
                <span className="stat-value">{loading ? '...' : fmt(summary?.todaySalesTotal)}</span>
                <span className="stat-trend trend-up">↑ 12%</span>
              </div>
              <span className="stat-hint">vs yesterday</span>
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
              <div className="stat-value-row">
                <span className="stat-value">{loading ? '...' : summary?.totalProducts || 0}</span>
                <span className="stat-trend trend-neutral">- 0%</span>
              </div>
              <span className="stat-hint">Active catalog</span>
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
              <div className="stat-value-row">
                <span className="stat-value">{loading ? '...' : summary?.lowStockCount || 0}</span>
                <span className={`stat-trend ${(summary?.lowStockCount > 0) ? 'trend-down' : 'trend-neutral'}`}>
                  {(summary?.lowStockCount > 0) ? '↑ Action needed' : 'All good'}
                </span>
              </div>
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
              {recentActivity.map(activity => (
                <div key={activity.id} className="activity-item">
                  <div className={`activity-indicator activity-${activity.status}`}></div>
                  <div className="activity-content">
                    <h4 className="activity-title">{activity.title}</h4>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                  <div className="activity-amount">{activity.amount}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
