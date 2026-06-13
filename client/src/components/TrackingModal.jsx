import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useAuthContext } from '../lib/AuthContext';
import UnitJourneyModal from './UnitJourneyModal';

export default function TrackingModal({ isOpen, onClose, product, locations, isDoubleMode, activeLocationFilter }) {
  const toast = useToast();
  const { role, hasPermission } = useAuthContext();
  const isManagerOrAdmin = hasPermission('manage_inventory');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  
  const [trackedUnits, setTrackedUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [untrackedSlots, setUntrackedSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);

  // Journey Modal State
  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [selectedJourneyUnitId, setSelectedJourneyUnitId] = useState(null);

  // Setup location when product changes
  useEffect(() => {
    if (isOpen && product) {
      if (activeLocationFilter && activeLocationFilter !== 'all') {
        setSelectedLocationId(activeLocationFilter);
      } else {
        const stockLocations = product.product_inventory?.filter(inv => inv.quantity > 0) || [];
        if (stockLocations.length === 1) {
          setSelectedLocationId(stockLocations[0].location_id);
        } else if (stockLocations.length > 1 && locations.length > 0) {
          setSelectedLocationId(''); // Let them select
        } else if (locations.length > 0) {
          setSelectedLocationId(locations[0].id);
        }
      }
    }
  }, [isOpen, product, locations, activeLocationFilter]);

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
      
      const invRecord = product.product_inventory?.find(inv => inv.location_id === selectedLocationId);
      const totalStock = invRecord ? invRecord.quantity : 0;
      
      const untrackedCount = Math.max(0, totalStock - data.length);
      
      setUntrackedSlots(Array.from({ length: untrackedCount }, () => ({ pack_code: '', item_code: '', serial_number: '', product_code: '' })));
      
    } catch (err) {
      setError('Failed to fetch tracking data');
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setLoading(false);
    }
  }, [product, selectedLocationId, isDoubleMode]);

  useEffect(() => {
    if (isOpen && selectedLocationId) {
      fetchTrackedItems();
    }
  }, [isOpen, selectedLocationId, fetchTrackedItems]);

  const handleClose = () => {
    setError('');
    setSaveSuccess('');
    setSelectedUnitIds([]);
    onClose();
  };

  const handleSlotChange = (index, field, value) => {
    const newSlots = [...untrackedSlots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setUntrackedSlots(newSlots);
  };

  const simulateScan = (index, field = null) => {
    const msg = field ? `Scanner Placeholder: Ready to scan for ${field.replace('_', ' ')}...` : 'Scanner Integration Placeholder: In the future, this will send a command to the Scanner App or open the camera.';
    toast.info(msg);
  };

  const handleSave = async () => {
    const itemsToAssign = untrackedSlots.filter(s => s.pack_code.trim() !== '' && s.serial_number.trim() !== '' && s.product_code.trim() !== '');
    if (itemsToAssign.length === 0) {
      setError('Please enter Pack Code, Serial Number, and Product Code for at least one item.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveSuccess('');
    
    try {
      let assignedCount = 0;
      let errors = [];
      for (let i = 0; i < itemsToAssign.length; i++) {
        const item = itemsToAssign[i];
        try {
          await api.post('/units/assign', {
            product_id: product.id,
            location_id: selectedLocationId,
            pack_code: item.pack_code || undefined,
            serial_number: item.serial_number || undefined,
            product_code: item.product_code || undefined,
            qr_code: item.item_code || undefined
          });
          assignedCount++;
        } catch (err) {
          errors.push(`Item #${i + 1}: ${err.message}`);
        }
      }
      
      if (errors.length > 0) {
        setError(`Partial success. Assigned ${assignedCount}, failed ${errors.length}:\n${errors.join('\n')}`);
      } else {
        setSaveSuccess(`Successfully assigned ${assignedCount} items.`);
        setIsAssignModalOpen(false);
      }
      
      await fetchTrackedItems();
    } catch (err) {
      setError(err.message || 'Failed to assign tracking codes');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUnit = async (index) => {
    const item = untrackedSlots[index];
    if (item.pack_code.trim() === '' || item.serial_number.trim() === '' || item.product_code.trim() === '') {
      toast.error('Please scan Pack Code, Serial Number, and Product Code to save.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/units/assign', {
        product_id: product.id,
        location_id: selectedLocationId,
        pack_code: item.pack_code || undefined,
        serial_number: item.serial_number || undefined,
        product_code: item.product_code || undefined,
        qr_code: item.item_code || undefined
      });
      toast.success('Item assigned successfully.');
      await fetchTrackedItems();
      
      if (untrackedSlots.length === 1) {
        setIsAssignModalOpen(false);
      }
    } catch (err) {
      toast.error(`Failed to assign item: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectUnit = (id) => {
    setSelectedUnitIds(prev => 
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = [
        ...trackedUnits.map(u => u.id),
        ...untrackedSlots.map((_, i) => `untracked-${i}`)
      ];
      setSelectedUnitIds(allIds);
    } else {
      setSelectedUnitIds([]);
    }
  };

  const handleEdit = () => {
    if (selectedUnitIds.length === 0) return toast.error('Please select at least one unit to edit.');
    toast.info('Edit mode activated for selected units (Placeholder).');
  };

  const handleDelete = () => {
    if (selectedUnitIds.length === 0) return toast.error('Please select at least one unit to delete.');
    toast.success('Selected units deleted (Placeholder).');
    setSelectedUnitIds([]);
  };

  if (!isOpen || !product) return null;

  const totalStock = product.product_inventory?.find(inv => inv.location_id === selectedLocationId)?.quantity || 0;
  const isSaveDisabled = saving || untrackedSlots.every(s => s.pack_code.trim() === '' || s.serial_number.trim() === '' || s.product_code.trim() === '');

  const combinedUnits = [
    ...trackedUnits.map(u => ({ ...u, isTracked: true })),
    ...untrackedSlots.map((s, i) => ({ id: `untracked-${i}`, isTracked: false, slot: s, index: i }))
  ];

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Product Tracking" size="xl">
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{product.name}</h4>
              <p style={{ color: '#64748b' }}>SKU: {product.sku}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" onClick={() => setIsAssignModalOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 5v14M5 12h14"/></svg>
                Assign Tracking
              </button>
              <button className="btn btn-secondary" onClick={handleEdit}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </button>
            </div>
          </div>
          {isDoubleMode && <span className="badge badge-warning mt-sm">Double Tracking Mode Active</span>}
        </div>

        {(!activeLocationFilter || activeLocationFilter === 'all') && (
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
        )}

        {selectedLocationId && (
          <>
            {loading ? (
              <div className="text-center py-xl text-muted">Loading tracking data...</div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ padding: '16px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Total Quantity</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{totalStock}</div>
                  </div>
                  <div style={{ padding: '16px', background: 'var(--color-success)', color: 'white', borderRadius: '8px', border: '1px solid var(--color-success-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Tracked Items</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{trackedUnits.length}</div>
                  </div>
                  <div style={{ padding: '16px', background: 'var(--color-error)', color: 'white', borderRadius: '8px', border: '1px solid var(--color-error-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Untracked Items</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{untrackedSlots.length}</div>
                  </div>
                </div>

                {saveSuccess && <div className="alert alert-success mb-lg"><p>{saveSuccess}</p></div>}

                <div className="table-responsive">
                  <table className="data-table" style={{ marginTop: '16px' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px', width: '40px' }}>
                          <input 
                            type="checkbox" 
                            onChange={handleSelectAll} 
                            checked={combinedUnits.length > 0 && selectedUnitIds.length === combinedUnits.length}
                          />
                        </th>
                        <th style={{ padding: '12px' }}>Model</th>
                        {isDoubleMode ? (
                          <>
                            <th style={{ padding: '12px' }}>Pack Code</th>
                            <th style={{ padding: '12px' }}>Serial Number</th>
                            <th style={{ padding: '12px' }}>Item Code</th>
                          </>
                        ) : (
                          <th style={{ padding: '12px' }}>QR Code / Tracking ID</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {combinedUnits.length === 0 ? (
                        <tr>
                          <td colSpan={isDoubleMode ? 5 : 3} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No individual products found at this location.
                          </td>
                        </tr>
                      ) : (
                        combinedUnits.map(unit => (
                          <tr 
                            key={unit.id} 
                            style={{ 
                              background: unit.isTracked ? 'transparent' : 'var(--color-error-bg)',
                              cursor: isManagerOrAdmin ? 'pointer' : 'default',
                            }}
                            className={isManagerOrAdmin ? 'hoverable-row' : ''}
                            onClick={(e) => {
                              // Don't trigger if they clicked the checkbox
                              if (e.target.type === 'checkbox') return;
                              if (isManagerOrAdmin) {
                                setSelectedJourneyUnitId(unit.isTracked ? unit.id : 'untracked');
                                setIsJourneyModalOpen(true);
                              }
                            }}
                            title={isManagerOrAdmin ? "Click to view Product Journey" : ""}
                          >
                            <td style={{ padding: '12px' }}>
                              <input 
                                type="checkbox" 
                                checked={selectedUnitIds.includes(unit.id)}
                                onChange={() => handleSelectUnit(unit.id)}
                              />
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span 
                                style={{ 
                                  fontWeight: '500', 
                                  textDecoration: isManagerOrAdmin ? 'underline' : 'none',
                                  color: isManagerOrAdmin ? 'var(--color-primary)' : 'inherit'
                                }}
                              >
                                {product.name}
                              </span>
                            </td>
                            
                            {isDoubleMode ? (
                              <>
                                <td style={{ padding: '12px', color: unit.isTracked ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {unit.isTracked ? (unit.pack_qr?.code || 'None') : '-'}
                                </td>
                                <td style={{ padding: '12px', color: unit.isTracked ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {unit.isTracked ? (unit.serial_number || 'None') : '-'}
                                </td>
                                <td style={{ padding: '12px', color: unit.isTracked ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {unit.isTracked ? (unit.qr?.code || 'Unassigned') : '-'}
                                </td>
                              </>
                            ) : (
                              <td style={{ padding: '12px', color: unit.isTracked ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                {unit.isTracked ? (unit.qr?.code || 'Unknown') : '-'}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </>
        )}
      </Modal>

      {/* Sub-modal for Assign Tracking */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Assign Tracking Codes" size="xl">
        {error && <div className="alert alert-error mb-lg" style={{ whiteSpace: 'pre-wrap' }}><p>{error}</p></div>}
        
        {untrackedSlots.length === 0 ? (
          <p className="text-muted">All items at this location are currently tracked. No units to assign.</p>
        ) : (
          <div>
            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>Assign codes to the {untrackedSlots.length} untracked items at {locations.find(l => l.id === selectedLocationId)?.name}.</p>
            {untrackedSlots.map((slot, index) => (
              <div key={index} style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', marginBottom: '12px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '24px', height: '24px', background: 'var(--color-border)', color: 'var(--color-text-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', marginRight: '8px' }}>
                      {index + 1}
                    </div>
                    <span style={{ fontWeight: '500', fontSize: '14px' }}>{product.name} #{index + 1}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '500' }} 
                      onClick={() => handleSaveUnit(index)} 
                      disabled={saving || slot.pack_code.trim() === '' || slot.serial_number.trim() === '' || slot.product_code.trim() === ''}
                    >
                      Save Unit
                    </button>
                    <button className="btn btn-primary btn-sm" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }} onClick={() => simulateScan(index)} title="Scan Codes">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h3M17 4h3v3M4 17v3h3M17 20h3v-3M9 9h6v6H9z"/></svg>
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', background: slot.pack_code ? 'var(--color-success)' : 'var(--color-bg-card)', color: slot.pack_code ? 'white' : 'inherit', border: `1px solid var(--color-border)`, padding: '8px', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '10px', color: slot.pack_code ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>
                      Pack Code *
                    </div>
                    <div style={{ fontSize: '12px', color: slot.pack_code ? 'white' : 'var(--color-text-muted)', fontWeight: slot.pack_code ? '600' : 'normal', wordBreak: 'break-all', minHeight: '16px' }}>{slot.pack_code || 'Awaiting scan...'}</div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', background: slot.serial_number ? 'var(--color-success)' : 'var(--color-bg-card)', color: slot.serial_number ? 'white' : 'inherit', border: `1px solid var(--color-border)`, padding: '8px', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '10px', color: slot.serial_number ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>
                      Serial Number *
                    </div>
                    <div style={{ fontSize: '12px', color: slot.serial_number ? 'white' : 'var(--color-text-muted)', fontWeight: slot.serial_number ? '600' : 'normal', wordBreak: 'break-all', minHeight: '16px' }}>{slot.serial_number || 'Awaiting scan...'}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', background: slot.product_code ? 'var(--color-success)' : 'var(--color-bg-card)', color: slot.product_code ? 'white' : 'inherit', border: `1px solid var(--color-border)`, padding: '8px', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '10px', color: slot.product_code ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>Product Code *</div>
                    <div style={{ fontSize: '12px', color: slot.product_code ? 'white' : 'var(--color-text-muted)', fontWeight: slot.product_code ? '600' : 'normal', wordBreak: 'break-all', minHeight: '16px' }}>{slot.product_code || 'Awaiting scan...'}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', background: slot.item_code ? 'var(--color-success)' : 'var(--color-bg-card)', color: slot.item_code ? 'white' : 'inherit', border: `1px solid var(--color-border)`, padding: '8px', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '10px', color: slot.item_code ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>
                      Item Code (Opt)
                    </div>
                    <div style={{ fontSize: '12px', color: slot.item_code ? 'white' : 'var(--color-text-muted)', fontWeight: slot.item_code ? '600' : 'normal', wordBreak: 'break-all', minHeight: '16px' }}>{slot.item_code || 'Awaiting scan...'}</div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setIsAssignModalOpen(false)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSave} 
                disabled={isSaveDisabled}
              >
                {saving ? 'Saving...' : 'Save Tracking'}
              </button>
            </div>
          </div>
        )}
      </Modal>
      
      {isJourneyModalOpen && selectedJourneyUnitId && (
        <UnitJourneyModal 
          isOpen={isJourneyModalOpen} 
          onClose={() => {
            setIsJourneyModalOpen(false);
            setSelectedJourneyUnitId(null);
          }} 
          unitId={selectedJourneyUnitId} 
          productId={product.id}
          locationId={selectedLocationId}
        />
      )}
    </>
  );
}
