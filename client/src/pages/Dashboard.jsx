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
    <div className="dashboard-page">
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="url(#sidebar-logo-gradient)" />
              <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" fillOpacity="0.9" />
              <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" fillOpacity="0.6" />
              <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" fillOpacity="0.6" />
              <defs>
                <linearGradient id="sidebar-logo-gradient" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="sidebar-brand">Store Manager</span>
        </div>

        <nav className="sidebar-nav">
          <a href="/dashboard" className="sidebar-link active" id="nav-dashboard">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Dashboard
          </a>
          {/* Placeholder nav items for future build orders */}
          <a href="/products" className="sidebar-link" id="nav-products">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6L10 2L17 6V14L10 18L3 14V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M10 10V18" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 6L10 10L17 6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Products
          </a>
          <a href="/sales" className="sidebar-link" id="nav-sales">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="8" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="15" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 2H4L6 11H16L18 5H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sales
          </a>
          <a href="/inventory" className="sidebar-link" id="nav-inventory">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 17H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M5 21H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Inventory
          </a>
          {hasPermission('view_analytics') && (
            <>
              <a href="/alerts" className="sidebar-link" id="nav-alerts">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L18 17H2L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M10 8V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="14" r="0.75" fill="currentColor" />
                </svg>
                Alerts
              </a>
              <a href="/reconciliation" className="sidebar-link" id="nav-reconciliation">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 6H16M4 10H16M4 14H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="14" y="12" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M16 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Reconciliation
              </a>
            </>
          )}
          {hasPermission('manage_users') && (
            <a href="/settings" className="sidebar-link" id="nav-settings">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17.4 11.2a6.9 6.9 0 000-2.4l-1.9-.3a4.9 4.9 0 00-.7-1.7l1.3-1.4-1.7-1.7-1.4 1.3a4.9 4.9 0 00-1.7-.7l-.3-1.9H8.6l-.3 1.9a4.9 4.9 0 00-1.7.7L5.2 3.6 3.5 5.3l1.3 1.4a4.9 4.9 0 00-.7 1.7l-1.9.3v2.4l1.9.3c.2.6.4 1.2.7 1.7l-1.3 1.4 1.7 1.7 1.4-1.3c.5.3 1.1.5 1.7.7l.3 1.9h2.4l.3-1.9a4.9 4.9 0 001.7-.7l1.4 1.3 1.7-1.7-1.3-1.4c.3-.5.5-1.1.7-1.7l1.9-.3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Settings
            </a>
          )}
          {hasPermission('manage_platform') && (
            <a href="/platform-admin" className="sidebar-link" id="nav-platform">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l8 4v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V6l8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Platform Admin
            </a>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.email?.split('@')[0] || 'User'}</span>
              <span className="sidebar-user-role">{role || 'Unknown'}</span>
            </div>
          </div>
          <button className="sidebar-signout" onClick={handleSignOut} id="signout-btn">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M6.75 15.75H3.75C3.15 15.75 2.25 15.15 2.25 14.25V3.75C2.25 2.85 3.15 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 12.75L15.75 9L12 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15.75 9H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        <header className="dashboard-header">
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
      </main>
    </div>
  );
}
