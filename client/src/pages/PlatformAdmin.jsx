import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';

/* ============================================================
   SVG Icon helpers (keep inline for zero-dep approach)
   ============================================================ */
const Icons = {
  overview: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  business: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 21H21M5 21V7L13 3V21M19 21V11L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  roles: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l8 4v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V6l8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  plus: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  edit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  ban: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2"/></svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  back: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
};

/* ============================================================
   PLATFORM ADMIN PAGE
   ============================================================ */
export default function PlatformAdmin() {
  const { user, role, signOut } = useAuthContext();

  // ── Core data ──
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Navigation ──
  const [activeTab, setActiveTab] = useState('overview');

  // ── Search states ──
  const [businessSearchTerm, setBusinessSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // ── Business drill-down ──
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [businessDetails, setBusinessDetails] = useState({ products: [], sales: [], inventory: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  // ── Modals: Business ──
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);

  // ── Modals: User ──
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserBusinessId, setNewUserBusinessId] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // ── Modals: Roles ──
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  // ── Uptime simulation (mock — can be replaced with a real monitoring endpoint) ──
  const [uptimeStats] = useState({
    uptime: 99.97,
    lastDowntime: '2 days ago',
    avgResponseTime: '142ms',
    requestsToday: 1247,
  });

  // All available permissions in the system
  const ALL_PERMISSIONS = [
    'manage_platform', 'manage_business', 'manage_users', 'manage_products',
    'view_sales', 'create_sales', 'manage_sales', 'manage_inventory', 'view_analytics',
  ];

  /* ============================
     DATA FETCHING
     ============================ */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, uRes, rRes] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select(`id, name, email, status, business_id, role_id, businesses ( name ), roles ( name )`).order('created_at', { ascending: false }),
        supabase.from('roles').select('id, name, description, permissions').order('name'),
      ]);
      if (bRes.error) throw bRes.error;
      if (uRes.error) throw uRes.error;
      if (rRes.error) throw rRes.error;

      setBusinesses(bRes.data || []);
      setUsers(uRes.data || []);
      setRoles(rRes.data || []);
    } catch (err) {
      console.error('Error fetching platform data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ============================
     BUSINESS DRILL-DOWN
     ============================ */
  const handleViewBusiness = async (business) => {
    setSelectedBusiness(business);
    setActiveTab('business-detail');
    setDetailsLoading(true);
    try {
      const [pRes, sRes, smRes] = await Promise.all([
        supabase.from('products').select('*').eq('business_id', business.id).order('name'),
        supabase.from('sales').select('*, sale_items(*, products(name))').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_movements').select('*, products(name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
      ]);
      setBusinessDetails({
        products: pRes.data || [],
        sales: sRes.data || [],
        inventory: smRes.data || [],
      });
    } catch (err) {
      console.error('Error fetching business details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleBackFromDetail = () => {
    setSelectedBusiness(null);
    setActiveTab('businesses');
  };

  /* ============================
     BUSINESS CRUD
     ============================ */
  const handleCreateBusiness = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data: businessData, error: businessError } = await supabase
        .from('businesses').insert([{ name: newBusinessName }]).select().single();
      if (businessError) throw businessError;

      if (adminEmail && adminPassword) {
        await api.post('/users/create', {
          email: adminEmail, password: adminPassword, name: 'Business Admin',
          business_id: businessData.id, role_name: 'Business Admin',
        });
        alert(`Business "${newBusinessName}" and admin account created successfully!`);
      } else {
        alert(`Business "${newBusinessName}" created successfully!`);
      }
      setShowAddBusinessModal(false);
      setNewBusinessName(''); setAdminEmail(''); setAdminPassword('');
      fetchData();
    } catch (err) {
      console.error('Error creating business:', err);
      setError(err.message);
    }
  };

  const openEditBusiness = (business) => { setEditingBusiness({ ...business }); setShowEditBusinessModal(true); };

  const handleUpdateBusiness = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('businesses').update({ name: editingBusiness.name }).eq('id', editingBusiness.id);
      if (error) throw error;
      setShowEditBusinessModal(false); setEditingBusiness(null); fetchData();
    } catch (err) { alert(`Error updating business: ${err.message}`); }
  };

  const handleToggleBusinessBan = async (business) => {
    const newStatus = business.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${business.name}? Users in a banned business cannot access the system.`)) return;
    try {
      const { error } = await supabase.from('businesses').update({ status: newStatus }).eq('id', business.id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error updating status: ${err.message}`); }
  };

  const handleDeleteBusiness = async (id, name) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete "${name}"? This will delete all associated products and sales! This action cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error deleting business: ${err.message}`); }
  };

  /* ============================
     USER CRUD
     ============================ */
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const roleName = roles.find(r => r.id === newUserRoleId)?.name || 'Salesperson';
      await api.post('/users/create', {
        email: newUserEmail, password: newUserPassword, name: newUserName,
        business_id: newUserBusinessId || null, role_name: roleName,
      });
      alert(`User ${newUserEmail} created successfully!`);
      setShowAddUserModal(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserBusinessId(''); setNewUserRoleId('');
      fetchData();
    } catch (err) { console.error('Error creating user:', err); alert(`Failed to create user: ${err.message}`); }
  };

  const openEditUser = (u) => { setEditingUser({ ...u }); setShowEditUserModal(true); };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('users').update({ name: editingUser.name, role_id: editingUser.role_id, business_id: editingUser.business_id }).eq('id', editingUser.id);
      if (error) throw error;
      setShowEditUserModal(false); setEditingUser(null); fetchData();
    } catch (err) { alert(`Error updating user: ${err.message}`); }
  };

  const handleToggleUserBan = async (u) => {
    const newStatus = u.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${u.email}? A banned user cannot access any data.`)) return;
    try {
      const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', u.id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error updating status: ${err.message}`); }
  };

  const handleDeleteUser = async (id, email) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete user "${email}"? They will lose all access.`)) return;
    try { await api.delete(`/users/${id}`); fetchData(); }
    catch (err) { alert(`Error deleting user: ${err.message}`); }
  };

  /* ============================
     ROLE CRUD
     ============================ */
  const handleCreateRole = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { error } = await supabase.from('roles').insert([{
        name: newRoleName, description: newRoleDescription, permissions: newRolePermissions,
      }]);
      if (error) throw error;
      alert(`Role "${newRoleName}" created successfully!`);
      setShowAddRoleModal(false);
      setNewRoleName(''); setNewRoleDescription(''); setNewRolePermissions([]);
      fetchData();
    } catch (err) { alert(`Error creating role: ${err.message}`); }
  };

  const openEditRole = (r) => {
    setEditingRole({ ...r, permissions: [...(r.permissions || [])] });
    setShowEditRoleModal(true);
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('roles').update({
        name: editingRole.name, description: editingRole.description, permissions: editingRole.permissions,
      }).eq('id', editingRole.id);
      if (error) throw error;
      setShowEditRoleModal(false); setEditingRole(null); fetchData();
    } catch (err) { alert(`Error updating role: ${err.message}`); }
  };

  const handleDeleteRole = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete role "${name}"? Users with this role may lose access.`)) return;
    try {
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error deleting role: ${err.message}`); }
  };

  const togglePermission = (perm, list, setter) => {
    setter(list.includes(perm) ? list.filter(p => p !== perm) : [...list, perm]);
  };

  /* ============================
     COMPUTED / MEMOS
     ============================ */
  const filteredBusinesses = useMemo(() => {
    if (!businessSearchTerm) return businesses;
    const lower = businessSearchTerm.toLowerCase();
    return businesses.filter(b => b.name.toLowerCase().includes(lower) || b.id.toLowerCase().includes(lower));
  }, [businesses, businessSearchTerm]);

  const filteredUsers = useMemo(() => {
    if (!userSearchTerm) return users;
    const lower = userSearchTerm.toLowerCase();
    return users.filter(u =>
      (u.name && u.name.toLowerCase().includes(lower)) ||
      (u.email && u.email.toLowerCase().includes(lower)) ||
      (u.roles?.name && u.roles.name.toLowerCase().includes(lower)) ||
      (u.businesses?.name && u.businesses.name.toLowerCase().includes(lower))
    );
  }, [users, userSearchTerm]);

  const activeBusinesses = useMemo(() => businesses.filter(b => b.status !== 'banned' && b.name !== 'Pending Assignment'), [businesses]);
  const activeUsers = useMemo(() => users.filter(u => u.status !== 'banned'), [users]);
  const businessAdmins = useMemo(() => users.filter(u => u.roles?.name === 'Business Admin'), [users]);
  const recentBusinesses = useMemo(() => {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return businesses.filter(b => b.name !== 'Pending Assignment' && new Date(b.created_at) >= sevenDaysAgo);
  }, [businesses]);

  const handleSignOut = async () => { await signOut(); };

  /* ============================
     SIDEBAR NAV ITEMS
     ============================ */
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Icons.overview },
    { id: 'businesses', label: 'Businesses', icon: Icons.business },
    { id: 'users', label: 'Users', icon: Icons.users },
    { id: 'roles', label: 'Roles', icon: Icons.roles },
  ];

  /* ============================
     LOADING STATE
     ============================ */
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
      </div>
    );
  }

  /* ============================
     RENDER
     ============================ */
  return (
    <>
      {error && (
          <div className="alert alert-error mb-xl">
            <p>{error}</p>
          </div>
        )}

        {/* ═══════════════════════════════════
            TAB: OVERVIEW
            ═══════════════════════════════════ */}
        {activeTab === 'overview' && (
          <>
            <header className="page-header">
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
        )}

        {/* ═══════════════════════════════════
            TAB: BUSINESSES
            ═══════════════════════════════════ */}
        {activeTab === 'businesses' && (
          <>
            <header className="page-header">
              <div>
                <h1 className="dashboard-title">Businesses</h1>
                <p className="dashboard-subtitle">Manage all registered tenants on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddBusinessModal(true)}>
                {Icons.plus} New Business
              </button>
            </header>

            <div className="content-card">
              <div className="toolbar">
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tenants ({filteredBusinesses.filter(b => b.name !== 'Pending Assignment').length})</h2>
                <div className="search-bar">
                  {Icons.search}
                  <input type="text" placeholder="Search businesses..." value={businessSearchTerm} onChange={(e) => setBusinessSearchTerm(e.target.value)} className="search-input" />
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Business Name</th>
                      <th>Users</th>
                      <th>Status</th>
                      <th>Created Date</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBusinesses.filter(b => b.name !== 'Pending Assignment').map(b => {
                      const userCount = users.filter(u => u.business_id === b.id).length;
                      return (
                        <tr key={b.id} className={b.status === 'banned' ? 'row-warning' : ''}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: b.status === 'banned' ? 0.6 : 1 }}>
                              <div className="product-avatar" style={{ background: b.status === 'banned' ? '#666' : 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))' }}>
                                {b.name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500 }}>{b.name}</span>
                            </div>
                          </td>
                          <td><span className="badge badge-neutral">{userCount}</span></td>
                          <td>
                            {b.status === 'banned' ? (
                              <span className="badge badge-warning">Banned</span>
                            ) : (
                              <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                          <td className="text-right">
                            <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                              <button className="btn-icon" onClick={() => handleViewBusiness(b)} title="View Details">
                                {Icons.eye}
                              </button>
                              <button className="btn-icon" onClick={() => openEditBusiness(b)} title="Edit">
                                {Icons.edit}
                              </button>
                              <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleBusinessBan(b)} title={b.status === 'banned' ? 'Unban' : 'Ban'}>
                                {Icons.ban}
                              </button>
                              <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteBusiness(b.id, b.name)} title="Delete">
                                {Icons.trash}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredBusinesses.filter(b => b.name !== 'Pending Assignment').length === 0 && (
                      <tr><td colSpan="5" className="text-center py-xl text-muted">No businesses found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: BUSINESS DETAIL (DRILL-DOWN)
            ═══════════════════════════════════ */}
        {activeTab === 'business-detail' && selectedBusiness && (
          <>
            <header className="page-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={handleBackFromDetail}>
                  {Icons.back} Back
                </button>
                <div>
                  <h1 className="dashboard-title">{selectedBusiness.name}</h1>
                  <p className="dashboard-subtitle">
                    Business details — Products, Sales & Inventory
                  </p>
                </div>
              </div>
              <div>
                {selectedBusiness.status === 'banned' ? (
                  <span className="badge badge-warning">Banned</span>
                ) : (
                  <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                )}
              </div>
            </header>

            {detailsLoading ? (
              <div className="table-loading">
                <div className="spinner"></div>
                <span>Loading business data…</span>
              </div>
            ) : (
              <div className="pa-detail-sections">
                {/* Quick Stats */}
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="stat-card">
                    <div className="stat-icon stat-icon-products">{Icons.business}</div>
                    <div className="stat-details">
                      <span className="stat-label">Products</span>
                      <span className="stat-value">{businessDetails.products.length}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon stat-icon-sales">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="stat-details">
                      <span className="stat-label">Total Sales</span>
                      <span className="stat-value">{businessDetails.sales.length}</span>
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
                      <span className="stat-label">Stock Movements</span>
                      <span className="stat-value">{businessDetails.inventory.length}</span>
                    </div>
                  </div>
                </div>

                {/* Products Table */}
                <div className="content-card mb-xl">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Products Catalog</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Product</th><th>Price</th><th>Stock</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.products.slice(0, 20).map(p => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td>${Number(p.price || 0).toFixed(2)}</td>
                            <td>
                              <span className={`stock-count ${(p.stock_qty ?? 0) <= (p.low_stock_threshold ?? 5) ? 'text-warning' : ''}`}>
                                {p.stock_qty ?? 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {businessDetails.products.length === 0 && (
                          <tr><td colSpan="3" className="text-center py-xl text-muted">No products.</td></tr>
                        )}
                        {businessDetails.products.length > 20 && (
                          <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '0.75rem' }}>…and {businessDetails.products.length - 20} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Sales Table */}
                <div className="content-card mb-xl">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Recent Sales</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Sale ID</th><th>Total</th><th>Items</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.sales.slice(0, 20).map(s => (
                          <tr key={s.id}>
                            <td className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{s.id.substring(0, 8)}…</td>
                            <td style={{ fontWeight: 600, color: '#4ade80' }}>${Number(s.total_amount || 0).toFixed(2)}</td>
                            <td>{s.sale_items?.length || 0}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(s.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                        {businessDetails.sales.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-xl text-muted">No sales recorded.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stock Movements Table */}
                <div className="content-card">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Stock Movements</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Product</th><th>Type</th><th>Qty</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.inventory.slice(0, 20).map(m => (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 500 }}>{m.products?.name || '—'}</td>
                            <td>
                              <span className={`badge ${m.movement_type === 'restock' ? 'badge-neutral' : 'badge-warning'}`} style={m.movement_type === 'restock' ? { color: '#4ade80', borderColor: '#4ade80' } : {}}>
                                {m.movement_type}
                              </span>
                            </td>
                            <td>{m.quantity}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(m.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                        {businessDetails.inventory.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-xl text-muted">No stock movements.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: USERS
            ═══════════════════════════════════ */}
        {activeTab === 'users' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">System Users</h1>
                <p className="dashboard-subtitle">Manage all users across every business on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddUserModal(true)}>
                {Icons.plus} New User
              </button>
            </header>

            <div className="content-card">
              <div className="toolbar">
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>All Users ({filteredUsers.length})</h2>
                <div className="search-bar">
                  {Icons.search}
                  <input type="text" placeholder="Search users..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} className="search-input" />
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Assigned Business</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} style={{ opacity: u.status === 'banned' ? 0.6 : 1 }}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500 }}>{u.name || 'Unnamed User'}</span>
                            <span style={{ fontSize: '0.85em', color: 'var(--color-text-tertiary)' }}>{u.email}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-neutral">{u.businesses?.name || 'Unassigned'}</span></td>
                        <td>
                          <span className={`role-badge ${
                            u.roles?.name === 'Platform Admin' ? 'role-badge-manager' :
                            u.roles?.name === 'Business Admin' ? 'role-badge-salesperson' : ''
                          }`} style={!u.roles?.name ? { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' } : {}}>
                            {u.roles?.name || 'Pending Role'}
                          </span>
                        </td>
                        <td>
                          {u.status === 'banned' ? (
                            <span className="badge badge-warning">Banned</span>
                          ) : (
                            <span className="text-muted text-sm">Active</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn-icon" onClick={() => openEditUser(u)} title="Edit">{Icons.edit}</button>
                            <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleUserBan(u)} title={u.status === 'banned' ? 'Unban' : 'Ban'}>{Icons.ban}</button>
                            <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteUser(u.id, u.email)} title="Delete">{Icons.trash}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-xl text-muted">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: ROLES
            ═══════════════════════════════════ */}
        {activeTab === 'roles' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Roles & Permissions</h1>
                <p className="dashboard-subtitle">Define roles and control what each role can do on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddRoleModal(true)}>
                {Icons.plus} New Role
              </button>
            </header>

            <div className="pa-roles-grid">
              {roles.map(r => {
                const usersWithRole = users.filter(u => u.role_id === r.id).length;
                return (
                  <div key={r.id} className="pa-role-card">
                    <div className="pa-role-card-header">
                      <div>
                        <h3 className="pa-role-name">{r.name}</h3>
                        <p className="pa-role-desc">{r.description || 'No description'}</p>
                      </div>
                      <span className="badge badge-neutral">{usersWithRole} user{usersWithRole !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="pa-role-permissions">
                      {(r.permissions || []).map(p => (
                        <span key={p} className="pa-perm-tag">{p.replace(/_/g, ' ')}</span>
                      ))}
                      {(!r.permissions || r.permissions.length === 0) && (
                        <span className="text-muted text-sm">No permissions assigned</span>
                      )}
                    </div>
                    <div className="pa-role-card-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditRole(r)}>
                        {Icons.edit} Edit
                      </button>
                      <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeleteRole(r.id, r.name)}>
                        {Icons.trash} Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {roles.length === 0 && (
                <div className="text-center py-xl text-muted">No roles defined yet.</div>
              )}
            </div>
          </>
        )}

      {/* ═══════════════════════════════════
          MODALS
          ═══════════════════════════════════ */}

      {/* Add Business Modal */}
      {showAddBusinessModal && (
        <Modal isOpen={showAddBusinessModal} onClose={() => setShowAddBusinessModal(false)} title="Register New Tenant">
          <form onSubmit={handleCreateBusiness} className="form-layout">
            <div className="form-group">
              <label>Business Name *</label>
              <input type="text" className="form-input" value={newBusinessName} onChange={(e) => setNewBusinessName(e.target.value)} required />
            </div>
            <hr style={{ border: '1px solid var(--color-border)', margin: '1rem 0' }} />
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Initial Admin Login</h3>
            <div className="form-group">
              <label>Admin Email</label>
              <input type="email" className="form-input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Leave blank to skip" />
            </div>
            {adminEmail && (
              <div className="form-group">
                <label>Admin Password *</label>
                <input type="password" className="form-input" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddBusinessModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Tenant</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Business Modal */}
      {showEditBusinessModal && editingBusiness && (
        <Modal isOpen={showEditBusinessModal} onClose={() => setShowEditBusinessModal(false)} title="Edit Business">
          <form onSubmit={handleUpdateBusiness} className="form-layout">
            <div className="form-group">
              <label>Business Name *</label>
              <input type="text" className="form-input" value={editingBusiness.name} onChange={(e) => setEditingBusiness({...editingBusiness, name: e.target.value})} required />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditBusinessModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <Modal isOpen={showAddUserModal} onClose={() => setShowAddUserModal(false)} title="Create User">
          <form onSubmit={handleCreateUser} className="form-layout">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" className="form-input" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input type="email" className="form-input" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input type="password" className="form-input" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select className="form-input" value={newUserBusinessId} onChange={(e) => setNewUserBusinessId(e.target.value)} required>
                  <option value="" disabled>Select a Business</option>
                  {businesses.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select className="form-input" value={newUserRoleId} onChange={(e) => setNewUserRoleId(e.target.value)} required>
                  <option value="" disabled>Select a Role</option>
                  {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddUserModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create User</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <Modal isOpen={showEditUserModal} onClose={() => setShowEditUserModal(false)} title="Edit User">
          <form onSubmit={handleUpdateUser} className="form-layout">
            <div className="form-group">
              <label>Name</label>
              <input type="text" className="form-input" value={editingUser.name || ''} onChange={(e) => setEditingUser({...editingUser, name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Email (Read Only)</label>
              <input type="text" className="form-input" value={editingUser.email} disabled />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select className="form-input" value={editingUser.business_id || ''} onChange={(e) => setEditingUser({...editingUser, business_id: e.target.value})}>
                  <option value="">Unassigned / Pending</option>
                  {businesses.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select className="form-input" value={editingUser.role_id || ''} onChange={(e) => setEditingUser({...editingUser, role_id: e.target.value})}>
                  <option value="">Pending Role</option>
                  {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditUserModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <Modal isOpen={showAddRoleModal} onClose={() => setShowAddRoleModal(false)} title="Create New Role">
          <form onSubmit={handleCreateRole} className="form-layout">
            <div className="form-group">
              <label>Role Name *</label>
              <input type="text" className="form-input" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required placeholder="e.g. Warehouse Staff" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" className="form-input" value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} placeholder="Brief description of this role" />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="pa-perm-grid">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="pa-perm-checkbox">
                    <input type="checkbox" checked={newRolePermissions.includes(p)} onChange={() => togglePermission(p, newRolePermissions, setNewRolePermissions)} />
                    <span className="pa-perm-checkbox-label">{p.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddRoleModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Role</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Role Modal */}
      {showEditRoleModal && editingRole && (
        <Modal isOpen={showEditRoleModal} onClose={() => setShowEditRoleModal(false)} title={`Edit Role: ${editingRole.name}`}>
          <form onSubmit={handleUpdateRole} className="form-layout">
            <div className="form-group">
              <label>Role Name *</label>
              <input type="text" className="form-input" value={editingRole.name} onChange={(e) => setEditingRole({...editingRole, name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" className="form-input" value={editingRole.description || ''} onChange={(e) => setEditingRole({...editingRole, description: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="pa-perm-grid">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="pa-perm-checkbox">
                    <input type="checkbox" checked={(editingRole.permissions || []).includes(p)} onChange={() => {
                      const perms = editingRole.permissions || [];
                      setEditingRole({
                        ...editingRole,
                        permissions: perms.includes(p) ? perms.filter(x => x !== p) : [...perms, p],
                      });
                    }} />
                    <span className="pa-perm-checkbox-label">{p.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditRoleModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
