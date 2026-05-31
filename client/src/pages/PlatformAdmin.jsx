import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';

export default function PlatformAdmin() {
  const { user } = useAuthContext();
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search states
  const [businessSearchTerm, setBusinessSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Modals state
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserBusinessId, setNewUserBusinessId] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');

  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch businesses
      const { data: bData, error: bError } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });
      if (bError) throw bError;
      setBusinesses(bData || []);

      // Fetch users
      const { data: uData, error: uError } = await supabase
        .from('users')
        .select(`
          id,
          name,
          email,
          status,
          business_id,
          role_id,
          businesses ( name ),
          roles ( name )
        `)
        .order('created_at', { ascending: false });
      if (uError) throw uError;
      setUsers(uData || []);

      // Fetch roles
      const { data: rData, error: rError } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');
      if (rError) throw rError;
      setRoles(rData || []);

    } catch (err) {
      console.error('Error fetching platform data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ============================
     BUSINESS ACTIONS
     ============================ */
  const handleCreateBusiness = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      // 1. Create Business
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .insert([{ name: newBusinessName }])
        .select()
        .single();
      if (businessError) throw businessError;

      // 2. Create Admin User if email and password are provided
      if (adminEmail && adminPassword) {
        await api.post('/users/create', {
          email: adminEmail,
          password: adminPassword,
          name: 'Business Admin',
          business_id: businessData.id,
          role_name: 'Business Admin'
        });
        alert(`Business "${newBusinessName}" and admin account created successfully!`);
      } else {
        alert(`Business "${newBusinessName}" created successfully!`);
      }

      setShowAddBusinessModal(false);
      setNewBusinessName('');
      setAdminEmail('');
      setAdminPassword('');
      fetchData();
    } catch (err) {
      console.error('Error creating business:', err);
      setError(err.message);
    }
  };

  const openEditBusiness = (business) => {
    setEditingBusiness({ ...business });
    setShowEditBusinessModal(true);
  };

  const handleUpdateBusiness = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ name: editingBusiness.name })
        .eq('id', editingBusiness.id);
      if (error) throw error;
      setShowEditBusinessModal(false);
      setEditingBusiness(null);
      fetchData();
    } catch (err) {
      alert(`Error updating business: ${err.message}`);
    }
  };

  const handleToggleBusinessBan = async (business) => {
    const newStatus = business.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${business.name}? Users in a banned business cannot access the system.`)) return;

    try {
      const { error } = await supabase
        .from('businesses')
        .update({ status: newStatus })
        .eq('id', business.id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleDeleteBusiness = async (id, name) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete "${name}"? This will delete all associated products and sales! This action cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(`Error deleting business: ${err.message}`);
    }
  };

  /* ============================
     USER ACTIONS
     ============================ */
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const roleName = roles.find(r => r.id === newUserRoleId)?.name || 'Salesperson';
      
      await api.post('/users/create', {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
        business_id: newUserBusinessId || null,
        role_name: roleName
      });
      
      alert(`User ${newUserEmail} created successfully!`);
      setShowAddUserModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserBusinessId('');
      setNewUserRoleId('');
      fetchData();
    } catch (err) {
      console.error('Error creating user:', err);
      alert(`Failed to create user: ${err.message}`);
    }
  };

  const openEditUser = (u) => {
    setEditingUser({ ...u });
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          name: editingUser.name,
          role_id: editingUser.role_id,
          business_id: editingUser.business_id
        })
        .eq('id', editingUser.id);
      if (error) throw error;
      setShowEditUserModal(false);
      setEditingUser(null);
      fetchData();
    } catch (err) {
      alert(`Error updating user: ${err.message}`);
    }
  };

  const handleToggleUserBan = async (u) => {
    const newStatus = u.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${u.email}? A banned user cannot access any data.`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', u.id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleDeleteUser = async (id, email) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete user "${email}"? They will lose all access.`)) return;
    try {
      // Use API to delete from auth.users (which cascades to public.users)
      await api.delete(`/users/${id}`);
      fetchData();
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    }
  };


  /* ============================
     RENDER
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

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Platform Administration</h1>
          <p className="page-subtitle">Global oversight of all businesses and system users.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddBusinessModal(true)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Business
        </button>
      </header>

      {error && (
        <div className="alert alert-error mb-xl">
          <p>{error}</p>
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-products">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 21H21M5 21V7L13 3V21M19 21V11L13 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="stat-details">
            <span className="stat-label">Active Businesses</span>
            <span className="stat-value">{businesses.filter(b => b.status !== 'banned').length}</span>
            <span className="stat-hint">Registered tenants on platform</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-sales">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="stat-details">
            <span className="stat-label">Active Users</span>
            <span className="stat-value">{users.filter(u => u.status !== 'banned').length}</span>
            <span className="stat-hint">Across all business accounts</span>
          </div>
        </div>
      </div>

      {/* Businesses Table */}
      <div className="content-card mb-xl">
        <div className="toolbar">
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tenants (Businesses)</h2>
          <div className="search-bar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input 
              type="text" 
              placeholder="Search businesses..." 
              value={businessSearchTerm}
              onChange={(e) => setBusinessSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Status</th>
                <th>Created Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((b) => (
                <tr key={b.id} className={b.status === 'banned' ? 'row-warning' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: b.status === 'banned' ? 0.6 : 1 }}>
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
                      <span className="badge badge-neutral" style={{color: '#4ade80', borderColor: '#4ade80'}}>Active</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="text-right">
                    <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn-icon" onClick={() => openEditBusiness(b)} title="Edit">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleBusinessBan(b)} title={b.status === 'banned' ? 'Unban' : 'Ban'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2"/></svg>
                      </button>
                      <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteBusiness(b.id, b.name)} title="Delete">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBusinesses.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-xl text-muted">No businesses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users Table */}
      <div className="content-card">
        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>System Users</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddUserModal(true)}>
              + Add User
            </button>
          </div>
          <div className="search-bar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input 
              type="text" 
              placeholder="Search users..." 
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="search-input"
            />
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
                  <td>
                    <span className="badge badge-neutral">
                      {u.businesses?.name || 'Unassigned'}
                    </span>
                  </td>
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
                      <button className="btn-icon" onClick={() => openEditUser(u)} title="Edit">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleUserBan(u)} title={u.status === 'banned' ? 'Unban' : 'Ban'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2"/></svg>
                      </button>
                      <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteUser(u.id, u.email)} title="Delete">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-xl text-muted">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Business Modal */}
      {showAddBusinessModal && (
        <Modal isOpen={showAddBusinessModal} onClose={() => setShowAddBusinessModal(false)} title="Register New Tenant">
          <form onSubmit={handleCreateBusiness} className="form-layout">
            <div className="form-group">
              <label>Business Name *</label>
              <input
                type="text"
                className="form-input"
                value={newBusinessName}
                onChange={(e) => setNewBusinessName(e.target.value)}
                required
              />
            </div>
            <hr style={{ border: '1px solid var(--color-border)', margin: '1rem 0' }} />
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Initial Admin Login</h3>
            <div className="form-group">
              <label>Admin Email</label>
              <input
                type="email"
                className="form-input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Leave blank to skip"
              />
            </div>
            {adminEmail && (
              <div className="form-group">
                <label>Admin Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                />
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
              <input
                type="text"
                className="form-input"
                value={editingBusiness.name}
                onChange={(e) => setEditingBusiness({...editingBusiness, name: e.target.value})}
                required
              />
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
              <input
                type="text"
                className="form-input"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  className="form-input"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select 
                  className="form-input"
                  value={newUserBusinessId}
                  onChange={(e) => setNewUserBusinessId(e.target.value)}
                  required
                >
                  <option value="" disabled>Select a Business</option>
                  {businesses.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select 
                  className="form-input"
                  value={newUserRoleId}
                  onChange={(e) => setNewUserRoleId(e.target.value)}
                  required
                >
                  <option value="" disabled>Select a Role</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
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
              <input
                type="text"
                className="form-input"
                value={editingUser.name || ''}
                onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Email (Read Only)</label>
              <input type="text" className="form-input" value={editingUser.email} disabled />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select 
                  className="form-input"
                  value={editingUser.business_id || ''}
                  onChange={(e) => setEditingUser({...editingUser, business_id: e.target.value})}
                >
                  <option value="">Unassigned / Pending</option>
                  {businesses.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select 
                  className="form-input"
                  value={editingUser.role_id || ''}
                  onChange={(e) => setEditingUser({...editingUser, role_id: e.target.value})}
                >
                  <option value="">Pending Role</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
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
    </div>
  );
}
