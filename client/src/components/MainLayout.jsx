import { useState, useMemo, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

const Icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  products: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 6L10 2L17 6V14L10 18L3 14V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 10V18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 6L10 10L17 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  sales: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 2H4L6 11H16L18 5H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  inventory: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 17H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 21H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  alerts: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L18 17H2L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.75" fill="currentColor" />
    </svg>
  ),
  reconciliation: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 6H16M4 10H16M4 14H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="14" y="12" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M16 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  business: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 21H21M5 21V7L13 3V21M19 21V11L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  locations: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  team: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  billing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10H21" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 14H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  platform: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  invoice: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="10 9 9 9 8 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  signout: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M6.75 15.75H3.75C3.15 15.75 2.25 15.15 2.25 14.25V3.75C2.25 2.85 3.15 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12.75L15.75 9L12 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.75 9H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
};

export default function MainLayout() {
  const { user, role, signOut, hasPermission, locationIds, activeLocationId, switchLocation } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [availableLocations, setAvailableLocations] = useState([]);

  useEffect(() => {
    // Only fetch locations if they have assigned locationIds OR if they are an admin
    if (locationIds.length > 0 || role === 'Platform Admin' || role === 'Business Admin') {
      api.get('/locations').then(res => {
        if (Array.isArray(res)) {
          setAvailableLocations(res);
          // If no active location set and we are an admin, default to first available
          if (!activeLocationId && res.length > 0 && (role === 'Platform Admin' || role === 'Business Admin')) {
            switchLocation(res[0].id);
          }
        }
      }).catch(err => {
        console.error("Failed to load locations for switcher", err);
      });
    }
  }, [locationIds, role, activeLocationId, switchLocation]);

  const handleSignOut = async () => {
    await signOut();
  };

  // Dynamically build navigation groups
  const navGroups = useMemo(() => {
    const groups = [];

    // Core Operational Group
    const coreGroup = {
      title: 'Store Operations',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: Icons.dashboard, visible: true },
        { path: '/products', label: 'Products', icon: Icons.products, visible: true },
        { path: '/sales', label: 'Sales POS', icon: Icons.sales, visible: hasPermission('create_sales') },
        { path: '/invoice', label: 'Invoices', icon: Icons.invoice, visible: hasPermission('create_sales') },
        { path: '/inventory', label: 'Inventory', icon: Icons.inventory, visible: hasPermission('manage_inventory') },
        { path: '/alerts', label: 'Alerts', icon: Icons.alerts, visible: hasPermission('view_analytics') },
        { path: '/reconciliation', label: 'Reconciliation', icon: Icons.reconciliation, visible: hasPermission('view_analytics') },
        { path: '/settings', label: 'Team Settings', icon: Icons.team, visible: hasPermission('manage_users') },
      ].filter(i => i.visible)
    };
    if (coreGroup.items.length > 0) groups.push(coreGroup);

    // Business Administration Group
    const businessGroup = {
      title: 'Business Admin',
      items: [
        { path: '/business-admin', label: 'Overview', icon: Icons.dashboard, visible: hasPermission('manage_business'), exact: true },
        { path: '/business-admin/organization', label: 'Organization', icon: Icons.business, visible: hasPermission('manage_business') },
        { path: '/business-admin/locations', label: 'Locations', icon: Icons.locations, visible: hasPermission('manage_business') },
        { path: '/business-admin/team', label: 'Team & Roles', icon: Icons.team, visible: hasPermission('manage_business') },
        { path: '/business-admin/billing', label: 'Billing', icon: Icons.billing, visible: hasPermission('manage_business') },
      ].filter(i => i.visible)
    };
    if (businessGroup.items.length > 0) groups.push(businessGroup);

    // Platform Admin Group
    const platformGroup = {
      title: 'Platform Admin',
      items: [
        { path: '/platform-admin', label: 'Super Admin', icon: Icons.platform, visible: hasPermission('manage_platform') },
      ].filter(i => i.visible)
    };
    if (platformGroup.items.length > 0) groups.push(platformGroup);

    return groups;
  }, [hasPermission]);

  return (
    <div className="dashboard-page">
      {/* ── Sidebar ── */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="url(#pa-logo-grad)" />
              <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" fillOpacity="0.9" />
              <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" fillOpacity="0.6" />
              <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" fillOpacity="0.6" />
              <defs>
                <linearGradient id="pa-logo-grad" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="sidebar-brand">QERP Store</span>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group, idx) => (
            <div key={idx} className="sidebar-group" style={{ marginBottom: '16px' }}>
              <span className="group-title" style={{ padding: '0 16px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.title}</span>
              <div className="group-nav" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {group.items.map(item => {
                  const isActive = item.exact 
                    ? location.pathname === item.path 
                    : location.pathname.startsWith(item.path);
                    
                  return (
                    <button
                      key={item.path}
                      className={`sidebar-link ${isActive ? 'active' : ''}`}
                      onClick={() => navigate(item.path)}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {availableLocations.length > 1 && (
            <div style={{ padding: '0 16px', marginBottom: '16px' }}>
              <select 
                value={activeLocationId || ''} 
                onChange={(e) => switchLocation(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {availableLocations.map(loc => (
                  <option key={loc.id} value={loc.id} style={{ color: 'black' }}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="sidebar-user-info">
            <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
              {user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.email?.split('@')[0] || 'User'}</span>
              <span className="sidebar-user-role">{role || 'Unknown'}</span>
            </div>
          </div>
          <button className="sidebar-signout" onClick={handleSignOut} id="signout-btn">
             {Icons.signout}
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}
