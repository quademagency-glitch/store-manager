import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function BusinessesTab() {
  const {
    filteredBusinesses, businessSearchTerm, setBusinessSearchTerm, setShowAddBusinessModal,
    handleViewBusiness, openEditBusiness, handleToggleBusinessBan, handleDeleteBusiness,
    users,
  } = usePlatformAdmin();

  return (
    <>
      <header className="dashboard-header">
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
                          {(b.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{b.name || 'Unnamed Business'}</span>
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
  );
}
