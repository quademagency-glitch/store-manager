import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';

export default function TrackingModal({ isOpen, onClose, product, locations }) {
  const [selectedLocationId, setSelectedLocationId] = useState('');
  
  const [trackedUnits, setTrackedUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [untrackedSlots, setUntrackedSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Setup location when product changes
  useEffect(() => {
    if (isOpen && product) {
      // Find locations where product has stock
      const stockLocations = product.product_inventory?.filter(inv => inv.quantity > 0) || [];
      if (stockLocations.length === 1) {
        setSelectedLocationId(stockLocations[0].location_id);
      } else if (stockLocations.length > 1 && locations.length > 0) {
        setSelectedLocationId(''); // Let them select
      } else if (locations.length > 0) {
        setSelectedLocationId(locations[0].id);
      }
    }
  }, [isOpen, product, locations]);

  // Fetch tracked items when location is selected
  const fetchTrackedItems = useCallback(async () => {
    if (!product?.id || !selectedLocationId) {
      setTrackedUnits([]);
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/units?product_id=${product.id}&location_id=${selectedLocationId}&status=in_stock`);
      setTrackedUnits(data);
      
      // Calculate untracked
      const invRecord = product.product_inventory?.find(inv => inv.location_id === selectedLocationId);
      const totalStock = invRecord ? invRecord.quantity : 0;
      
      const untrackedCount = Math.max(0, totalStock - data.length);
      
      // Initialize slots
      setUntrackedSlots(Array(untrackedCount).fill(''));
      
    } catch (err) {
      setError('Failed to fetch tracking data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [product, selectedLocationId]);

  useEffect(() => {
    if (isOpen && selectedLocationId) {
      fetchTrackedItems();
    }
  }, [isOpen, selectedLocationId, fetchTrackedItems]);

  const handleClose = () => {
    setError('');
    setSaveSuccess('');
    onClose();
  };

  const handleSlotChange = (index, value) => {
    const newSlots = [...untrackedSlots];
    newSlots[index] = value;
    setUntrackedSlots(newSlots);
  };

  const simulateScan = (index) => {
    // Placeholder for Scanner Integration as per user request
    alert('Scanner Integration Placeholder: In the future, this will send a command to the Scanner App or open the camera.');
  };

  const handleSave = async () => {
    const codesToAssign = untrackedSlots.filter(code => code.trim() !== '');
    if (codesToAssign.length === 0) {
      setError('Please enter at least one QR code to assign.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveSuccess('');
    
    try {
      const result = await api.post('/units/bulk-assign', {
        product_id: product.id,
        location_id: selectedLocationId,
        qr_codes: codesToAssign
      });
      
      if (result.errors?.length > 0) {
        const errorMsgs = result.errors.map(e => `${e.code}: ${e.reason}`).join('\n');
        setError(`Partial success. Some codes failed:\n${errorMsgs}`);
      } else {
        setSaveSuccess(`Successfully assigned ${result.assigned} items.`);
      }
      
      await fetchTrackedItems(); // Refresh lists
    } catch (err) {
      setError(err.message || 'Failed to assign tracking codes');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  const totalStock = product.product_inventory?.find(inv => inv.location_id === selectedLocationId)?.quantity || 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Inventory Quantity Tracker">
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{product.name}</h4>
        <p style={{ color: '#64748b' }}>SKU: {product.sku}</p>
      </div>

      <div className="form-group" style={{ marginBottom: '24px' }}>
        <label>Select Location</label>
        <select 
          className="form-input" 
          value={selectedLocationId} 
          onChange={(e) => setSelectedLocationId(e.target.value)}
        >
          <option value="">-- Choose Location --</option>
          {locations.map(loc => {
            const locStock = product.product_inventory?.find(inv => inv.location_id === loc.id)?.quantity || 0;
            return (
              <option key={loc.id} value={loc.id}>
                {loc.name} (Stock: {locStock})
              </option>
            );
          })}
        </select>
      </div>

      {selectedLocationId && (
        <>
          {loading ? (
            <div className="text-center py-xl text-muted">Loading tracking data...</div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Total Quantity</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalStock}</div>
                </div>
                <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#166534', marginBottom: '4px' }}>Tracked Items</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>{trackedUnits.length}</div>
                </div>
                <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#991b1b', marginBottom: '4px' }}>Untracked Items</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>{untrackedSlots.length}</div>
                </div>
              </div>

              {error && <div className="alert alert-error mb-lg" style={{ whiteSpace: 'pre-wrap' }}><p>{error}</p></div>}
              {saveSuccess && <div className="alert alert-success mb-lg"><p>{saveSuccess}</p></div>}

              {/* Untracked Items Section */}
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Assign Tracking Codes</h5>
                {untrackedSlots.length === 0 ? (
                  <p className="text-muted">All items at this location are currently tracked.</p>
                ) : (
                  <div>
                    {untrackedSlots.map((slotCode, index) => (
                      <div key={index} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                        <div style={{ width: '24px', height: '24px', background: '#e2e8f0', color: '#475569', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                          {index + 1}
                        </div>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Enter or paste QR code..." 
                          value={slotCode}
                          onChange={(e) => handleSlotChange(index, e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => simulateScan(index)}
                          title="Simulate Scanner App"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '4px' }}>
                            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Scan QR
                        </button>
                      </div>
                    ))}
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={handleSave} 
                        disabled={saving || untrackedSlots.every(s => s.trim() === '')}
                      >
                        {saving ? 'Saving...' : 'Save Tracking'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tracked Items Section */}
              {trackedUnits.length > 0 && (
                <div>
                  <h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Old Items (Tracked)</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                    {trackedUnits.map(unit => (
                      <div key={unit.id} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#10b981' }}>
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <code style={{ background: 'transparent', padding: 0 }}>{unit.qr?.code || 'Unknown'}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </>
      )}
    </Modal>
  );
}
