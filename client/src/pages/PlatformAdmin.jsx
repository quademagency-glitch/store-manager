import { useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { PlatformAdminProvider, usePlatformAdmin } from '../features/platformAdmin/PlatformAdminContext';
import { Icons } from '../features/platformAdmin/Icons';

// Tabs
import OverviewTab from '../features/platformAdmin/components/OverviewTab';
import BusinessesTab from '../features/platformAdmin/components/BusinessesTab';
import BusinessDetailTab from '../features/platformAdmin/components/BusinessDetailTab';
import UsersTab from '../features/platformAdmin/components/UsersTab';
import RolesTab from '../features/platformAdmin/components/RolesTab';
import PricingTab from '../features/platformAdmin/components/PricingTab';
import BillingTab from '../features/platformAdmin/components/BillingTab';
import PlatformAdminModals from '../features/platformAdmin/components/PlatformAdminModals';

function PlatformAdminShell() {
  const { hasPermission } = useAuthContext();
  const { activeTab, setActiveTab, loading, error, fetchData } = usePlatformAdmin();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Validate access
  if (!hasPermission('manage_platform')) {
    return (
      <div className="page-header">
        <h1 className="page-title text-error">Access Denied</h1>
        <p className="page-subtitle">You do not have permission to view Platform Admin.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error" style={{ margin: '2rem' }}>{error}</div>;
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Icons.overview },
    { id: 'businesses', label: 'Businesses', icon: Icons.business },
    { id: 'users', label: 'Users', icon: Icons.users },
    { id: 'roles', label: 'Roles', icon: Icons.roles },
    { id: 'pricing', label: 'Pricing Plans', icon: Icons.pricing },
    { id: 'billing', label: 'Billing & Invoices', icon: Icons.billing },
  ];

  return (
    <div className="platform-admin-layout">
      {/* ── SIDEBAR ── */}
      <div className="pa-sidebar">
        <div className="pa-sidebar-header">
          <h2>Platform Admin</h2>
        </div>
        <nav className="pa-sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-link${(activeTab === item.id || (activeTab === 'business-detail' && item.id === 'businesses')) ? ' active' : ''}`}
              onClick={() => {
                if (item.id === 'businesses' && activeTab === 'business-detail') {
                  setActiveTab('businesses');
                } else {
                  setActiveTab(item.id);
                }
              }}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="pa-main-content">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'businesses' && <BusinessesTab />}
        {activeTab === 'business-detail' && <BusinessDetailTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'pricing' && <PricingTab />}
        {activeTab === 'billing' && <BillingTab />}
        
        <PlatformAdminModals />
      </div>
    </div>
  );
}

export default function PlatformAdmin() {
  return (
    <PlatformAdminProvider>
      <PlatformAdminShell />
    </PlatformAdminProvider>
  );
}
