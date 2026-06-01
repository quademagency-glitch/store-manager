import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../lib/AuthContext';
import Modal from '../../components/Modal';

export default function Locations() {
  const { user } = useAuthContext();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [businessId, setBusinessId] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', address: '', tax_rate: 0, receipt_header: '' });

  useEffect(() => {
    fetchLocations();
  }, [user?.id]);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.from('users').select('business_id').eq('id', user.id).single();
      if (!userData?.business_id) return;
      setBusinessId(userData.business_id);

      const { data, error } = await supabase.from('locations').select('*').eq('business_id', userData.business_id).order('created_at');
      if (error) throw error;
      
      // If error occurs with relation it means the migration hasn't been run yet
      setLocations(data || []);
    } catch (err) {
      console.error(err);
      if (err.message.includes('relation "public.locations" does not exist')) {
        setError("The multi-location database migration has not been run yet. Please ask the platform admin to run Migration 010.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

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
        const { error } = await supabase.from('locations').update({
          name: formData.name,
          address: formData.address,
          tax_rate: formData.tax_rate,
          receipt_header: formData.receipt_header
        }).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('locations').insert([{
          business_id: businessId,
          name: formData.name,
          address: formData.address,
          tax_rate: formData.tax_rate,
          receipt_header: formData.receipt_header
        }]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchLocations();
    } catch (err) {
      alert("Error saving location: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this location? Ensure no sales or users are actively tied to it.")) {
      try {
        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) throw error;
        fetchLocations();
      } catch (err) {
        alert("Error deleting location: " + err.message);
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
          <strong>Database Error:</strong> {error}
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
                      <button className="btn-icon" onClick={() => openModal(loc)}>✎</button>
                      <button className="btn-icon text-error hover-bg-error" onClick={() => handleDelete(loc.id)}>🗑</button>
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
