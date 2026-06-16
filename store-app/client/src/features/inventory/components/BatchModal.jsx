import { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';

export default function BatchModal({ isOpen, onClose, onSubmit, locations, products, submitting, error }) {
  const [batchData, setBatchData] = useState({
    productId: '', locationId: '', batchNumber: '', quantity: '', expiryDate: '', notes: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(batchData);
  };

  useEffect(() => {
    if (!isOpen) {
      setBatchData({ productId: '', locationId: '', batchNumber: '', quantity: '', expiryDate: '', notes: '' });
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={() => !submitting && onClose()} title="Register Product Batch">
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="alert alert-error"><p>{error}</p></div>}
        <div className="form-group">
          <label>Product</label>
          <select required value={batchData.productId} onChange={e => setBatchData({...batchData, productId: e.target.value})} className="form-input">
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Location</label>
          <select required value={batchData.locationId} onChange={e => setBatchData({...batchData, locationId: e.target.value})} className="form-input">
            <option value="">Select a location...</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Batch Number</label>
          <input type="text" required value={batchData.batchNumber} onChange={e => setBatchData({...batchData, batchNumber: e.target.value})} className="form-input" placeholder="e.g. LOT-2026-001" />
        </div>
        <div className="form-group">
          <label>Quantity</label>
          <input type="number" required min="1" value={batchData.quantity} onChange={e => setBatchData({...batchData, quantity: e.target.value})} className="form-input" placeholder="e.g. 100" />
        </div>
        <div className="form-group">
          <label>Expiry Date</label>
          <input type="date" required value={batchData.expiryDate} onChange={e => setBatchData({...batchData, expiryDate: e.target.value})} className="form-input" />
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" value={batchData.notes} onChange={e => setBatchData({...batchData, notes: e.target.value})} className="form-input" placeholder="e.g. Supplier: Acme Corp" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !batchData.productId || !batchData.batchNumber || !batchData.expiryDate}>
            {submitting ? 'Saving...' : 'Register Batch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
