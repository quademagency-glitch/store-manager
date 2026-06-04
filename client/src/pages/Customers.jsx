import { useState, useEffect } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';

export default function Customers() {
  const { customers, loading, error, fetchCustomers, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { role } = useAuthContext();
  const canEdit = role === 'Business Admin' || role === 'Platform Admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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
    if (window.confirm('Are you sure you want to delete this customer?')) {
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

      <div className="glass-panel mt-xl">
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
                  <td style={{ fontWeight: 600 }}>{customer.name}</td>
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
