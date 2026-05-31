import { useState, useEffect, useMemo } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useStock } from '../hooks/useStock';
import Modal from '../components/Modal';

export default function Inventory() {
  const { hasPermission } = useAuthContext();
  const { products, loading: productsLoading } = useProducts();
  const { movements, loading: stockLoading, fetchMovements, adjustStock, error: stockError, setError } = useStock();

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustData, setAdjustData] = useState({
    productId: '',
    quantityChange: '',
    movementType: 'RECEIPT',
    notes: ''
  });
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock_quantity <= p.low_stock_threshold);
  }, [products]);

  // Handle Adjustment Submit
  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    setAdjusting(true);
    
    // If it's a shrinkage or sale, quantity change should be negative
    // But since the API accepts the actual number, let's parse it based on type
    let finalQtyChange = Number(adjustData.quantityChange);
    if (['SHRINKAGE', 'SALE'].includes(adjustData.movementType)) {
      finalQtyChange = -Math.abs(finalQtyChange); // Ensure negative
    } else {
      finalQtyChange = Math.abs(finalQtyChange); // Ensure positive
    }

    const result = await adjustStock(
      adjustData.productId, 
      finalQtyChange, 
      adjustData.movementType, 
      adjustData.notes
    );

    if (result.success) {
      setIsAdjustModalOpen(false);
      setAdjustData({ productId: '', quantityChange: '', movementType: 'RECEIPT', notes: '' });
      // Ideally we would also refresh products to show updated stock, but page reload or full context handles it
      // Let's rely on fetchMovements being called and the next product refresh.
    }
    setAdjusting(false);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const getTypeBadgeClass = (type) => {
    switch(type) {
      case 'RECEIPT': return 'role-badge-manager'; // Reusing green/blue styling
      case 'SALE': return 'role-badge-salesperson';
      case 'SHRINKAGE': return 'role-badge-error'; // Assuming this exists or falls back to red
      case 'RETURN': return 'role-badge-warning';
      default: return 'role-badge-manager';
    }
  };

  return (
    <div className="inventory-page">
      <div className="inventory-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1>Inventory Ledger</h1>
          <p>Track stock movements and alerts.</p>
        </div>
        {hasPermission('manage_inventory') && (
          <button className="btn btn-primary" onClick={() => setIsAdjustModalOpen(true)}>
            + Adjust Stock
          </button>
        )}
      </div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '24px', padding: '16px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7' }}>
          <h3 style={{ color: '#d97706', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 9V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 17.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 3L2 21H22L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Low Stock Alerts ({lowStockProducts.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {lowStockProducts.map(p => (
              <div key={p.id} style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '14px' }}>
                <strong>{p.name}</strong> • <span style={{ color: p.stock_quantity === 0 ? '#ef4444' : '#d97706' }}>{p.stock_quantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement Ledger */}
      <div className="table-container" style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '16px' }}>Date</th>
              <th style={{ padding: '16px' }}>Product</th>
              <th style={{ padding: '16px' }}>Type</th>
              <th style={{ padding: '16px' }}>Change</th>
              <th style={{ padding: '16px' }}>User</th>
              <th style={{ padding: '16px' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center' }}>Loading movements...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No stock movements found.</td></tr>
            ) : (
              movements.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '16px', color: '#64748b' }}>{formatDate(m.created_at)}</td>
                  <td style={{ padding: '16px', fontWeight: '500' }}>
                    {m.product?.name || 'Unknown'} <br/>
                    <small style={{ color: '#94a3b8', fontWeight: 'normal' }}>{m.product?.sku}</small>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span className={`role-badge ${getTypeBadgeClass(m.movement_type)}`} style={{ fontSize: '12px', padding: '4px 8px' }}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 'bold', color: m.quantity_change > 0 ? '#10b981' : '#ef4444' }}>
                    {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                  </td>
                  <td style={{ padding: '16px' }}>{m.user?.email?.split('@')[0] || 'Unknown'}</td>
                  <td style={{ padding: '16px', color: '#64748b', fontSize: '14px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.notes || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Adjust Modal */}
      <Modal isOpen={isAdjustModalOpen} onClose={() => !adjusting && setIsAdjustModalOpen(false)} title="Adjust Stock">
        <form onSubmit={handleAdjustSubmit} className="modal-form">
          {stockError && <div className="alert alert-error"><p>{stockError}</p></div>}
          
          <div className="form-group">
            <label>Product</label>
            <select 
              required
              value={adjustData.productId}
              onChange={e => setAdjustData({...adjustData, productId: e.target.value})}
              className="form-input"
            >
              <option value="">Select a product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Current: {p.stock_quantity})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Movement Type</label>
            <select 
              required
              value={adjustData.movementType}
              onChange={e => setAdjustData({...adjustData, movementType: e.target.value})}
              className="form-input"
            >
              <option value="RECEIPT">Receive Stock (+)</option>
              <option value="ADJUSTMENT">Manual Adjustment</option>
              <option value="RETURN">Customer Return (+)</option>
              <option value="SHRINKAGE">Shrinkage / Damage (-)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Quantity Change (Absolute Number)</label>
            <input 
              type="number" 
              required
              min="1"
              value={adjustData.quantityChange}
              onChange={e => setAdjustData({...adjustData, quantityChange: e.target.value})}
              className="form-input"
              placeholder="e.g. 50"
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <input 
              type="text" 
              value={adjustData.notes}
              onChange={e => setAdjustData({...adjustData, notes: e.target.value})}
              className="form-input"
              placeholder="e.g. Received PO-1029"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsAdjustModalOpen(false)} disabled={adjusting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={adjusting || !adjustData.productId || !adjustData.quantityChange}>
              {adjusting ? 'Saving...' : 'Save Adjustment'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
