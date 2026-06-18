import { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';

export default function AdjustStockModal({ isOpen, onClose, onSubmit, locations, products, adjusting, initialProductId }) {
  const [adjustData, setAdjustData] = useState({
    productId: initialProductId || '', locationId: '', quantityChange: '', movementType: 'RECEIPT', notes: '', shrinkageReason: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(adjustData);
    if (!adjusting) {
      setAdjustData({ productId: '', locationId: '', quantityChange: '', movementType: 'RECEIPT', notes: '', shrinkageReason: '' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAdjustData(prev => ({ ...prev, productId: initialProductId || '' }));
    }
  }, [isOpen, initialProductId]);

  return (
    <Modal isOpen={isOpen} onClose={() => !adjusting && onClose()} title="Adjust Stock">
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-group">
          <label>Product</label>
          <select required value={adjustData.productId} onChange={e => setAdjustData({...adjustData, productId: e.target.value})} className="form-input">
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Location</label>
          <select required value={adjustData.locationId} onChange={e => setAdjustData({...adjustData, locationId: e.target.value})} className="form-input">
            <option value="">Select a location...</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Movement Type</label>
          <select required value={adjustData.movementType} onChange={e => setAdjustData({...adjustData, movementType: e.target.value})} className="form-input">
            <option value="RECEIPT">Receive Stock (+)</option>
            <option value="ADJUSTMENT">Manual Adjustment</option>
            <option value="RETURN">Customer Return (+)</option>
            <option value="SHRINKAGE">Shrinkage / Damage (-)</option>
          </select>
        </div>
        {adjustData.movementType === 'SHRINKAGE' && (
          <div className="form-group">
            <label>Shrinkage Reason <span style={{ color: 'var(--color-error)' }}>*</span></label>
            <select required value={adjustData.shrinkageReason} onChange={e => setAdjustData({...adjustData, shrinkageReason: e.target.value})} className="form-input">
              <option value="">Select reason...</option>
              <option value="theft_suspected">🚨 Theft Suspected</option>
              <option value="damage">💥 Damage / Broken / Expired</option>
              <option value="admin_error">📝 Admin / Counting Error</option>
              <option value="unknown">❓ Unknown / Unexplained</option>
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Quantity Change (Absolute Number)</label>
          <input type="number" required min="1" value={adjustData.quantityChange} onChange={e => setAdjustData({...adjustData, quantityChange: e.target.value})} className="form-input" placeholder="e.g. 50" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input type="text" value={adjustData.notes} onChange={e => setAdjustData({...adjustData, notes: e.target.value})} className="form-input" placeholder="e.g. Received PO-1029" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={adjusting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={adjusting || !adjustData.productId || !adjustData.quantityChange}>
            {adjusting ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
