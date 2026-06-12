import { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';

const INITIAL_FORM = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  payment_terms: 'Net 30',
  lead_time_days: '7',
  notes: ''
};

export default function SupplierModal({ isOpen, onClose, onSubmit, editingSupplier, isSubmitting, error }) {
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    if (editingSupplier) {
      setForm({
        name: editingSupplier.name || '',
        contact_person: editingSupplier.contact_person || '',
        phone: editingSupplier.phone || '',
        email: editingSupplier.email || '',
        address: editingSupplier.address || '',
        payment_terms: editingSupplier.payment_terms || 'Net 30',
        lead_time_days: String(editingSupplier.lead_time_days ?? '7'),
        notes: editingSupplier.notes || ''
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [editingSupplier, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'} size="medium">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label">Supplier Name *</label>
          <input
            type="text"
            name="name"
            className="form-input"
            value={form.name}
            onChange={handleChange}
            required
            placeholder="e.g. Acme Distributors"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label">Contact Person</label>
            <input
              type="text"
              name="contact_person"
              className="form-input"
              value={form.contact_person}
              onChange={handleChange}
              placeholder="Full name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              name="phone"
              className="form-input"
              value={form.phone}
              onChange={handleChange}
              placeholder="+233 XX XXX XXXX"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label">Email</label>
          <input
            type="email"
            name="email"
            className="form-input"
            value={form.email}
            onChange={handleChange}
            placeholder="supplier@example.com"
          />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label">Address</label>
          <textarea
            name="address"
            className="form-input"
            value={form.address}
            onChange={handleChange}
            rows={2}
            placeholder="Street, City, Region"
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label">Payment Terms</label>
            <select name="payment_terms" className="form-input" value={form.payment_terms} onChange={handleChange}>
              <option value="COD">Cash on Delivery</option>
              <option value="Net 7">Net 7</option>
              <option value="Net 14">Net 14</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 60">Net 60</option>
              <option value="Net 90">Net 90</option>
              <option value="Prepaid">Prepaid</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Lead Time (days)</label>
            <input
              type="number"
              name="lead_time_days"
              className="form-input"
              value={form.lead_time_days}
              onChange={handleChange}
              min="0"
              max="365"
              placeholder="7"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label">Notes</label>
          <textarea
            name="notes"
            className="form-input"
            value={form.notes}
            onChange={handleChange}
            rows={2}
            placeholder="Additional notes about this supplier..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || !form.name.trim()}>
            {isSubmitting ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Add Supplier')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
