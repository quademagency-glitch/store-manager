import { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';

export default function TransferModal({ isOpen, onClose, onSubmit, locations, products, transferring, error }) {
  const [transferData, setTransferData] = useState({
    productId: '', fromLocationId: '', toLocationId: '', quantity: '', notes: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(transferData);
  };

  useEffect(() => {
    if (!isOpen) {
      setTransferData({ productId: '', fromLocationId: '', toLocationId: '', quantity: '', notes: '' });
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={() => !transferring && onClose()} title="New Stock Transfer">
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="alert alert-error"><p>{error}</p></div>}
        <div className="form-group">
          <label>Product</label>
          <select required value={transferData.productId} onChange={e => setTransferData({...transferData, productId: e.target.value})} className="form-input">
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>From Location</label>
          <select required value={transferData.fromLocationId} onChange={e => setTransferData({...transferData, fromLocationId: e.target.value})} className="form-input">
            <option value="">Source location...</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>To Location</label>
          <select required value={transferData.toLocationId} onChange={e => setTransferData({...transferData, toLocationId: e.target.value})} className="form-input">
            <option value="">Destination location...</option>
            {locations.filter(l => l.id !== transferData.fromLocationId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Quantity</label>
          <input type="number" required min="1" value={transferData.quantity} onChange={e => setTransferData({...transferData, quantity: e.target.value})} className="form-input" placeholder="e.g. 25" />
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" value={transferData.notes} onChange={e => setTransferData({...transferData, notes: e.target.value})} className="form-input" placeholder="e.g. Restocking branch B" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={transferring}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={transferring || !transferData.productId || !transferData.fromLocationId || !transferData.toLocationId || !transferData.quantity}>
            {transferring ? 'Creating...' : 'Initiate Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
