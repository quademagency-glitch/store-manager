import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuthContext } from '../../lib/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

import PermissionTree from '../../components/PermissionTree';
import { PageHeader, PageState, EmptyStateRow, SkeletonTable } from '../../components/ui';


export default function RolesManagement() {
  const { user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await api.get('/roles');
      setRoles(data);
      setError(null);
    } catch (err) {
      // Previously swallowed with a DEV-only console.error, so a failed
      // fetch was indistinguishable from a business genuinely having no
      // custom roles: the user got bare column headers and no explanation.
      if (import.meta.env.DEV) console.error('Error fetching roles:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);  

  const handleEdit = (role) => {
    if (role.business_id === null && user.role !== 'Platform Admin') {
      // It's a generic role, create a clone for editing
      setEditingRole({
        ...role,
        id: null, // Force new creation
        name: `${role.name} (Custom)`,
        business_id: user.business_id
      });
    } else {
      setEditingRole(role);
    }
    setShowModal(true);
  };

  const handleCreate = () => {
    setEditingRole({ name: '', description: '', permissions: [] });
    setShowModal(true);
  };

  const handlePermissionsChange = (newPermissions) => {
    if (!editingRole) return;
    setEditingRole({ ...editingRole, permissions: newPermissions });
  };


  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingRole.id) {
        await api.put(`/roles/${editingRole.id}`, editingRole);
      } else {
        await api.post('/roles', editingRole);
      }
      setShowModal(false);
      fetchRoles();
    } catch (err) {
      toast.error(err.message || 'Failed to save role');
    }
  };

  const handleDelete = async (roleId) => {
    const confirmed = await confirm({ title: 'Delete Role', message: 'Are you sure you want to delete this role? Any users assigned to it will need to be reassigned.', variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      try {
        await api.delete(`/roles/${roleId}`);
        fetchRoles();
      } catch (err) {
        toast.error(err.message || 'Failed to delete role');
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage custom roles and access levels for your team."
        actions={
          <button className="btn btn-primary" onClick={handleCreate}>
            + Create Custom Role
          </button>
        }
      />

      <PageState
        loading={loading}
        error={error}
        onRetry={fetchRoles}
        skeleton={<div className="glass-panel"><SkeletonTable rows={4} cols={5} /></div>}
      >
      <div className="glass-panel">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 && (
              <EmptyStateRow
                colSpan={5}
                icon="roles"
                title="No roles yet"
                hint="Create a custom role to control what your team can see and do."
              />
            )}
            {roles.map(role => (
              <tr key={role.id}>
                <td className="font-bold">{role.name}</td>
                <td className="text-muted">{role.description || '-'}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {role.permissions.map(p => (
                      <span key={p} className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {p.replace('manage_', 'm:').replace('view_', 'v:').replace('create_', 'c:')}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {role.business_id ? (
                    <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>Custom</span>
                  ) : (
                    <span className="badge badge-neutral">Platform Default</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm btn-outline mr-sm" onClick={() => handleEdit(role)}>
                    {role.business_id === null && user.role !== 'Platform Admin' ? 'Clone & Edit' : 'Edit'}
                  </button>
                  {(role.business_id || user.role === 'Platform Admin') && (
                    <button className="btn btn-sm btn-outline text-error" onClick={() => handleDelete(role.id)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </PageState>

      {showModal && editingRole && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>
              {editingRole.id ? 'Edit Role' : 'Create Custom Role'}
            </h2>
            
            {editingRole.business_id === null && user.role !== 'Platform Admin' && (
              <div className="alert alert-warning mb-lg" style={{ fontSize: '0.875rem' }}>
                You are cloning a Platform Default role. A new custom role will be created for your business.
              </div>
            )}

            <form onSubmit={handleSave} className="form-layout">
              <div className="form-group">
                <label>Role Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingRole.name} 
                  onChange={(e) => setEditingRole({...editingRole, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingRole.description || ''} 
                  onChange={(e) => setEditingRole({...editingRole, description: e.target.value})}
                />
              </div>

              <div className="form-group mt-md">
                <PermissionTree 
                  selectedPermissions={editingRole.permissions} 
                  onChange={handlePermissionsChange} 
                />
              </div>

              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
