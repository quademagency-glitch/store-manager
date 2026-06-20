import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Icons } from '../../components/icons/Icons';
import { CURRENCY_OPTIONS } from '../../utils/currencyOptions';

export default function Locations() {
  const { user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: null, name: '', address: '', tax_rate: 0, receipt_header: '', currency: '',
    latitude: '', longitude: '', geofence_radius_m: 200,
    clock_in_start: '', clock_in_end: '', clock_out_start: '', clock_out_end: '',
  });

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
      setFormData({
        ...loc,
        currency: loc.currency || '',
        latitude: loc.latitude || '',
        longitude: loc.longitude || '',
        geofence_radius_m: loc.geofence_radius_m || 200,
        clock_in_start: loc.clock_in_start?.slice(0, 5) || '',
        clock_in_end: loc.clock_in_end?.slice(0, 5) || '',
        clock_out_start: loc.clock_out_start?.slice(0, 5) || '',
        clock_out_end: loc.clock_out_end?.slice(0, 5) || '',
      });
    } else {
      setFormData({
        id: null, name: '', address: '', tax_rate: 0, receipt_header: '', currency: '',
        latitude: '', longitude: '', geofence_radius_m: 200,
        clock_in_start: '', clock_in_end: '', clock_out_start: '', clock_out_end: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        tax_rate: formData.tax_rate,
        receipt_header: formData.receipt_header,
        currency: formData.currency || null,
      };
      if (formData.id) {
        await api.put(`/locations/${formData.id}`, payload);
      } else {
        await api.post('/locations', payload);
      }
      // Update geofence + time windows separately via HR endpoint
      if (formData.id) {
        await api.put(`/hr/geofence/${formData.id}`, {
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          geofence_radius_m: parseInt(formData.geofence_radius_m) || 200,
          clock_in_start: formData.clock_in_start || null,
          clock_in_end: formData.clock_in_end || null,
          clock_out_start: formData.clock_out_start || null,
          clock_out_end: formData.clock_out_end || null,
        });
      }
      setIsModalOpen(false);
      fetchLocations();
      toast.success(formData.id ? 'Location updated' : 'Location created');
    } catch (err) {
      toast.error("Error saving location: " + err.message);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('GPS not available in your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        toast.success('GPS coordinates captured!');
      },
      () => toast.error('Could not get your location. Enable GPS and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
                  <th>Currency</th>
                  <th>Geofence</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td className="font-medium">{loc.name}</td>
                    <td className="text-muted">{loc.address || '—'}</td>
                    <td>{loc.tax_rate}%</td>
                    <td className="text-muted">{loc.currency || 'Business default'}</td>
                    <td>
                      {loc.latitude && loc.longitude ? (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          ✓ {loc.geofence_radius_m || 200}m radius
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>Not set</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button className="btn-icon" onClick={() => openModal(loc)} aria-label={`Edit ${loc.name}`}>{Icons.edit}</button>
                      <button className="btn-icon text-error hover-bg-error" onClick={() => handleDelete(loc.id)} aria-label={`Delete ${loc.name}`}>{Icons.trash}</button>
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center p-xl text-muted">No locations found.</td>
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
          <div className="form-group">
            <label>Currency</label>
            <select
              className="form-input"
              value={formData.currency}
              onChange={e => setFormData({...formData, currency: e.target.value})}
            >
              <option value="">Same as business default</option>
              {CURRENCY_OPTIONS.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Staff working at this location will see amounts in this currency automatically.
            </p>
          </div>

          {/* Geofence Section */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>
                📍 Attendance Geofence
              </label>
              <button type="button" className="btn btn-sm btn-secondary" onClick={handleUseMyLocation} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
                </svg>
                Use My Location
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              Set coordinates and a radius to enforce location-based clock in/out. Staff must be within the radius to clock in.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="form-input"
                  placeholder="e.g. 5.614818"
                  value={formData.latitude}
                  onChange={e => setFormData({...formData, latitude: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="form-input"
                  placeholder="e.g. -0.186964"
                  value={formData.longitude}
                  onChange={e => setFormData({...formData, longitude: e.target.value})}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Allowed Radius (meters): {formData.geofence_radius_m}m</label>
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={formData.geofence_radius_m}
                onChange={e => setFormData({...formData, geofence_radius_m: parseInt(e.target.value)})}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                <span>50m</span>
                <span>2000m</span>
              </div>
            </div>

            {/* Time Windows Section */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '8px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 8px', display: 'block' }}>
                ⏰ Allowed Clock-In / Clock-Out Times
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                Set time windows to restrict when staff can clock in and clock out. Leave empty for no restriction.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Clock-In Start</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formData.clock_in_start}
                    onChange={e => setFormData({...formData, clock_in_start: e.target.value})}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Clock-In End</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formData.clock_in_end}
                    onChange={e => setFormData({...formData, clock_in_end: e.target.value})}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Clock-Out Start</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formData.clock_out_start}
                    onChange={e => setFormData({...formData, clock_out_start: e.target.value})}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Clock-Out End</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formData.clock_out_end}
                    onChange={e => setFormData({...formData, clock_out_end: e.target.value})}
                  />
                </div>
              </div>
              {(formData.clock_in_start && formData.clock_in_end) && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Staff can clock in between <strong>{formData.clock_in_start}</strong> and <strong>{formData.clock_in_end}</strong>
                  {formData.clock_out_start && formData.clock_out_end
                    ? <>, and clock out between <strong>{formData.clock_out_start}</strong> and <strong>{formData.clock_out_end}</strong></>
                    : ''}
                </p>
              )}
            </div>
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
