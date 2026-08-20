import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';
import { useConfirm } from '../hooks/useConfirm';
import { useExportCsv } from '../hooks/useExportCsv';
import { PageHeader } from '../components/ui';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { describePhone, callingCodeFor, resolveCountry } from '../lib/phone';

export default function Customers() {
  const { loading, error, searchCustomers, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { role, hasPermission } = useAuthContext();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // Country supplies the dialing code for numbers typed without one. Already
  // resolved against the active location server-side; the device locale
  // stands in while it loads.
  const { business } = usePrintDocument();
  const country = business?.country || resolveCountry();
  const { exportCsv } = useExportCsv();
  const canEdit = role === 'Business Admin' || role === 'Platform Admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  // One parse per render, reused by the validity check and the echo below.
  const parsedPhone = describePhone(formData.phone, country);

  const [searchTerm, setSearchTerm] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const results = await searchCustomers(searchTerm.trim());
      setSearchResults(results || []);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setHasSearched(false);
    setSearchResults([]);
  };

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
      if (res.success) {
        setSearchResults(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, ...formData } : c));
        setIsModalOpen(false);
      }
    } else {
      const res = await createCustomer(formData);
      if (res.success) {
        if (hasSearched) setSearchResults(prev => [res.customer, ...prev]);
        setIsModalOpen(false);
      }
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Customer', message: 'Are you sure you want to delete this customer?', variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      const res = await deleteCustomer(id);
      if (res.success) setSearchResults(prev => prev.filter(c => c.id !== id));
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Search for a customer or add a new one."
        actions={
            <div className="flex gap-sm">
            <button className="btn btn-secondary" onClick={() => exportCsv(searchResults, [
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'created_at', label: 'Joined', format: (v) => new Date(v).toLocaleDateString() },
            ], 'customers')} disabled={searchResults.length === 0}>
            Export CSV
            </button>
            {hasPermission('manage_financials') && (
            <button className="btn btn-secondary" onClick={() => navigate('/imports/customers')}>
            Import
            </button>
            )}
            {canEdit && (
            <button className="btn btn-primary" onClick={openNewModal}>
            Add Customer
            </button>
            )}
            </div>
        }
      />

      {error && <div className="alert alert-error mb-xl">{error}</div>}

      {/* Search form, customers are found on demand, not browsed wholesale */}
      <div className="glass-panel mt-xl" style={{ padding: '20px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 280px', marginBottom: 0 }}>
            <label>Search by name or phone number</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Jane Doe or 0712345678"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!searchTerm.trim() || searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
          {hasSearched && (
            <button type="button" className="btn btn-outline" onClick={clearSearch}>
              Clear
            </button>
          )}
        </form>
      </div>

      {!hasSearched ? (
        <div className="glass-panel mt-xl" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
          Search for a customer above to view their details.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-panel mt-xl cust-desktop-panel">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Joined Date</th>
                  {canEdit && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {searching ? (
                  <tr>
                    <td colSpan={canEdit ? 4 : 3} className="text-center p-xl">
                      <div className="spinner mx-auto"></div>
                      <p className="mt-sm text-muted">Searching...</p>
                    </td>
                  </tr>
                ) : searchResults.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 4 : 3} className="text-center p-xl text-secondary">
                      No customers found for "{searchTerm}".
                    </td>
                  </tr>
                ) : (
                  searchResults.map(customer => (
                    <tr key={customer.id} className="cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
                      <td className="font-bold">
                        {customer.name}
                        {customer.is_verified && (
                          <span className="badge badge-success ml-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Verified ✓</span>
                        )}
                      </td>
                      <td>{customer.phone}</td>
                      <td className="text-muted">{customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}</td>
                      {canEdit && (
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
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

          {/* Mobile card list, shown on ≤640px */}
          <div className="glass-panel mt-xl cust-mobile-cards">
            {searching ? (
              <div className="text-center p-xl">
                <div className="spinner mx-auto" />
                <p className="mt-sm text-muted">Searching...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center p-xl text-secondary">
                No customers found for "{searchTerm}".
              </div>
            ) : (
              searchResults.map(customer => (
                <div key={customer.id} className="cust-card cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
                  <div className="cust-card-header">
                    <span className="cust-card-name">{customer.name}</span>
                    {customer.is_verified && (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>✓ Verified</span>
                    )}
                  </div>
                  <div className="cust-card-phone">{customer.phone}</div>
                  {customer.created_at && (
                    <div className="cust-card-date">Joined {new Date(customer.created_at).toLocaleDateString()}</div>
                  )}
                  {canEdit && (
                    <div className="cust-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-outline flex-1" onClick={() => openEditModal(customer)}>Edit</button>
                      <button className="btn btn-sm btn-outline text-error flex-1" onClick={() => handleDelete(customer.id)}>Delete</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? "Edit Customer" : "New Customer"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="customer-name">Full Name</label>
            <input
              id="customer-name"
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="customer-phone">Phone Number</label>
            <input
              id="customer-phone"
              type="tel"
              className="input"
              placeholder="024 123 4567"
              inputMode="tel"
              autoComplete="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
            {/* Echoes back the number as understood, so the automatically
                applied country code is never a surprise. */}
            {formData.phone && !parsedPhone ? (
              <small className="text-error">
                Enter a valid number, or include the country code (e.g. +233…)
              </small>
            ) : parsedPhone ? (
              <small className="text-success">
                {parsedPhone.formatted}
                {parsedPhone.network ? ` · ${parsedPhone.network}` : ''}
              </small>
            ) : (
              <small className="text-muted">
                {callingCodeFor(country)
                  ? `${callingCodeFor(country)} applied automatically, or type a country code`
                  : 'Include a country code if not local'}
              </small>
            )}
          </div>
          <div className="modal-actions mt-xl flex justify-end gap-md">
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
