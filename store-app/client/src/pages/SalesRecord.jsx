import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import ReceiptModal from '../features/sales/components/ReceiptModal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';

export default function SalesRecord() {
  const { hasPermission } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [searchParams] = useSearchParams();
  
  // Date range state (default to today or URL param)
  const today = new Date().toISOString().split('T')[0];
  const urlDate = searchParams.get('date');
  const highlightId = searchParams.get('highlight');
  
  const [startDate, setStartDate] = useState(urlDate || today);
  const [endDate, setEndDate] = useState(urlDate || today);
  
  const [sales, setSales] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState(null);

  const fetchHistory = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');
    
    // Append time to dates for full day coverage
    const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59.999Z`).toISOString();

    try {
      const data = await api.get(`/sales/history?startDate=${startIso}&endDate=${endIso}&page=${page}&limit=50`);
      setSales(data.data || []);
      setTotalPages(data.totalPages || 1);
      setTotalSales(data.total || 0);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('Failed to fetch sales history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, page]);

  // Currency formatting handled by useCurrency hook above

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
      toast.warning('Please select at least one item to return.');
      return;
    }

    setIsProcessing(true);
    try {
      await api.post(`/returns`, {
        sale_id: selectedSale.id,
        items: itemsToReturn
      });
      toast.success('Return processed successfully!');
      closeReturnModal();
      fetchHistory(); // Refresh
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast.error(err.message || 'Failed to process return');
    } finally {
      setIsProcessing(false);
    }
  };

  const openReceiptModal = (sale) => {
    setSelectedReceiptSale(sale);
    setIsReceiptModalOpen(true);
  };

  const closeReceiptModal = () => {
    setIsReceiptModalOpen(false);
    setSelectedReceiptSale(null);
  };

  const handleVoidSale = async (sale) => {
    const confirmed = await confirm({ title: 'Void Sale', message: `Are you sure you want to void sale #${sale.receipt_number || sale.id.substring(0,8)}?`, variant: 'danger', confirmText: 'Void Sale' });
    if (!confirmed) return;
    setIsProcessing(true);
    try {
      await api.put(`/sales/${sale.id}/void`);
      toast.success('Sale voided successfully!');
      closeReceiptModal();
      fetchHistory();
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast.error(err.message || 'Failed to void sale');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSale = async (sale) => {
    const confirmed = await confirm({ title: 'Delete Sale', message: `CRITICAL: Are you sure you want to PERMANENTLY delete sale #${sale.receipt_number || sale.id.substring(0,8)}? This action cannot be undone.`, variant: 'danger', confirmText: 'Delete Permanently' });
    if (!confirmed) return;
    setIsProcessing(true);
    try {
      await api.delete(`/sales/${sale.id}`);
      toast.success('Sale deleted successfully!');
      closeReceiptModal();
      fetchHistory();
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast.error(err.message || 'Failed to delete sale');
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
          <>
          {/* Desktop table */}
          <div className="desktop-table-view">
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
                {sales.map(sale => {
                  const isHighlighted = highlightId && sale.id === highlightId;
                  return (
                    <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: isHighlighted ? 'rgba(79,70,229,0.05)' : 'transparent' }}>
                      <td style={{ padding: '16px' }}>
                        {new Date(sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}
                        {isHighlighted && <div style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 'bold' }}>HIGHLIGHTED</div>}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <button onClick={() => openReceiptModal(sale)} className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--color-primary)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                          {sale.receipt_number || sale.id.substring(0, 8)}
                        </button>
                      </td>
                      <td style={{ padding: '16px' }}>
                        {sale.customer ? (<div><div style={{ fontWeight: 600 }}>{sale.customer.name}</div><div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{sale.customer.phone}</div></div>) : <span style={{ color: 'var(--color-text-muted)' }}>Walk-in Customer</span>}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span className={`badge ${sale.return_status === 'partial' ? 'badge-warning' : sale.return_status === 'full' ? 'badge-error' : 'badge-success'}`}>
                          {sale.return_status === 'partial' ? 'Partial Return' : sale.return_status === 'full' ? 'Fully Returned' : 'Completed'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, fontSize: '1.1rem' }}>{fmt(sale.total_amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mobile-card-view">
            {sales.map(sale => {
              const isHighlighted = highlightId && sale.id === highlightId;
              return (
                <div key={sale.id} className="m-card" style={isHighlighted ? { background: 'rgba(79,70,229,0.05)' } : {}}>
                  <div className="m-card-top">
                    <div style={{ flex: 1 }}>
                      <button onClick={() => openReceiptModal(sale)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)', textDecoration: 'underline' }}>
                        #{sale.receipt_number || sale.id.substring(0, 8)}
                      </button>
                      <div className="m-card-meta">{new Date(sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</div>
                      <div className="m-card-sub">{sale.customer ? `${sale.customer.name}${sale.customer.phone ? ' · ' + sale.customer.phone : ''}` : 'Walk-in Customer'}</div>
                    </div>
                    <span className={`badge ${sale.return_status === 'partial' ? 'badge-warning' : sale.return_status === 'full' ? 'badge-error' : 'badge-success'}`} style={{ flexShrink: 0, fontSize: '0.7rem' }}>
                      {sale.return_status === 'partial' ? 'Partial' : sale.return_status === 'full' ? 'Returned' : 'Completed'}
                    </span>
                  </div>
                  <div className="m-card-row">
                    <span className="m-card-amount">{fmt(sale.total_amount)}</span>
                    <button className="btn btn-sm btn-outline" onClick={() => openReceiptModal(sale)}>View Receipt</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="text-sm text-muted">Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, totalSales)} of {totalSales}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
              </div>
            </div>
          )}
          </>
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

      {/* Receipt & Actions Modal */}
      {selectedReceiptSale && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={closeReceiptModal}
          receiptData={selectedReceiptSale}
          fmt={fmt}
          business={business}
          actions={
            <>
              {canReturn && selectedReceiptSale.status !== 'voided' && selectedReceiptSale.return_status !== 'full' && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => { closeReceiptModal(); openReturnModal(selectedReceiptSale); }}
                  style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  Process Return
                </button>
              )}
              {canReturn && selectedReceiptSale.status !== 'voided' && selectedReceiptSale.status !== 'void_pending' && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => handleVoidSale(selectedReceiptSale)}
                  disabled={isProcessing}
                  style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                  Void Sale
                </button>
              )}
              {hasPermission('manage_business') && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => handleDeleteSale(selectedReceiptSale)}
                  disabled={isProcessing}
                  style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)', border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                  Delete Sale
                </button>
              )}
            </>
          }
        />
      )}
    </div>
  );
}
