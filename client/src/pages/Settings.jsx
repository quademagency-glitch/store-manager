import { useState, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const AVAILABLE_PERMISSIONS = [
  { id: 'manage_users', label: 'Manage Users & Roles' },
  { id: 'manage_products', label: 'Manage Products' },
  { id: 'view_sales', label: 'View Sales' },
  { id: 'create_sales', label: 'Create Sales' },
  { id: 'manage_sales', label: 'Manage Sales (Void/Discount)' },
  { id: 'manage_inventory', label: 'Manage Inventory (Adjustments)' },
  { id: 'view_analytics', label: 'View Analytics & Alerts' },
];

export default function Settings() {
  const { hasPermission } = useAuthContext();
  const [activeTab, setActiveTab] = useState('users');

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  
  // Forms
  const [userForm, setUserForm] = useState({ id: null, name: '', email: '', password: '', role_id: '' });
  const [roleForm, setRoleForm] = useState({ id: null, name: '', description: '', permissions: [] });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/roles')
      ]);
      setUsers(usersRes);
      setRoles(rolesRes);
    } catch (err) {
      setError('Failed to fetch data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- Users Handlers ---
  const openUserModal = (user = null) => {
    if (user) {
      setUserForm({ id: user.id, name: user.name, email: user.email, password: '', role_id: user.role_id });
    } else {
      setUserForm({ id: null, name: '', email: '', password: '', role_id: roles[0]?.id || '' });
    }
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (userForm.id) {
        await api.put(`/api/users/${userForm.id}`, { name: userForm.name, role_id: userForm.role_id });
      } else {
        await api.post('/api/auth/register', { 
          name: userForm.name, 
          email: userForm.email, 
          password: userForm.password, 
          role_id: userForm.role_id 
        });
      }
      setIsUserModalOpen(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.delete(`/api/users/${id}`);
        fetchData();
      } catch (err) {
        setError(err.message || 'Failed to delete user');
      }
    }
  };

  // --- Roles Handlers ---
  const openRoleModal = (role = null) => {
    if (role) {
      setRoleForm({ id: role.id, name: role.name, description: role.description || '', permissions: role.permissions || [] });
    } else {
      setRoleForm({ id: null, name: '', description: '', permissions: [] });
    }
    setIsRoleModalOpen(true);
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (roleForm.id) {
        await api.put(`/api/roles/${roleForm.id}`, { 
          name: roleForm.name, 
          description: roleForm.description, 
          permissions: roleForm.permissions 
        });
      } else {
        await api.post('/api/roles', { 
          name: roleForm.name, 
          description: roleForm.description, 
          permissions: roleForm.permissions 
        });
      }
      setIsRoleModalOpen(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save role');
    }
  };

  const handleDeleteRole = async (id) => {
    if (window.confirm('Are you sure you want to delete this role?')) {
      try {
        await api.delete(`/api/roles/${id}`);
        fetchData();
      } catch (err) {
        setError(err.message || 'Failed to delete role');
      }
    }
  };

  const togglePermission = (permId) => {
    setRoleForm(prev => {
      const perms = prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId];
      return { ...prev, permissions: perms };
    });
  };

  if (!hasPermission('manage_users')) {
    return <div className="page-container">Access Denied.</div>;
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings & Access Control</h1>
          <p className="page-subtitle">Manage users, custom roles, and permissions.</p>
        </div>
      </header>

      {error && <div className="alert alert-error mb-lg"><p>{error}</p></div>}

      <div className="content-card" style={{ padding: '0' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'users' ? 'white' : 'transparent', border: 'none', borderBottom: activeTab === 'users' ? '2px solid #6366f1' : '2px solid transparent', fontWeight: activeTab === 'users' ? '600' : '500', color: activeTab === 'users' ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: '16px' }}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'roles' ? 'white' : 'transparent', border: 'none', borderBottom: activeTab === 'roles' ? '2px solid #6366f1' : '2px solid transparent', fontWeight: activeTab === 'roles' ? '600' : '500', color: activeTab === 'roles' ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: '16px' }}
            onClick={() => setActiveTab('roles')}
          >
            Roles & Permissions
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {loading ? (
            <div className="text-center py-xl text-muted">Loading data...</div>
          ) : activeTab === 'users' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600' }}>System Users</h3>
                <button className="btn btn-primary" onClick={() => openUserModal()}>+ Add User</button>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="font-medium">{u.name}</td>
                        <td className="text-muted">{u.email}</td>
                        <td>
                          <span className="badge badge-neutral">{u.roles?.name || 'Unknown'}</span>
                        </td>
                        <td className="text-right">
                          <button className="btn-icon" onClick={() => openUserModal(u)}>✎</button>
                          <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteUser(u.id)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Custom Roles</h3>
                <button className="btn btn-primary" onClick={() => openRoleModal()}>+ Add Role</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {roles.map(r => (
                  <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>{r.name}</h4>
                      <div>
                        <button className="btn-icon" onClick={() => openRoleModal(r)}>✎</button>
                        <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteRole(r.id)}>🗑</button>
                      </div>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>{r.description || 'No description'}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {r.permissions.map(p => {
                        const permLabel = AVAILABLE_PERMISSIONS.find(ap => ap.id === p)?.label || p;
                        return <span key={p} className="badge" style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '12px', border: 'none' }}>{permLabel}</span>
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={userForm.id ? 'Edit User Role' : 'Add New User'}>
        <form onSubmit={handleUserSubmit} className="form-layout">
          <div className="form-group">
            <label>Name</label>
            <input type="text" required className="form-input" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} />
          </div>
          {!userForm.id && (
            <>
              <div className="form-group">
                <label>Email</label>
                <input type="email" required className="form-input" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" required minLength="6" className="form-input" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
              </div>
            </>
          )}
          <div className="form-group">
            <label>Role</label>
            <select required className="form-input" value={userForm.role_id} onChange={e => setUserForm({...userForm, role_id: e.target.value})}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save User</button>
          </div>
        </form>
      </Modal>

      {/* Role Modal */}
      <Modal isOpen={isRoleModalOpen} onClose={() => setIsRoleModalOpen(false)} title={roleForm.id ? 'Edit Role' : 'Add New Role'}>
        <form onSubmit={handleRoleSubmit} className="form-layout">
          <div className="form-group">
            <label>Role Name</label>
            <input type="text" required className="form-input" value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input type="text" className="form-input" value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Permissions</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {AVAILABLE_PERMISSIONS.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={roleForm.permissions.includes(p.id)}
                    onChange={() => togglePermission(p.id)}
                    style={{ width: '16px', height: '16px', accentColor: '#6366f1' }}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsRoleModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Role</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
