import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Icons } from '../../components/icons/Icons';

export default function Locations() {
  const { user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', address: '', tax_rate: 0, receipt_header: '' });

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/locations');
      setLocations(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations, user?.id]);

  const openModal = (loc = null) => {
    if (loc) {
      setFormData({ ...loc });
    } else {
      setFormData({ id: null, name: '', address: '', tax_rate: 0, receipt_header: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await api.put(`/locations/${formData.id}`, {
          name: formData.name,
          address: formData.address,
          tax_rate: formData.tax_rate,
          receipt_header: formData.receipt_header
        });
      } else {
        await api.post('/locations', {
          name: formData.name,
          address: formData.address,
          tax_rate: formData.tax_rate,
          receipt_header: formData.receipt_header
        });
      }
      setIsModalOpen(false);
      fetchLocations();
    } catch (err) {
      toast.error("Error saving location: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Location', message: 'Are you sure you want to delete this location? Ensure no sales or users are actively tied to it.', variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      try {
        await api.delete(`/locations/${id}`);
        fetchLocations();
      } catch (err) {
        toast.error("Error deleting location: " + err.message);
      }
    }
  };

  if (loading) return <div className="p-xl text-center">Loading locations...</div>;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Locations & Branches</h1>
          <p className="dashboard-subtitle">Manage physical stores or branches for your organization.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()} disabled={!!error}>
          + Add Location
        </button>
      </header>

      {error ? (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      ) : (
        <div className="content-card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location Name</th>
                  <th>Address</th>
                  <th>Tax Rate</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td className="font-medium">{loc.name}</td>
                    <td className="text-muted">{loc.address || '—'}</td>
                    <td>{loc.tax_rate}%</td>
                    <td className="text-right">
                      <button className="btn-icon" onClick={() => openModal(loc)} aria-label={`Edit ${loc.name}`}>{Icons.edit}</button>
                      <button className="btn-icon text-error hover-bg-error" onClick={() => handleDelete(loc.id)} aria-label={`Delete ${loc.name}`}>{Icons.trash}</button>
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center p-xl text-muted">No locations found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? 'Edit Location' : 'Add Location'}>
        <form onSubmit={handleSubmit} className="form-layout">
          <div className="form-group">
            <label>Location Name</label>
            <input 
              type="text" 
              required 
              className="form-input" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input 
              type="text" 
              className="form-input" 
              value={formData.address} 
              onChange={e => setFormData({...formData, address: e.target.value})} 
            />
          </div>
          <div className="form-group">
            <label>Tax Rate (%)</label>
            <input 
              type="number" 
              step="0.01" 
              min="0"
              className="form-input" 
              value={formData.tax_rate} 
              onChange={e => setFormData({...formData, tax_rate: parseFloat(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>Receipt Header Text</label>
            <textarea 
              className="form-input" 
              rows="3"
              value={formData.receipt_header || ''} 
              onChange={e => setFormData({...formData, receipt_header: e.target.value})}
              placeholder="Store Name&#10;123 Address St&#10;Phone: 555-0100"
            ></textarea>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Location</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
