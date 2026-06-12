import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import LetterheadRenderer, { LetterheadFooter } from '../components/LetterheadRenderer';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';

export default function Returns() {
  const { user } = useAuthContext();
  const toast = useToast();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [searchType, setSearchType] = useState('receipt');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Return Processing State
  const [selectedSale, setSelectedSale] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItems, setReturnItems] = useState({}); // { sale_item_id: quantity_to_return }
  const [returnReason, setReturnReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Refund Receipt State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [refundReceiptData, setRefundReceiptData] = useState(null);

  // Security Check: Only Admins
  const role = user?.user_metadata?.role || '';
  const isAdmin = role === 'Business Admin' || role === 'Platform Admin';

  if (!isAdmin) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1 className="text-error">Unauthorized Access</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      const res = await api.get(`/returns/search?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res || []);
      if (res.length === 0) setError('No completed sales found matching your search.');
    } catch (err) {
      setError(err.message || 'Failed to search for sales.');
    } finally {
      setIsLoading(false);
    }
  };

  const openReturnModal = (sale) => {
    setSelectedSale(sale);
    setReturnItems({});
    setReturnReason('');
    setShowReturnModal(true);
  };

  const handleQuantityChange = (itemId, maxQty, value) => {
    if (value === '') {
      setReturnItems(prev => ({ ...prev, [itemId]: '' }));
      return;
    }
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty < 0) return;
    if (qty > maxQty) return;

    setReturnItems(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  const calculateTotalRefund = () => {
    if (!selectedSale) return 0;
    let total = 0;
    selectedSale.sale_items.forEach(item => {
      const returnQty = parseInt(returnItems[item.id], 10) || 0;
      total += returnQty * item.unit_price;
    });
    return total;
  };

  const processReturn = async () => {
    const itemsToReturn = [];
    selectedSale.sale_items.forEach(item => {
      const qty = parseInt(returnItems[item.id], 10) || 0;
      if (qty > 0) {
        itemsToReturn.push({
          sale_item_id: item.id,
          product_id: item.product_id,
          quantity: qty,
          unit_price: item.unit_price,
          unit_ids: []
        });
      }
    });

    if (itemsToReturn.length === 0) {
      toast.warning('Please select at least one item to return.');
      return;
    }

    setIsProcessing(true);
    try {
      await api.post('/returns', {
        sale_id: selectedSale.id,
        items: itemsToReturn,
        reason: returnReason
      });
      
      const refundData = {
        receiptNumber: selectedSale.receipt_number || selectedSale.id.substring(0,8),
        customerName: selectedSale.customers ? selectedSale.customers.name : 'Walk-in Customer',
        items: itemsToReturn.map(rtnItem => {
          const original = selectedSale.sale_items.find(si => si.id === rtnItem.sale_item_id);
          return {
            name: original?.product?.name || 'Unknown',
            sku: original?.product?.sku || '',
            qty: rtnItem.quantity,
            price: rtnItem.unit_price,
            total: rtnItem.quantity * rtnItem.unit_price
          };
        }),
        totalRefund: calculateTotalRefund(),
        reason: returnReason,
        date: new Date().toISOString(),
        processedBy: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
      };

      setRefundReceiptData(refundData);
      setShowReturnModal(false);
      setSelectedSale(null);
      setShowReceiptModal(true);
      
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      toast.error(err.message || 'Failed to process return.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintRefund = () => {
    printElement('refund-receipt-print-area', 'a4');
  };

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem', gap: '1rem' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
        <div>
          <h1 className="dashboard-title" style={{ margin: 0 }}>Returns & Reversals</h1>
          <p className="text-muted" style={{ margin: 0 }}>Process customer refunds and inventory restocks.</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '2rem', background: 'var(--color-bg-secondary)' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input 
              type="text" 
              className="input" 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="Search by Receipt Number, Customer Name, or Phone Number..."
              style={{ width: '100%', padding: '16px 16px 16px 48px', fontSize: '1.1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}
              autoFocus
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={isLoading || !searchQuery.trim()} style={{ height: '54px', padding: '0 32px', fontSize: '1.1rem', borderRadius: 'var(--radius-lg)' }}>
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="alert alert-error mb-xl"><p>{error}</p></div>}

      {searchResults.length > 0 && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          {/* Desktop table */}
          <div className="desktop-table-view">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--color-bg-secondary)' }}>
                <tr>
                  <th style={{ padding: '16px' }}>Date</th>
                  <th style={{ padding: '16px' }}>Receipt #</th>
                  <th style={{ padding: '16px' }}>Customer</th>
                  <th style={{ padding: '16px' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map(sale => (
                  <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '16px' }}>{new Date(sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</td>
                    <td style={{ padding: '16px' }}>
                      <button onClick={() => openReturnModal(sale)} className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--color-primary)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                        {sale.receipt_number || sale.id.substring(0, 8)}
                      </button>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {sale.customers ? (<div><div style={{ fontWeight: 600 }}>{sale.customers.name}</div><div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{sale.customers.phone}</div></div>) : <span style={{ color: 'var(--color-text-muted)' }}>Walk-in Customer</span>}
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
          </div>
          {/* Mobile cards */}
          <div className="mobile-card-view">
            {searchResults.map(sale => (
              <div key={sale.id} className="m-card">
                <div className="m-card-top">
                  <div style={{ flex: 1 }}>
                    <div className="m-card-title">{sale.customers ? sale.customers.name : 'Walk-in Customer'}</div>
                    {sale.customers?.phone && <div className="m-card-sub">{sale.customers.phone}</div>}
                    <div className="m-card-meta">{new Date(sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })} · #{sale.receipt_number || sale.id.substring(0, 8)}</div>
                  </div>
                  <span className={`badge ${sale.return_status === 'partial' ? 'badge-warning' : sale.return_status === 'full' ? 'badge-error' : 'badge-success'}`} style={{ flexShrink: 0, fontSize: '0.7rem' }}>
                    {sale.return_status === 'partial' ? 'Partial' : sale.return_status === 'full' ? 'Returned' : 'Completed'}
                  </span>
                </div>
                <div className="m-card-row">
                  <span className="m-card-amount">{fmt(sale.total_amount)}</span>
                </div>
                <div className="m-card-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => openReturnModal(sale)}>Process Return</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Processing Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title={`Process Return: ${selectedSale?.receipt_number || ''}`}>
        {selectedSale && (
          <div style={{ padding: '0.5rem' }}>
            <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
              <strong style={{ color: 'var(--color-error)' }}>Select items and quantities to return:</strong>
            </div>

            <table className="table" style={{ width: '100%', marginBottom: '24px' }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>Select</th>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Purchased</th>
                  <th>Return Qty</th>
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
                    <tr key={item.id} style={{ background: isChecked ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={handleCheck}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.product?.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>SKU: {item.product?.sku}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{fmt(item.unit_price)}</td>
                      <td style={{ fontWeight: 500 }}>{item.quantity}</td>
                      <td style={{ width: '120px' }}>
                        <input 
                          type="number" 
                          className="input" 
                          min="0" 
                          max={item.quantity}
                          value={currentQty}
                          onChange={(e) => handleQuantityChange(item.id, item.quantity, e.target.value)}
                          style={{ width: '100%', padding: '10px', fontSize: '1.1rem', textAlign: 'center', background: isChecked ? 'white' : 'var(--color-bg-tertiary)' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="form-group" style={{ marginBottom: '32px' }}>
              <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Reason for Return</label>
              <textarea 
                className="input" 
                rows="3" 
                value={returnReason} 
                onChange={(e) => setReturnReason(e.target.value)} 
                placeholder="e.g., Defective, Changed mind, Wrong size..." 
                style={{ width: '100%', padding: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '24px', borderTop: '1px dashed var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Total Refund Amount</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-error)' }}>
                  {fmt(calculateTotalRefund())}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <button className="btn btn-outline" style={{ padding: '12px 24px' }} onClick={() => setShowReturnModal(false)} disabled={isProcessing}>Cancel</button>
                <button className="btn btn-primary" style={{ background: 'var(--color-error)', border: 'none', padding: '12px 24px', fontWeight: 700 }} onClick={processReturn} disabled={isProcessing || calculateTotalRefund() === 0}>
                  {isProcessing ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Refund Receipt Modal */}
      <Modal isOpen={showReceiptModal} onClose={() => setShowReceiptModal(false)} title="Refund Receipt">
        {refundReceiptData && (
          <div style={{ padding: '0.5rem' }}>
            <div id="refund-receipt-print-area" className="printable-area" style={{ padding: '32px', background: 'white', color: '#1e293b', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: '"Inter", -apple-system, sans-serif' }}>
              
              {/* Letterhead */}
              <LetterheadRenderer
                letterhead={business?.letterhead}
                logoUrl={business?.logo_url}
                businessName={business?.name}
              />

              {/* Document Title */}
              <div style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px dashed #cbd5e1' }}>
                <h2 style={{ margin: '12px 0 8px 0', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#dc2626' }}>
                  REFUND NOTE
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Original Receipt #: {refundReceiptData.receiptNumber}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Date: {new Date(refundReceiptData.date).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Customer: {refundReceiptData.customerName}
                </div>
              </div>
              
              {/* Items Table */}
              <table style={{ width: '100%', marginBottom: '24px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Item</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>SKU</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Unit Price</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {refundReceiptData.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{item.name}</td>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748b' }}>{item.sku || '—'}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600 }}>{item.qty}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontFamily: 'monospace' }}>{fmt(item.price)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Refund */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #334155', paddingTop: '16px', fontWeight: 800, fontSize: '1.2rem', color: '#dc2626' }}>
                <span>TOTAL REFUND</span>
                <span>{fmt(refundReceiptData.totalRefund)}</span>
              </div>
              
              {/* Reason */}
              {refundReceiptData.reason && (
                <div style={{ marginTop: '20px', padding: '12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#991b1b', marginBottom: '4px' }}>Reason for Return</div>
                  <div style={{ fontSize: '0.9rem', color: '#475569' }}>{refundReceiptData.reason}</div>
                </div>
              )}

              {/* Processed By */}
              <div style={{ marginTop: '20px', fontSize: '0.82rem', color: '#64748b' }}>
                Processed by: <strong>{refundReceiptData.processedBy}</strong>
              </div>

              {/* Footer */}
              <LetterheadFooter letterhead={business?.letterhead} />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '24px' }}>
              <button className="btn btn-outline" onClick={() => setShowReceiptModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={handlePrintRefund} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print Refund Note
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
