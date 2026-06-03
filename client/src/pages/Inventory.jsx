import { useState, useEffect, useMemo } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useStock } from '../hooks/useStock';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Inventory() {
  const { hasPermission } = useAuthContext();
  const { products } = useProducts();
  const { movements, loading: stockLoading, fetchMovements, adjustStock, error: stockError } = useStock();

  const [locations, setLocations] = useState([]);

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustData, setAdjustData] = useState({
    productId: '',
    locationId: '',
    quantityChange: '',
    movementType: 'RECEIPT',
    notes: ''
  });
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    fetchMovements();
    api.get('/locations').then(res => setLocations(res)).catch(() => setLocations([]));
  }, [fetchMovements]);

  // Low stock products
  const lowStockProducts = useMemo(() => {
    const alerts = [];
    products.forEach(p => {
      p.product_inventory?.forEach(inv => {
        if (inv.quantity <= inv.low_stock_threshold) {
          alerts.push({ ...p, loc_id: inv.location_id, quantity: inv.quantity, threshold: inv.low_stock_threshold });
        }
      });
    });
    return alerts;
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
      adjustData.locationId,
      adjustData.notes
    );

    if (result.success) {
      setIsAdjustModalOpen(false);
      setAdjustData({ productId: '', locationId: '', quantityChange: '', movementType: 'RECEIPT', notes: '' });
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
            {lowStockProducts.map((p, idx) => (
              <div key={`${p.id}-${idx}`} style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '14px' }}>
                <strong>{p.name}</strong> • <span style={{ color: p.quantity === 0 ? '#ef4444' : '#d97706' }}>{p.quantity} left</span> 
                {locations.length > 1 && <span style={{ color: '#94a3b8' }}> @ {locations.find(l => l.id === p.loc_id)?.name || 'Unknown Loc'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement Ledger */}
      <div className="glass-panel" style={{ marginTop: '1rem' }}>
        <table className="glass-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Type</th>
              <th>Change</th>
              <th>User</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan="6" className="text-center py-xl text-muted">Loading movements...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-xl text-muted">No stock movements found.</td></tr>
            ) : (
              movements.map(m => (
                <tr key={m.id}>
                  <td className="text-muted">{formatDate(m.created_at)}</td>
                  <td className="font-medium">
                    {m.product?.name || 'Unknown'} <br/>
                    <small className="text-muted font-normal">{m.product?.sku}</small>
                  </td>
                  <td>
                    <span className={`role-badge ${getTypeBadgeClass(m.movement_type)}`} style={{ fontSize: '12px', padding: '4px 8px' }}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="font-bold" style={{ color: m.quantity_change > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                  </td>
                  <td>{m.user?.email?.split('@')[0] || 'Unknown'}</td>
                  <td className="text-muted" style={{ fontSize: '14px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Location</label>
            <select 
              required
              value={adjustData.locationId}
              onChange={e => setAdjustData({...adjustData, locationId: e.target.value})}
              className="form-input"
            >
              <option value="">Select a location...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
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
