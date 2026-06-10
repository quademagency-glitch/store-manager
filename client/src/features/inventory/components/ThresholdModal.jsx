import { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';

export default function ThresholdModal({ isOpen, onClose, onSubmit, locations, products, thresholding, error }) {
  const [thresholdData, setThresholdData] = useState({ productId: '', locationId: '', threshold: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(thresholdData);
  };

  useEffect(() => {
    if (!isOpen) {
      setThresholdData({ productId: '', locationId: '', threshold: '' });
    }
  }, [isOpen]);

  const handleLocationChange = (e) => {
    const locId = e.target.value;
    const selectedProd = products.find(p => p.id === thresholdData.productId);
    const existingInv = selectedProd?.product_inventory?.find(inv => inv.location_id === locId);
    setThresholdData({ 
      ...thresholdData, 
      locationId: locId, 
      threshold: existingInv?.low_stock_threshold !== undefined ? existingInv.low_stock_threshold : '' 
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !thresholding && onClose()} title="Manage Low Stock Threshold">
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="alert alert-error"><p>{error}</p></div>}
        <div className="form-group">
          <label>Product</label>
          <select required value={thresholdData.productId} onChange={e => setThresholdData({...thresholdData, productId: e.target.value})} className="form-input">
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Location</label>
          <select required value={thresholdData.locationId} onChange={handleLocationChange} className="form-input" disabled={!thresholdData.productId}>
            <option value="">Select a location...</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Low Stock Alert Threshold</label>
          <input type="number" required min="0" value={thresholdData.threshold} onChange={e => setThresholdData({...thresholdData, threshold: e.target.value})} className="form-input" placeholder="e.g. 5" disabled={!thresholdData.locationId} />
          <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
            The system will trigger an alert when stock at this location falls to or below this number.
          </small>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={thresholding}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={thresholding || !thresholdData.productId || !thresholdData.locationId || thresholdData.threshold === ''}>
            {thresholding ? 'Saving...' : 'Save Threshold'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
