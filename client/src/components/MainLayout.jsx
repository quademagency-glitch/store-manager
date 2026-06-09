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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  // Collapsible sidebar sections
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (sectionTitle) => {
    setCollapsedSections(prev => ({ ...prev, [sectionTitle]: !prev[sectionTitle] }));
  };

  // Dynamically build navigation groups — organized by ERP module
  const navGroups = useMemo(() => {
    const groups = [];

    // ─── Overview ───
    groups.push({
      title: null, // No header for top-level
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: Icons.dashboard, visible: true },
      ].filter(i => i.visible)
    });

    // ─── Store Operations ───
    const storeOps = {
      title: 'Store Operations',
      icon: Icons.products,
      items: [
        { path: '/sales', label: 'Sales POS', icon: Icons.sales, visible: hasPermission('create_sales') },
        { path: '/inventory', label: 'Inventory', icon: Icons.inventory, visible: true },
        { path: '/alerts', label: 'Alerts', icon: Icons.alerts, visible: hasPermission('view_analytics') },
      ].filter(i => i.visible)
    };
    if (storeOps.items.length > 0) groups.push(storeOps);

    // ─── Accounting & Finance ───
    const accounting = {
      title: 'Accounting',
      icon: Icons.billing,
      items: [
        { path: '/invoice', label: 'Invoices', icon: Icons.invoice, visible: hasPermission('create_sales') },
        { path: '/reconciliation', label: 'Reconciliation', icon: Icons.reconciliation, visible: hasPermission('view_analytics') },
      ].filter(i => i.visible)
    };
    if (accounting.items.length > 0) groups.push(accounting);

    // ─── CRM ───
    const crm = {
      title: 'CRM',
      icon: Icons.team,
      items: [
        { path: '/customers', label: 'Customers', icon: Icons.team, visible: hasPermission('create_sales') },
      ].filter(i => i.visible)
    };
    if (crm.items.length > 0) groups.push(crm);

    // ─── HR & Team ───
    const hr = {
      title: 'HR & Team',
      icon: Icons.team,
      items: [
        { path: '/settings', label: 'Team & Roles', icon: Icons.team, visible: hasPermission('manage_users') },
      ].filter(i => i.visible)
    };
    if (hr.items.length > 0) groups.push(hr);

    // ─── Business Administration ───
    const businessGroup = {
      title: 'Administration',
      icon: Icons.settings,
      items: [
        { path: '/business-admin', label: 'Overview', icon: Icons.dashboard, visible: hasPermission('manage_business'), exact: true },
        { path: '/business-admin/organization', label: 'Organization', icon: Icons.business, visible: hasPermission('manage_business') },
        { path: '/business-admin/locations', label: 'Locations', icon: Icons.locations, visible: hasPermission('manage_business') },
        { path: '/business-admin/team', label: 'Team', icon: Icons.team, visible: hasPermission('manage_business') },
        { path: '/business-admin/billing', label: 'Billing', icon: Icons.billing, visible: hasPermission('manage_business') },
      ].filter(i => i.visible)
    };
    if (businessGroup.items.length > 0) groups.push(businessGroup);

    // ─── Platform Admin ───
    const platformGroup = {
      title: 'Platform',
      icon: Icons.platform,
      items: [
        { path: '/platform-admin', label: 'Super Admin', icon: Icons.platform, visible: hasPermission('manage_platform') },
      ].filter(i => i.visible)
    };
    if (platformGroup.items.length > 0) groups.push(platformGroup);

    return groups;
  }, [hasPermission]);

  const isAdminView = role && !role.toLowerCase().includes('sales');

  if (isAdminView) {
    return (
      <div className="admin-dashboard-page">
        <header className="top-navbar">
          <div className="top-nav-left">
            <button 
              className="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div className="top-nav-logo">
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
              <span className="top-nav-brand" style={{marginLeft: '12px'}}>QERP Store</span>
            </div>

            <nav className="top-nav-menu">
              {navGroups.map((group, idx) => {
                const hasActiveItem = group.items.some(item => 
                  item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
                );

                if (!group.title) {
                  return group.items.map(item => {
                    const isActive = item.exact 
                      ? location.pathname === item.path 
                      : location.pathname.startsWith(item.path);
                    return (
                      <button
                        key={item.path}
                        className={`top-nav-button ${isActive ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  });
                }

                return (
                  <div key={idx} className={`top-nav-group ${hasActiveItem ? 'has-active' : ''}`}>
                    <button className="top-nav-button">
                      {group.icon}
                      {group.title}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <div className="top-nav-dropdown">
                      {group.items.map(item => {
                        const isActive = item.exact 
                          ? location.pathname === item.path 
                          : location.pathname.startsWith(item.path);
                        return (
                          <button
                            key={item.path}
                            className={`dropdown-link ${isActive ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                          >
                            {item.icon}
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="top-nav-right">
            {availableLocations.length > 1 && (
              <select 
                value={activeLocationId || ''} 
                onChange={(e) => switchLocation(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {availableLocations.map(loc => (
                  <option key={loc.id} value={loc.id} style={{ color: 'black' }}>{loc.name}</option>
                ))}
              </select>
            )}
            
            <div className="user-profile" onClick={handleSignOut} title="Sign Out">
              <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                {user?.email?.charAt(0)?.toUpperCase() || '?'}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        <div 
          className={`mobile-drawer-overlay ${isMobileMenuOpen ? 'open' : ''}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <aside className={`mobile-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
          <div className="mobile-drawer-header">
            <div className="top-nav-logo">
              <span className="top-nav-brand">QERP Store</span>
            </div>
            <button className="mobile-drawer-close" onClick={() => setIsMobileMenuOpen(false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <nav className="mobile-drawer-nav sidebar-nav">
             {navGroups.map((group, idx) => {
              const isCollapsed = group.title ? collapsedSections[group.title] : false;
              const hasActiveItem = group.items.some(item => 
                item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
              );

              return (
                <div key={idx} className={`sidebar-group ${!group.title ? 'sidebar-group--ungrouped' : ''}`}>
                  {group.title && (
                    <button 
                      className={`sidebar-group-header ${hasActiveItem ? 'has-active' : ''}`}
                      onClick={() => toggleSection(group.title)}
                    >
                      <span className="sidebar-group-label">
                        <span className="sidebar-group-icon">{group.icon}</span>
                        {group.title}
                      </span>
                      <svg 
                        className={`sidebar-group-chevron ${isCollapsed ? '' : 'open'}`}
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                      >
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className="sidebar-group-items">
                      {group.items.map(item => {
                        const isActive = item.exact 
                          ? location.pathname === item.path 
                          : location.pathname.startsWith(item.path);
                          
                        return (
                          <button
                            key={item.path}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              navigate(item.path);
                              setIsMobileMenuOpen(false);
                            }}
                          >
                            {item.icon}
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mobile-drawer-footer" style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 'auto' }}>
            {availableLocations.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <select 
                  value={activeLocationId || ''} 
                  onChange={(e) => {
                    switchLocation(e.target.value);
                    setIsMobileMenuOpen(false);
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {availableLocations.map(loc => (
                    <option key={loc.id} value={loc.id} style={{ color: 'black' }}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button 
              className="sidebar-signout" 
              onClick={() => {
                handleSignOut();
                setIsMobileMenuOpen(false);
              }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6.75 15.75H3.75C3.15 15.75 2.25 15.15 2.25 14.25V3.75C2.25 2.85 3.15 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 12.75L15.75 9L12 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15.75 9H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        <main className="admin-main-content dashboard-main">
          <Outlet />
        </main>
      </div>
    );
  }

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
          {navGroups.map((group, idx) => {
            const isCollapsed = group.title ? collapsedSections[group.title] : false;
            const hasActiveItem = group.items.some(item => 
              item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
            );

            return (
              <div key={idx} className={`sidebar-group ${!group.title ? 'sidebar-group--ungrouped' : ''}`}>
                {group.title && (
                  <button 
                    className={`sidebar-group-header ${hasActiveItem ? 'has-active' : ''}`}
                    onClick={() => toggleSection(group.title)}
                  >
                    <span className="sidebar-group-label">
                      <span className="sidebar-group-icon">{group.icon}</span>
                      {group.title}
                    </span>
                    <svg 
                      className={`sidebar-group-chevron ${isCollapsed ? '' : 'open'}`}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                    >
                      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="sidebar-group-items">
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
                )}
              </div>
            );
          })}
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
