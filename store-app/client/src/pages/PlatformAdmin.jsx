import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { PlatformAdminProvider, usePlatformAdmin } from '../features/platformAdmin/PlatformAdminContext';
import { Icons } from '../components/icons/Icons';

// Tabs
import OverviewTab from '../features/platformAdmin/components/OverviewTab';
import BusinessesTab from '../features/platformAdmin/components/BusinessesTab';
import BusinessDetailTab from '../features/platformAdmin/components/BusinessDetailTab';
import UsersTab from '../features/platformAdmin/components/UsersTab';
import RolesTab from '../features/platformAdmin/components/RolesTab';
import PricingTab from '../features/platformAdmin/components/PricingTab';
import BillingTab from '../features/platformAdmin/components/BillingTab';
import ProfileTab from '../features/platformAdmin/components/ProfileTab';
import CommunicationsTab from '../features/platformAdmin/components/CommunicationsTab';
import PlatformAdminModals from '../features/platformAdmin/components/PlatformAdminModals';

function PlatformAdminShell() {
  const navigate = useNavigate();
  const { hasPermission, signOut } = useAuthContext();
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
    { id: 'comms', label: 'Marketing & Comms', icon: Icons.marketing },
    { id: 'profile', label: 'Settings', icon: Icons.settings },
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
        <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
          <button 
            className="sidebar-link" 
            style={{ color: '#f87171' }}
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <span className="sidebar-icon" style={{ color: '#f87171' }}>{Icons.logout}</span>
            Sign Out
          </button>
        </div>
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
        {activeTab === 'comms' && <CommunicationsTab />}
        {activeTab === 'profile' && <ProfileTab />}
        
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
