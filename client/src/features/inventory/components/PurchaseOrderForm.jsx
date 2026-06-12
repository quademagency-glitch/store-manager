import { useState, useEffect, useMemo } from 'react';
import Modal from '../../../components/Modal';

export default function PurchaseOrderForm({ isOpen, onClose, onSubmit, suppliers, products, editingOrder, isSubmitting, error }) {
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ product_id: '', quantity: '', unit_cost: '', notes: '' }]);

  useEffect(() => {
    if (editingOrder) {
      setSupplierId(editingOrder.supplier_id || '');
      setExpectedDate(editingOrder.expected_date || '');
      setNotes(editingOrder.notes || '');
      setItems(
        (editingOrder.items || []).map(item => ({
          product_id: item.product_id,
          quantity: String(item.quantity),
          unit_cost: String(item.unit_cost),
          notes: item.notes || ''
        }))
      );
    } else {
      setSupplierId('');
      setExpectedDate('');
      setNotes('');
      setItems([{ product_id: '', quantity: '', unit_cost: '', notes: '' }]);
    }
  }, [editingOrder, isOpen]);

  const addItem = () => {
    setItems(prev => [...prev, { product_id: '', quantity: '', unit_cost: '', notes: '' }]);
  };

  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Auto-populate unit cost from product price when product is selected
      if (field === 'product_id' && value) {
        const product = products.find(p => p.id === value);
        if (product && !item.unit_cost) {
          updated.unit_cost = String(product.price);
        }
      }
      return updated;
    }));
  };

  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.unit_cost) || 0;
      return sum + (qty * cost);
    }, 0);
  }, [items]);

  const validItems = items.filter(item => item.product_id && item.quantity && parseInt(item.quantity, 10) > 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      supplier_id: supplierId,
      expected_date: expectedDate || null,
      notes,
      items: validItems.map(item => ({
        product_id: item.product_id,
        quantity: parseInt(item.quantity, 10),
        unit_cost: parseFloat(item.unit_cost) || 0,
        notes: item.notes
      }))
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingOrder ? 'Edit Purchase Order' : 'Create Purchase Order'} size="large">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Header Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div className="form-group">
            <label className="form-label">Supplier *</label>
            <select className="form-input" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
              <option value="">Select supplier...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Expected Delivery Date</label>
            <input
              type="date"
              className="form-input"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
            />
          </div>
        </div>

        {/* Line Items */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>Line Items</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Add Item
            </button>
          </div>

          {/* Column Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 36px', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Product</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'center' }}>Qty</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'center' }}>Unit Cost</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'right' }}>Total</span>
            <span></span>
          </div>

          {items.map((item, idx) => {
            const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 36px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <select
                  className="form-input"
                  value={item.product_id}
                  onChange={e => updateItem(idx, 'product_id', e.target.value)}
                  style={{ fontSize: '0.9rem' }}
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="form-input"
                  value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', e.target.value)}
                  placeholder="0"
                  min="1"
                  style={{ textAlign: 'center', fontSize: '0.9rem' }}
                />
                <input
                  type="number"
                  className="form-input"
                  value={item.unit_cost}
                  onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  style={{ textAlign: 'right', fontSize: '0.9rem' }}
                />
                <div style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', padding: '0 4px' }}>
                  {lineTotal > 0 ? lineTotal.toFixed(2) : '—'}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length <= 1}
                  style={{
                    background: 'none', border: 'none', cursor: items.length <= 1 ? 'not-allowed' : 'pointer',
                    color: items.length <= 1 ? 'var(--color-text-muted)' : 'var(--color-error)',
                    padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="Remove item"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            );
          })}

          {/* Grand Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '2px solid var(--color-border)', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Grand Total:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label">Notes</label>
          <textarea
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes for this purchase order..."
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !supplierId || validItems.length === 0}
          >
            {isSubmitting ? 'Saving...' : (editingOrder ? 'Update PO' : 'Create PO')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
