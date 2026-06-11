import React from 'react';
import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function UsersTab() {
  const { 
    filteredUsers, userSearchTerm, setUserSearchTerm, setShowAddUserModal, handleEditUser, handleBanUser, handleUnbanUser 
  } = usePlatformAdmin();

  const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  return (
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
  );
}
