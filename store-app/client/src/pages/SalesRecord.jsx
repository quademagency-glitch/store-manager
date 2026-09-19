import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import ReceiptModal from '../features/sales/components/ReceiptModal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';

export default function SalesRecord() {
  const { hasPermission, activeLocationId } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);
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

  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  // Receipt Modal State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState(null);

  const fetchHistory = async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    setSales([]);
    try {
      if (!startDate || !endDate || startDate > endDate) throw new Error('Select a valid start and end date.');
      const qs = new URLSearchParams({ startDate, endDate, page, limit: 50 });
      const data = await api.get(`/sales/history?${qs}`);
      if (id !== requestId.current) return;
      setSales(data.data || []);
      setTotalPages(data.totalPages || 1);
      setTotalSales(data.total || 0);
    } catch (err) {
      if (id === requestId.current) setError(err.message || 'Failed to fetch sales history.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  useEffect(() => {
    fetchHistory();
    return () => { requestId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, page, activeLocationId]);

  const exportSales = async () => {
    setExporting(true);
    try {
      const blob = await api.getBlob(`/sales/export?${new URLSearchParams({ startDate, endDate })}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales_${startDate}_${endDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('All matching sales exported.');
    } catch (err) {
      toast.error(err.message || 'Failed to export sales.');
    } finally {
      setExporting(false);
    }
  };

  // Currency formatting handled by useCurrency hook above

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

  const canReturn = hasPermission('manage_returns');

  if (!hasPermission('view_sales')) {
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
      <div className="page-header mb-lg">
        <div>
          <h1 className="page-title">Sales Record</h1>
          <p className="page-subtitle">
            {canViewHistory 
              ? "View historical sales data and process returns." 
              : "View today's sales data."}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={exportSales} disabled={loading || exporting || !!error || !sales.length}>
          {exporting ? 'Exporting…' : 'Export All CSV'}
        </button>
      </div>

      <div className="glass-panel sr-date-filter-row p-lg mb-lg flex gap-md items-end flex-wrap">
        <div className="form-group mb-0">
          <label htmlFor="sales-start">Start Date</label>
          <input 
            type="date" 
            className="form-input" 
            id="sales-start"
            value={startDate} 
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            disabled={!canViewHistory}
          />
        </div>
        <div className="form-group mb-0">
          <label htmlFor="sales-end">End Date</label>
          <input 
            type="date" 
            className="form-input" 
            id="sales-end"
            value={endDate} 
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            disabled={!canViewHistory}
          />
        </div>
        <button className="btn btn-primary" onClick={fetchHistory} disabled={loading || !canViewHistory}>
          {loading ? 'Loading...' : 'Filter Records'}
        </button>
      </div>

      {error && <div className="alert alert-error mb-lg">{error}</div>}

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
                  <th className="p-md">Date</th>
                  <th className="p-md">Receipt #</th>
                  <th className="p-md">Customer</th>
                  <th className="p-md">Status</th>
                  <th className="p-md text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const isHighlighted = highlightId && sale.id === highlightId;
                  return (
                    <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: isHighlighted ? 'var(--color-accent-glow)' : 'transparent' }}>
                      <td className="p-md">
                        {new Date(sale.accounting_at || sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}
                        {isHighlighted && <div style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 'bold' }}>HIGHLIGHTED</div>}
                      </td>
                      <td className="p-md">
                        <button onClick={() => openReceiptModal(sale)} className="btn btn-sm" style={{ background: 'var(--color-border)', color: 'var(--color-primary)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                          {sale.receipt_number || sale.id.substring(0, 8)}
                        </button>
                      </td>
                      <td className="p-md">
                        {sale.customer ? (<div><div className="font-bold">{sale.customer.name}</div><div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{sale.customer.phone}</div></div>) : <span className="text-muted">Walk-in Customer</span>}
                      </td>
                      <td className="p-md">
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
                <div key={sale.id} className="m-card" style={isHighlighted ? { background: 'var(--color-accent-glow)' } : {}}>
                  <div className="m-card-top">
                    <div className="flex-1">
                      <button onClick={() => openReceiptModal(sale)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)', textDecoration: 'underline' }}>
                        #{sale.receipt_number || sale.id.substring(0, 8)}
                      </button>
                      <div className="m-card-meta">{new Date(sale.accounting_at || sale.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</div>
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
            <div className="p-md border-t flex justify-between items-center">
              <div className="text-sm text-muted">Showing {(page - 1) * 50 + 1} to {Math.min(page * 50, totalSales)} of {totalSales}</div>
              <div className="flex gap-sm">
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

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
              {canReturn && selectedReceiptSale.status === 'completed' && selectedReceiptSale.return_status !== 'full' && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => { closeReceiptModal(); navigate(`/returns?sale=${selectedReceiptSale.id}`); }}
                  style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  Process Return
                </button>
              )}
              {hasPermission('manage_business') && !selectedReceiptSale.settlement_id && !['partial','full'].includes(selectedReceiptSale.return_status) && selectedReceiptSale.status !== 'voided' && selectedReceiptSale.status !== 'void_pending' && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => handleVoidSale(selectedReceiptSale)}
                  disabled={isProcessing}
                  style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent-text)', border: '1px solid var(--color-accent-glow)', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                  Void Sale
                </button>
              )}
              {hasPermission('manage_business') && !selectedReceiptSale.settlement_id && !['partial','full'].includes(selectedReceiptSale.return_status) && selectedReceiptSale.status !== 'pending' && (
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
