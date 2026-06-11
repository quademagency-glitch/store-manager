import React from 'react';
import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function RolesTab() {
  const { 
    roles, setShowAddRoleModal, handleEditRole, handleDeleteRole 
  } = usePlatformAdmin();

  const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  return (
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
  );
}
