import { useState, useEffect, useMemo } from 'react';
import Modal from '../../../components/Modal';

export default function ReceiveGoodsModal({ isOpen, onClose, onSubmit, purchaseOrder, locations, isSubmitting, error, locked, savedRequest, activeLocationId }) {
  const [receiveItems, setReceiveItems] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (purchaseOrder?.items) {
      setReceiveItems(
        purchaseOrder.items.map(item => ({
          item_id: item.id,
          product_name: item.product?.name || 'Unknown',
          product_sku: item.product?.sku || '',
          ordered: item.quantity,
          already_received: item.received_quantity || 0,
          remaining: item.quantity - (item.received_quantity || 0),
          received_qty: String(savedRequest?.items.find(row => row.item_id === item.id)?.received_qty ?? (item.quantity - (item.received_quantity || 0))), // Default to remaining
          unit_cost: item.unit_cost
        }))
      );
      setNotes(savedRequest?.notes || '');
      setLocationId(activeLocationId || '');
    }
  }, [purchaseOrder, isOpen, savedRequest, activeLocationId]);

  const updateReceiveQty = (index, value) => {
    setReceiveItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return { ...item, received_qty: value };
    }));
  };

  const validItems = useMemo(() => {
    return receiveItems.filter(item => {
      const qty = parseInt(item.received_qty, 10);
      return qty > 0 && qty <= item.remaining;
    });
  }, [receiveItems]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!locationId) return;
    if (locked) { onSubmit(savedRequest); return; }

    onSubmit({
      location_id: locationId,
      notes,
      items: validItems.map(item => ({
        item_id: item.item_id,
        received_qty: parseInt(item.received_qty, 10)
      }))
    });
  };

  if (!purchaseOrder) return null;

  return (
    <Modal isOpen={isOpen} onClose={() => !isSubmitting && !locked && onClose()} title={`Receive Goods: ${purchaseOrder.po_number}`} size="large">
      <form onSubmit={handleSubmit}>
        {locked && <p role="status">The delivery result is unconfirmed. Retry the same delivery to retrieve its saved result.</p>}
        <fieldset disabled={isSubmitting || locked} style={{ border:0, padding:0 }}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* PO Info Banner */}
        <div style={{ display: 'flex', gap: '24px', padding: '16px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Supplier</div>
            <div className="font-bold text-primary">{purchaseOrder.supplier?.name || 'Unknown'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>PO Number</div>
            <div style={{ fontWeight: 600, color: 'var(--color-primary)', fontFamily: 'monospace' }}>{purchaseOrder.po_number}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Status</div>
            <div className="font-bold">{purchaseOrder.status}</div>
          </div>
        </div>

        {/* Receive Location */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label className="form-label" htmlFor="receive-location">Receive to Location *</label>
          <select id="receive-location" className="form-input" value={locationId} onChange={e => setLocationId(e.target.value)} required>
            <option value="">Select location...</option>
            {(locations || []).filter(l => l.id === activeLocationId).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Items Table */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' }}>Items to Receive</div>
          <div className="glass-panel" style={{ overflow: 'auto' }}>
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-center">Ordered</th>
                  <th className="text-center">Received</th>
                  <th className="text-center">Remaining</th>
                  <th style={{ textAlign: 'center', minWidth: '100px' }}>Receive Now</th>
                </tr>
              </thead>
              <tbody>
                {receiveItems.map((item, idx) => {
                  const receivingQty = parseInt(item.received_qty, 10) || 0;
                  const isOverflow = receivingQty > item.remaining;
                  const isComplete = item.remaining === 0;

                  return (
                    <tr key={item.item_id} style={{ opacity: isComplete ? 0.5 : 1 }}>
                      <td>
                        <div className="font-medium">{item.product_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{item.product_sku}</div>
                      </td>
                      <td className="text-center font-bold">{item.ordered}</td>
                      <td className="text-center">
                        <span style={{ color: item.already_received > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                          {item.already_received}
                        </span>
                      </td>
                      <td className="text-center">
                        <span style={{ color: item.remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600 }}>
                          {item.remaining}
                        </span>
                      </td>
                      <td className="text-center">
                        {isComplete ? (
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Complete</span>
                        ) : (
                          <input
                            aria-label={`Receive quantity for ${item.product_name}`}
                            step="1"
                            type="number"
                            className="form-input"
                            value={item.received_qty}
                            onChange={e => updateReceiveQty(idx, e.target.value)}
                            min="0"
                            max={item.remaining}
                            style={{
                              width: '80px', textAlign: 'center', margin: '0 auto',
                              borderColor: isOverflow ? 'var(--color-error)' : undefined
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="form-group mb-lg">
          <label className="form-label" htmlFor="receive-notes">Receiving Notes</label>
          <textarea id="receive-notes"
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any notes about this delivery (damage, short, etc.)..."
            style={{ resize: 'vertical' }}
          />
        </div>

        </fieldset>
        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="button" className="btn btn-secondary" disabled={isSubmitting || locked} onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !locationId || (!locked && validItems.length === 0)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-success), #16a34a)', border: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {isSubmitting ? 'Processing...' : locked ? 'Retry same delivery' : `Receive ${validItems.length} Item(s)`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
