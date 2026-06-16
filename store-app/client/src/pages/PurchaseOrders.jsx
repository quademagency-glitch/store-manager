import { useState, useEffect } from 'react';
import { usePurchaseOrders } from '../hooks/usePurchaseOrders';
import { useSuppliers } from '../hooks/useSuppliers';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { useCurrency } from '../hooks/useCurrency';
import { usePrintDocument } from '../hooks/usePrintDocument';
import Modal from '../components/Modal';
import PurchaseOrderDocument from '../components/PurchaseOrderDocument';
import PurchaseOrderForm from '../features/inventory/components/PurchaseOrderForm';
import ReceiveGoodsModal from '../features/inventory/components/ReceiveGoodsModal';
import { api } from '../lib/api';

export default function PurchaseOrders() {
  const toast = useToast();
  const confirm = useConfirm();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { orders, loading, page, totalPages, totalOrders, fetchOrders, createOrder, updateOrder, sendOrder, cancelOrder, receiveGoods } = usePurchaseOrders();
  const { suppliers, fetchSuppliers } = useSuppliers();
  const { products } = useProducts();

  const [statusFilter, setStatusFilter] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Receive goods
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receivePO, setReceivePO] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');
  const [locations, setLocations] = useState([]);

  // GRN print
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnData, setGrnData] = useState(null);

  // Detail view
  const [selectedPO, setSelectedPO] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchOrders(1, statusFilter);
    fetchSuppliers();
    api.get('/locations').then(res => setLocations(res || [])).catch(() => setLocations([]));
  }, [fetchOrders, fetchSuppliers, statusFilter]);

  const statusFilters = [
    { value: '', label: 'All', count: totalOrders },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'partial', label: 'Partial' },
    { value: 'received', label: 'Received' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'badge-neutral';
      case 'sent': return 'badge-warning';
      case 'partial': return 'badge-info';
      case 'received': return 'badge-success';
      case 'cancelled': return 'badge-error';
      default: return 'badge-neutral';
    }
  };

  const handleCreate = () => {
    setEditingOrder(null);
    setFormError('');
    setIsFormOpen(true);
  };

  const handleEdit = async (po) => {
    // Fetch full PO detail for editing
    try {
      const detail = await api.get(`/purchase-orders/${po.id}`);
      setEditingOrder(detail);
      setFormError('');
      setIsFormOpen(true);
    } catch {
      toast.error('Failed to load PO for editing');
    }
  };

  const handleFormSubmit = async (data) => {
    setIsSubmitting(true);
    setFormError('');
    try {
      if (editingOrder) {
        const result = await updateOrder(editingOrder.id, data);
        if (!result.success) throw new Error(result.error);
        toast.success('Purchase order updated');
      } else {
        const result = await createOrder(data);
        if (!result.success) throw new Error(result.error);
        toast.success('Purchase order created');
      }
      setIsFormOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = async (po) => {
    const confirmed = await confirm({
      title: 'Send Purchase Order',
      message: `Mark ${po.po_number} as sent to ${po.supplier?.name || 'supplier'}?`,
      confirmText: 'Send'
    });
    if (confirmed) {
      const result = await sendOrder(po.id);
      if (result.success) toast.success('PO marked as sent');
      else toast.error(result.error);
    }
  };

  const handleCancel = async (po) => {
    const confirmed = await confirm({
      title: 'Cancel Purchase Order',
      message: `Cancel ${po.po_number}? This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Cancel PO'
    });
    if (confirmed) {
      const result = await cancelOrder(po.id);
      if (result.success) toast.success('PO cancelled');
      else toast.error(result.error);
    }
  };

  const handleReceiveOpen = async (po) => {
    try {
      const detail = await api.get(`/purchase-orders/${po.id}`);
      setReceivePO(detail);
      setReceiveError('');
      setIsReceiveOpen(true);
    } catch {
      toast.error('Failed to load PO details');
    }
  };

  const handleReceiveSubmit = async (data) => {
    setIsReceiving(true);
    setReceiveError('');
    try {
      const result = await receiveGoods(receivePO.id, data);
      if (!result.success) throw new Error(result.error);

      toast.success(result.data?.message || 'Goods received successfully');
      setIsReceiveOpen(false);

      // Show GRN print modal
      if (result.data?.grn_data) {
        setGrnData({
          ...result.data.grn_data,
          items: result.data.received_items?.map(item => {
            const product = products.find(p => p.id === item.product_id);
            return {
              product_name: product?.name || 'Unknown',
              sku: product?.sku || '',
              quantity: item.quantity,
              unit_cost: item.unit_cost
            };
          }) || [],
          purchaseOrder: result.data.purchase_order
        });
        setShowGrnModal(true);
      }
    } catch (err) {
      setReceiveError(err.message);
    } finally {
      setIsReceiving(false);
    }
  };

  const viewPODetail = async (po) => {
    setDetailLoading(true);
    try {
      const detail = await api.get(`/purchase-orders/${po.id}`);
      setSelectedPO(detail);
    } catch {
      toast.error('Failed to load PO details');
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="inventory-page">
      <div className="inventory-header page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">Create, track, and receive purchase orders from suppliers.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Create PO
        </button>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {statusFilters.map(f => (
          <button
            key={f.value}
            className={`btn btn-sm ${statusFilter === f.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStatusFilter(f.value); setSelectedPO(null); }}
            style={statusFilter === f.value ? { background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none' } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Two-column: list + detail */}
      <div className="po-grid" style={{ display: 'grid', gridTemplateColumns: selectedPO ? '1fr 1fr' : '1fr', gap: '16px' }}>
        {/* PO Table */}
        <div className="glass-panel">
          {loading ? (
            <div className="table-loading"><div className="spinner"></div><p>Loading purchase orders...</p></div>
          ) : (
            <>
              <div className="desktop-table-view">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>PO #</th><th>Supplier</th><th>Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th><th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-xl text-muted">No purchase orders found.</td></tr>
                  ) : (
                    orders.map(po => (
                      <tr
                        key={po.id}
                        style={{ cursor: 'pointer', background: selectedPO?.id === po.id ? 'rgba(99,102,241,0.06)' : undefined }}
                        onClick={() => viewPODetail(po)}
                      >
                        <td><code style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{po.po_number}</code></td>
                        <td className="font-medium">{po.supplier?.name || '—'}</td>
                        <td className="text-muted">{formatDate(po.created_at)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(po.total_amount)}</td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(po.status)}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {po.status}
                          </span>
                        </td>
                        <td className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            {po.status === 'draft' && (
                              <>
                                <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(po)} title="Edit">Edit</button>
                                <button className="btn btn-sm" onClick={() => handleSend(po)} style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', border: 'none', cursor: 'pointer' }}>Send</button>
                              </>
                            )}
                            {(po.status === 'sent' || po.status === 'partial') && (
                              <button className="btn btn-sm btn-primary" onClick={() => handleReceiveOpen(po)} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none' }}>Receive</button>
                            )}
                            {['draft', 'sent'].includes(po.status) && (
                              <button className="btn btn-sm" onClick={() => handleCancel(po)} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>

              <div className="mobile-card-view">
                {orders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No purchase orders found.</div>
                ) : orders.map(po => (
                  <div key={po.id} className="m-card" style={{ background: selectedPO?.id === po.id ? 'rgba(99,102,241,0.06)' : undefined, cursor: 'pointer' }} onClick={() => viewPODetail(po)}>
                    <div className="m-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="m-card-title" style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{po.po_number}</div>
                        <div className="m-card-sub">{po.supplier?.name || '—'}</div>
                        <div className="m-card-meta">{formatDate(po.created_at)}</div>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(po.status)}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase', flexShrink: 0 }}>{po.status}</span>
                    </div>
                    <div className="m-card-row">
                      <span className="m-card-amount">{fmt(po.total_amount)}</span>
                    </div>
                    <div className="m-card-actions" onClick={e => e.stopPropagation()}>
                      {po.status === 'draft' && (<>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(po)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => handleSend(po)} style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', border: 'none' }}>Send</button>
                      </>)}
                      {(po.status === 'sent' || po.status === 'partial') && (
                        <button className="btn btn-sm btn-primary" onClick={() => handleReceiveOpen(po)} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none' }}>Receive</button>
                      )}
                      {['draft', 'sent'].includes(po.status) && (
                        <button className="btn btn-sm" onClick={() => handleCancel(po)} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: 'none' }}>Cancel</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="text-sm text-muted">Page {page} of {totalPages} ({totalOrders} orders)</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => fetchOrders(Math.max(1, page - 1), statusFilter)} disabled={page === 1}>Previous</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => fetchOrders(Math.min(totalPages, page + 1), statusFilter)} disabled={page === totalPages}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* PO Detail Panel */}
        {selectedPO && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{selectedPO.po_number}</h2>
                  <span className={`badge ${getStatusBadgeClass(selectedPO.status)}`} style={{ textTransform: 'uppercase' }}>{selectedPO.status}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  {selectedPO.supplier?.name || 'No supplier'} • Created {formatDate(selectedPO.created_at)}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setSelectedPO(null)} title="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="table-loading"><div className="spinner"></div></div>
            ) : (
              <>
                {/* PO Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Expected Date', value: formatDate(selectedPO.expected_date) },
                    { label: 'Received Date', value: formatDate(selectedPO.received_date) },
                    { label: 'Total Amount', value: fmt(selectedPO.total_amount), highlight: true }
                  ].map(({ label, value, highlight }) => (
                    <div key={label} style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Line Items */}
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px' }}>Line Items ({selectedPO.items?.length || 0})</h3>
                <table className="glass-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'center' }}>Ordered</th>
                      <th style={{ textAlign: 'center' }}>Received</th>
                      <th style={{ textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPO.items || []).map(item => {
                      const isComplete = item.received_quantity >= item.quantity;
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="font-medium">{item.product?.name || 'Unknown'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{item.product?.sku}</div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: isComplete ? 'var(--color-success)' : item.received_quantity > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                              {item.received_quantity || 0}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.total || (item.quantity * item.unit_cost))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                      <td colSpan="4" style={{ textAlign: 'right', fontWeight: 600 }}>Grand Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)', fontSize: '1.05rem' }}>{fmt(selectedPO.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>

                {/* Notes */}
                {selectedPO.notes && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Notes</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{selectedPO.notes}</div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
                  {selectedPO.status === 'draft' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleSend(selectedPO)}>Send to Supplier</button>
                  )}
                  {(selectedPO.status === 'sent' || selectedPO.status === 'partial') && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleReceiveOpen(selectedPO)} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none' }}>Receive Goods</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit PO Modal */}
      <PurchaseOrderForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        suppliers={suppliers}
        products={products}
        editingOrder={editingOrder}
        isSubmitting={isSubmitting}
        error={formError}
      />

      {/* Receive Goods Modal */}
      <ReceiveGoodsModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        onSubmit={handleReceiveSubmit}
        purchaseOrder={receivePO}
        locations={locations}
        isSubmitting={isReceiving}
        error={receiveError}
      />

      {/* GRN Print Modal */}
      <Modal isOpen={showGrnModal} onClose={() => setShowGrnModal(false)} title="Goods Received Note" size="large">
        {grnData && (
          <div style={{ padding: '0.5rem' }}>
            <PurchaseOrderDocument
              business={business}
              items={grnData.items}
              notes={grnData.notes}
              date={grnData.date}
              purchaseOrder={grnData.purchaseOrder || null}
              fmt={fmt}
              documentType="grn"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-outline" onClick={() => setShowGrnModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => printElement('printable-grn', 'a4')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print GRN
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
