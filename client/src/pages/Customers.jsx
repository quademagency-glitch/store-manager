import { useState, useEffect } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';
import { useConfirm } from '../hooks/useConfirm';

export default function Customers() {
  const { customers, loading, error, fetchCustomers, createCustomer, updateCustomer, deleteCustomer, page, totalPages, totalCustomers } = useCustomers();
  const { role } = useAuthContext();
  const confirm = useConfirm();
  const canEdit = role === 'Business Admin' || role === 'Platform Admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });

  useEffect(() => {
    fetchCustomers(page);
  }, [fetchCustomers, page]);

  const openNewModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setFormData({ name: customer.name, phone: customer.phone });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingCustomer) {
      const res = await updateCustomer(editingCustomer.id, formData);
      if (res.success) setIsModalOpen(false);
    } else {
      const res = await createCustomer(formData);
      if (res.success) setIsModalOpen(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Customer', message: 'Are you sure you want to delete this customer?', variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      await deleteCustomer(id);
    }
  };

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-title">Customers</h1>
          <p className="dashboard-subtitle">Manage your customer directory.</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNewModal}>
            Add Customer
          </button>
        )}
      </header>

      {error && <div className="alert alert-error mb-xl">{error}</div>}

      {/* Desktop table */}
      <div className="glass-panel mt-xl cust-desktop-panel">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Joined Date</th>
              {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 4 : 3} style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner mx-auto"></div>
                  <p className="mt-sm text-muted">Loading customers...</p>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 4 : 3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map(customer => (
                <tr key={customer.id}>
                  <td style={{ fontWeight: 600 }}>
                    {customer.name}
                    {customer.is_verified && (
                      <span className="badge badge-success ml-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Verified ✓</span>
                    )}
                  </td>
                  <td>{customer.phone}</td>
                  <td className="text-muted">{new Date(customer.created_at).toLocaleDateString()}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-outline mr-sm" onClick={() => openEditModal(customer)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-outline text-error" onClick={() => handleDelete(customer.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="text-sm text-muted">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, totalCustomers)} of {totalCustomers}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchCustomers(Math.max(1, page - 1))} disabled={page === 1}>Previous</button>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchCustomers(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile card list — shown on ≤640px */}
      <div className="glass-panel mt-xl cust-mobile-cards">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner mx-auto" />
            <p className="mt-sm text-muted">Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
            No customers found.
          </div>
        ) : (
          customers.map(customer => (
            <div key={customer.id} className="cust-card">
              <div className="cust-card-header">
                <span className="cust-card-name">{customer.name}</span>
                {customer.is_verified && (
                  <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>✓ Verified</span>
                )}
              </div>
              <div className="cust-card-phone">{customer.phone}</div>
              <div className="cust-card-date">Joined {new Date(customer.created_at).toLocaleDateString()}</div>
              {canEdit && (
                <div className="cust-card-actions">
                  <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => openEditModal(customer)}>Edit</button>
                  <button className="btn btn-sm btn-outline text-error" style={{ flex: 1 }} onClick={() => handleDelete(customer.id)}>Delete</button>
                </div>
              )}
            </div>
          ))
        )}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="text-sm text-muted">Page {page} of {totalPages}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchCustomers(Math.max(1, page - 1))} disabled={page === 1}>Prev</button>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchCustomers(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? "Edit Customer" : "New Customer"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              className="input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>
          <div className="modal-actions mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
