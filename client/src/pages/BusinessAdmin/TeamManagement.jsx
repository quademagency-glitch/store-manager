import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';

export default function TeamManagement() {
  const { hasPermission } = useAuthContext();
  
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
  // Forms
  const [userForm, setUserForm] = useState({ id: null, name: '', email: '', password: '', role_id: '', location_ids: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, locationsRes] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
        api.get('/locations').catch(() => []) 
      ]);
      setUsers(usersRes);
      setRoles(rolesRes);
      setLocations(Array.isArray(locationsRes) ? locationsRes : []);
    } catch (err) {
      setError('Failed to fetch data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openUserModal = (user = null) => {
    if (user) {
      setUserForm({ 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        password: '', 
        role_id: user.role_id, 
        location_ids: user.location_ids || [] 
      });
    } else {
      setUserForm({ 
        id: null, 
        name: '', 
        email: '', 
        password: '', 
        role_id: roles[0]?.id || '', 
        location_ids: [] 
      });
    }
    setIsUserModalOpen(true);
  };

  const handleLocationToggle = (locId) => {
    setUserForm(prev => {
      const isSelected = prev.location_ids.includes(locId);
      if (isSelected) {
        return { ...prev, location_ids: prev.location_ids.filter(id => id !== locId) };
      } else {
        return { ...prev, location_ids: [...prev.location_ids, locId] };
      }
    });
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (userForm.id) {
        await api.put(`/users/${userForm.id}`, { 
          name: userForm.name, 
          role_id: userForm.role_id, 
          location_ids: userForm.location_ids 
        });
      } else {
        await api.post('/users/create', { 
          name: userForm.name, 
          email: userForm.email, 
          password: userForm.password, 
          role_id: userForm.role_id,
          role_name: roles.find(r => r.id === userForm.role_id)?.name || 'Sales Executive',
          location_ids: userForm.location_ids
        });
      }
      setIsUserModalOpen(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save user');
    }
  };

  const toggleUserStatus = async (user) => {
    try {
      const newStatus = user.status === 'banned' ? 'active' : 'banned';
      await api.put(`/users/${user.id}`, { name: user.name, role_id: user.role_id, status: newStatus });
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (window.confirm(`Are you sure you want to permanently delete user "${name}"?`)) {
      try {
        await api.delete(`/users/${id}`);
        fetchData();
      } catch (err) {
        setError(err.message || 'Failed to delete user');
      }
    }
  };

  if (!hasPermission('manage_users')) {
    return <div>Access Denied.</div>;
  }

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Team Management</h1>
          <p className="dashboard-subtitle">Manage staff members and assign roles across your business.</p>
        </div>
      </header>

      {error && <div className="alert alert-error mb-lg"><p>{error}</p></div>}

      <div className="content-card" style={{ padding: '24px' }}>
        {loading ? (
          <div className="text-center py-xl text-muted">Loading data...</div>
        ) : (
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
                    <th>Role & Assigned Branches</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="font-medium">{u.name}</td>
                      <td className="text-muted">{u.email}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span className="badge badge-neutral">{u.roles?.name || 'Unknown'}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {u.location_ids?.length > 0 ? (
                              u.location_ids.map(locId => {
                                const loc = locations.find(l => l.id === locId);
                                return <span key={locId} style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{loc?.name || 'Unknown'}</span>
                              })
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>All Branches (Global)</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.status === 'banned' ? (
                          <span className="badge badge-error">Suspended</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button className="btn-icon" onClick={() => toggleUserStatus(u)} title={u.status === 'banned' ? 'Restore Access' : 'Revoke Access'}>
                          {u.status === 'banned' ? '✅' : '🚫'}
                        </button>
                        <button className="btn-icon" onClick={() => openUserModal(u)} title="Edit">✎</button>
                        <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteUser(u.id, u.name)} title="Delete">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={userForm.id ? 'Edit User' : 'Add New User'}>
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
          <div className="form-group">
            <label>Assigned Branches</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
              {locations.length === 0 ? (
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>No branches available.</span>
              ) : (
                locations.map(l => (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input 
                      type="checkbox" 
                      checked={userForm.location_ids.includes(l.id)} 
                      onChange={() => handleLocationToggle(l.id)} 
                    />
                    {l.name}
                  </label>
                ))
              )}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Assign branches to restrict access. Leave all unchecked for Global access (Admins only).</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save User</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
