import { useState, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function SalesRecord() {
  const { hasPermission } = useAuthContext();
  
  // Date range state (default to today)
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [startDate, endDate]);

  const fetchHistory = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');
    
    // Append time to dates for full day coverage
    const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59.999Z`).toISOString();

    try {
      const data = await api.get(`/sales/history?startDate=${startIso}&endDate=${endIso}`);
      setSales(data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch sales history.');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  // --- Returns Logic ---
  const openReturnModal = (sale) => {
    setSelectedSale(sale);
    setReturnItems({});
    setIsReturnModalOpen(true);
  };

  const closeReturnModal = () => {
    setIsReturnModalOpen(false);
    setSelectedSale(null);
    setReturnItems({});
  };

  const handleQuantityChange = (itemId, maxQty, val) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 0;
    if (num < 0) num = 0;
    if (num > maxQty) num = maxQty;
    setReturnItems(prev => ({ ...prev, [itemId]: num }));
  };

  const calculateTotalRefund = () => {
    if (!selectedSale) return 0;
    let total = 0;
    selectedSale.sale_items.forEach(item => {
      const qty = returnItems[item.id] || 0;
      total += qty * item.unit_price;
    });
    return total;
  };

  const handleReturnSubmit = async () => {
    const itemsToReturn = Object.keys(returnItems)
      .map(id => ({ sale_item_id: id, return_quantity: returnItems[id] }))
      .filter(item => item.return_quantity > 0);

    if (itemsToReturn.length === 0) {
      alert('Please select at least one item to return.');
      return;
    }

    setIsProcessing(true);
    try {
      await api.post(`/returns`, {
        sale_id: selectedSale.id,
        items: itemsToReturn
      });
      alert('Return processed successfully!');
      closeReturnModal();
      fetchHistory(); // Refresh
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to process return');
    } finally {
      setIsProcessing(false);
    }
  };

  const canReturn = hasPermission('manage_business');

  if (!hasPermission('create_sales')) {
    return (
      <div className="page-header">
        <h1 className="page-title text-error">Access Denied</h1>
        <p className="page-subtitle">You do not have permission to view Sales Records.</p>
      </div>
    );
  }

  const canViewHistory = hasPermission('manage_business');

  return (
    <div className="sales-record-page">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Sales Record</h1>
          <p className="page-subtitle">
            {canViewHistory 
              ? "View historical sales data and process returns." 
              : "View today's sales data."}
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Start Date</label>
          <input 
            type="date" 
            className="form-input" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            disabled={!canViewHistory}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>End Date</label>
          <input 
            type="date" 
            className="form-input" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            disabled={!canViewHistory}
          />
        </div>
        <button className="btn btn-primary" onClick={fetchHistory} disabled={loading || !canViewHistory}>
          {loading ? 'Loading...' : 'Filter Records'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '24px' }}>{error}</div>}

      <div className="glass-panel">
        {loading ? (
          <div className="text-center py-xl text-muted">Loading historical data...</div>
        ) : sales.length === 0 ? (
          <div className="text-center py-xl text-muted">No sales found for this date range.</div>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th style={{ padding: '16px' }}>Date</th>
                <th style={{ padding: '16px' }}>Receipt #</th>
                <th style={{ padding: '16px' }}>Customer</th>
                <th style={{ padding: '16px' }}>Status</th>
                <th style={{ padding: '16px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '16px' }}>{new Date(sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</td>
                  <td style={{ padding: '16px' }}>
                    {canReturn ? (
                      <button 
                        onClick={() => openReturnModal(sale)}
                        className="btn btn-sm"
                        style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--color-primary)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {sale.receipt_number || sale.id.substring(0,8)}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {sale.receipt_number || sale.id.substring(0,8)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px' }}>
                    {sale.customer ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{sale.customer.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{sale.customer.phone}</div>
                      </div>
                    ) : <span style={{ color: 'var(--color-text-muted)' }}>Walk-in Customer</span>}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span className={`badge ${sale.return_status === 'partial' ? 'badge-warning' : sale.return_status === 'full' ? 'badge-error' : 'badge-success'}`}>
                      {sale.return_status === 'partial' ? 'Partial Return' : sale.return_status === 'full' ? 'Fully Returned' : 'Completed'}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, fontSize: '1.1rem' }}>{fmt(sale.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Returns Modal */}
      {selectedSale && (
        <Modal isOpen={isReturnModalOpen} onClose={closeReturnModal} title="Return Processing" size="large">
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Receipt #{selectedSale.receipt_number || selectedSale.id.substring(0,8)}</h3>
            <p className="text-muted">Select items below to process a return. You can return the full purchased quantity or just a partial amount.</p>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', marginBottom: '0' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center', padding: '12px' }}>Select</th>
                  <th style={{ padding: '12px' }}>Product</th>
                  <th style={{ padding: '12px' }}>Price</th>
                  <th style={{ padding: '12px' }}>Purchased</th>
                  <th style={{ padding: '12px' }}>Return Qty</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.sale_items.map(item => {
                  const currentQty = returnItems[item.id] !== undefined ? returnItems[item.id] : 0;
                  const isChecked = currentQty > 0;
                  
                  const handleCheck = () => {
                    if (isChecked) {
                      handleQuantityChange(item.id, item.quantity, 0); // Uncheck
                    } else {
                      handleQuantityChange(item.id, item.quantity, item.quantity); // Check (max)
                    }
                  };

                  return (
                    <tr key={item.id} style={{ background: isChecked ? 'rgba(239, 68, 68, 0.05)' : 'transparent', borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={handleCheck}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{item.product?.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>SKU: {item.product?.sku}</div>
                      </td>
                      <td style={{ fontWeight: 500, padding: '12px' }}>{fmt(item.unit_price)}</td>
                      <td style={{ fontWeight: 500, padding: '12px' }}>{item.quantity}</td>
                      <td style={{ width: '120px', padding: '12px' }}>
                        <input 
                          type="number" 
                          className="input" 
                          min="0" 
                          max={item.quantity}
                          value={currentQty === 0 ? '' : currentQty}
                          onChange={(e) => handleQuantityChange(item.id, item.quantity, e.target.value)}
                          style={{ width: '100%', padding: '10px', fontSize: '1.1rem', textAlign: 'center', background: isChecked ? 'white' : '#f8fafc', border: '1px solid #cbd5e1' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', background: '#fef2f2', border: '1px solid #fecaca', padding: '24px', borderRadius: '12px' }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Refund Amount</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{fmt(calculateTotalRefund())}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={closeReturnModal} disabled={isProcessing}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleReturnSubmit} 
                disabled={isProcessing || calculateTotalRefund() === 0}
                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '0 24px', fontSize: '1.1rem' }}
              >
                {isProcessing ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
