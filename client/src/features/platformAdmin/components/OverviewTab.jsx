import React from 'react';
import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function OverviewTab() {
  const { 
    user, activeBusinesses, activeUsers, businessAdmins, recentBusinesses, uptimeStats, businesses, handleViewBusiness 
  } = usePlatformAdmin();

  const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Platform Overview</h1>
          <p className="dashboard-subtitle">
            Welcome back, <strong>{user?.email?.split('@')[0] || 'Admin'}</strong> — here's how the platform is performing.
          </p>
        </div>
        <div className="dashboard-role-badge">
          <span className="role-badge" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.05))', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            Platform Admin
          </span>
        </div>
      </header>

      <div className="dashboard-content">
        {/* ── Stats Cards ── */}
        <div className="stats-grid pa-stats-grid">
          <div className="stat-card pa-stat-card">
            <div className="stat-icon stat-icon-products">
              {Icons.business}
            </div>
            <div className="stat-details">
              <span className="stat-label">Active Businesses</span>
              <span className="stat-value">{activeBusinesses.length}</span>
              <span className="stat-hint">Registered tenants</span>
            </div>
          </div>

          <div className="stat-card pa-stat-card">
            <div className="stat-icon stat-icon-sales">
              {Icons.users}
            </div>
            <div className="stat-details">
              <span className="stat-label">Total Users</span>
              <span className="stat-value">{activeUsers.length}</span>
              <span className="stat-hint">Across all businesses</span>
            </div>
          </div>

          <div className="stat-card pa-stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', color: '#fbbf24' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">Business Admins</span>
              <span className="stat-value">{businessAdmins.length}</span>
              <span className="stat-hint">Registered administrators</span>
            </div>
          </div>

          <div className="stat-card pa-stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))', color: '#a78bfa' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">New This Week</span>
              <span className="stat-value">{recentBusinesses.length}</span>
              <span className="stat-hint">Recently onboarded</span>
            </div>
          </div>
        </div>

        {/* ── System Health Panel ── */}
        <div className="pa-health-section">
          <h2 className="pa-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            System Health & Usage
          </h2>
          <div className="pa-health-grid">
            <div className="pa-health-card">
              <div className="pa-health-indicator pa-health-good"></div>
              <div className="pa-health-info">
                <span className="pa-health-label">Uptime</span>
                <span className="pa-health-value">{uptimeStats.uptime}%</span>
              </div>
              <span className="pa-health-badge pa-health-badge-good">Operational</span>
            </div>
            <div className="pa-health-card">
              <div className="pa-health-indicator pa-health-neutral"></div>
              <div className="pa-health-info">
                <span className="pa-health-label">Last Downtime</span>
                <span className="pa-health-value">{uptimeStats.lastDowntime}</span>
              </div>
            </div>
            <div className="pa-health-card">
              <div className="pa-health-indicator pa-health-good"></div>
              <div className="pa-health-info">
                <span className="pa-health-label">Avg Response</span>
                <span className="pa-health-value">{uptimeStats.avgResponseTime}</span>
              </div>
            </div>
            <div className="pa-health-card">
              <div className="pa-health-indicator pa-health-good"></div>
              <div className="pa-health-info">
                <span className="pa-health-label">Requests Today</span>
                <span className="pa-health-value">{uptimeStats.requestsToday.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Recent Activity ── */}
        <div className="pa-activity-section">
          <h2 className="pa-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Recent Businesses
          </h2>
          <div className="content-card">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.filter(b => b.name !== 'Pending Assignment').slice(0, 5).map(b => (
                    <tr key={b.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="product-avatar" style={{ background: b.status === 'banned' ? '#666' : 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))' }}>
                            {b.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 500 }}>{b.name}</span>
                        </div>
                      </td>
                      <td>
                        {b.status === 'banned' ? (
                          <span className="badge badge-warning">Banned</span>
                        ) : (
                          <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td className="text-right">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleViewBusiness(b)}>
                          {Icons.eye} View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {businesses.filter(b => b.name !== 'Pending Assignment').length === 0 && (
                    <tr><td colSpan="4" className="text-center py-xl text-muted">No businesses registered yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
