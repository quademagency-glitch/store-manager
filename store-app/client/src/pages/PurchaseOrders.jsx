import { useLocation } from 'react-router-dom';
import { useQueryState } from '../hooks/useQueryState';
import { useRecordedAction } from '../hooks/useRecordedAction';
import SavedViews from '../components/SavedViews';
import PurchaseBilling from '../features/inventory/components/PurchaseBilling';
import { useOfflineScope } from '../hooks/useOfflineScope';
import { scopeKey, saveOperationDraft, getOperationDraft, clearOperationDraft, getReceivingDrafts } from '../lib/idb';
import { useState, useEffect, useRef } from 'react';
import { useAuthContext } from '../lib/AuthContext';
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
import { taskStart, trackTask } from '../lib/analytics';
import { EmptyStateRow, SkeletonTable, ErrorBanner } from '../components/ui';

export default function PurchaseOrders() {
  const toast = useToast();
  const { hasPermission } = useAuthContext();
  const canManage = hasPermission('manage_purchases');
  const canReceive = canManage || hasPermission('receive_goods');
  const confirm = useConfirm();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { orders, loading, error: ordersError, page, totalPages, totalOrders, fetchOrders, sendOrder, cancelOrder, receiveGoods } = usePurchaseOrders();
  const { suppliers, fetchSuppliers } = useSuppliers();
  const { products } = useProducts();

  const [statusFilter, setStatusFilter] = useQueryState('status');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const scope = useOfflineScope();
  const location = useLocation();
  const initialDraft = location.state?.reorderDraft || null;
  // Anonymous timing: opening a new order to saving it, and opening a delivery to receiving it.
  const createStartedAt = useRef(null);
  const receiveStartedAt = useRef(null);
  useEffect(() => { if (initialDraft && canManage) { createStartedAt.current = taskStart(); setEditingOrder(null); setIsFormOpen(true); } }, [initialDraft, canManage]);
  const saveAction = useRecordedAction('retail:purchase', async (_result, request) => { if (request.method === 'post' && request.path === '/purchase-orders') { trackTask('purchase_order', createStartedAt.current); createStartedAt.current = null; } await clearOperationDraft(`po-form:${request.path === '/purchase-orders' ? 'new' : request.path.split('/').pop()}`, scope); await fetchOrders(1, statusFilter); setIsFormOpen(false); toast.success('Purchase order saved'); });

  // Receive goods
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const receiveAttempt = useRef(null);
  const [receiveRequest, setReceiveRequest] = useState(null);
  const [receiveLocked, setReceiveLocked] = useState(false);
  const [receivePO, setReceivePO] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');
  const [pendingDeliveries, setPendingDeliveries] = useState([]);
  const [locations, setLocations] = useState([]);

  // GRN print
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [showOrderDocument, setShowOrderDocument] = useState(false);
  const [grnData, setGrnData] = useState(null);

  // Detail view
  const [selectedPO, setSelectedPO] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => (scope ? getReceivingDrafts(scope) : Promise.resolve([]))
      .then(rows => { if (active) setPendingDeliveries(rows); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [scope, isReceiving]);

  useEffect(() => {
    fetchOrders(1, statusFilter);
    if (canManage) fetchSuppliers();
    api.get('/locations')
      .then(res => setLocations(res || []))
      .catch(() => {
        setLocations([]);
        toast.error("Couldn't load branches. Refresh to try again.");
      });
    // toast is provider-memoized and stable; listing it here would add nothing
    // but is flagged because the linter can't see that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders, fetchSuppliers, statusFilter, canManage]);

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
    createStartedAt.current = taskStart();
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
      const result = await saveAction.run(editingOrder ? `/purchase-orders/${editingOrder.id}` : '/purchase-orders', data, editingOrder ? 'put' : 'post');
      return !!result;
    } catch (err) {
      setFormError(err.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = async (po) => {
    const confirmed = await confirm({
      title: 'Mark purchase order as sent',
      message: `Mark ${po.po_number} as sent to ${po.supplier?.name || 'supplier'}?`,
      confirmText: 'Mark as sent'
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
    receiveStartedAt.current = taskStart();
    try {
      const detail = await api.get(`/purchase-orders/${po.id}`);
      receiveAttempt.current = scope ? await getOperationDraft(`receive:${po.id}`, scope) : null;
      setReceiveRequest(receiveAttempt.current); setReceiveLocked(!!receiveAttempt.current);
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
      if (!navigator.locks) throw new Error('Use a current browser to receive goods safely.');
      const result = await navigator.locks.request(`quaderp:${scopeKey(scope)}:receive:${receivePO.id}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is processing this delivery.');
        const previous = await getOperationDraft(`receive:${receivePO.id}`, scope);
        receiveAttempt.current = previous || receiveAttempt.current || { ...data, operation_id: crypto.randomUUID() };
        setReceiveRequest(receiveAttempt.current);
        await saveOperationDraft(`receive:${receivePO.id}`, receiveAttempt.current, scope);
        const response = await receiveGoods(receivePO.id, receiveAttempt.current, scope);
        response.rejectedBeforeAmbiguity = !previous && response.status >= 400 && response.status < 500 && ![401,403,409].includes(response.status);
        if (response.success || response.rejectedBeforeAmbiguity) {
          await clearOperationDraft(`receive:${receivePO.id}`, scope);
        }
        return response;
      });
      if (!result.success) {
        if (result.rejectedBeforeAmbiguity) {
          receiveAttempt.current = null; setReceiveRequest(null); setReceiveLocked(false);
        } else setReceiveLocked(true);
        throw new Error(result.error);
      }
      receiveAttempt.current = null; setReceiveLocked(false);
      trackTask('goods_received', receiveStartedAt.current); receiveStartedAt.current = null;

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
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="inventory-page">
      <div className="inventory-header page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">Create, track, and receive purchase orders from suppliers.</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={handleCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 4px 12px var(--color-accent-glow)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Create PO
        </button>}
      </div>

      {canReceive && pendingDeliveries.length > 0 && <div className="alert alert-warning" role="status" style={{ marginBottom: 16 }}>
        <p>A delivery needs confirmation. Resume its saved request even if the order already shows Received.</p>
        {pendingDeliveries.map(draft => <button key={draft.purchaseOrderId} className="btn btn-secondary btn-sm"
          disabled={isReceiving} onClick={() => handleReceiveOpen({ id: draft.purchaseOrderId })}>
          Resume delivery {orders.find(po => po.id === draft.purchaseOrderId)?.po_number || draft.purchaseOrderId.slice(0, 8)}
        </button>)}
      </div>}

      <ErrorBanner error={ordersError} onRetry={() => fetchOrders(1,statusFilter)} />
      <ErrorBanner error={saveAction.error} />
      {saveAction.pending && <div className="alert alert-warning" role="status">A purchase order save needs confirmation. <button className="btn btn-secondary" disabled={saveAction.busy} onClick={saveAction.retry}>Retry saved purchase order</button></div>}
      <SavedViews name="purchase-orders" />
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
          {ordersError ? <p className="p-md">Purchase orders are unavailable until the request succeeds.</p> : loading ? (
            <SkeletonTable rows={5} cols={6} caption="Loading purchase orders" />
          ) : (
            <>
              <div className="desktop-table-view">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>PO #</th><th>Supplier</th><th>Date</th>
                    <th className="text-right">Total</th><th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <EmptyStateRow colSpan={6} icon="dollar" title="No purchase orders found" />
                  ) : (
                    orders.map(po => (
                      <tr
                        key={po.id}
                        style={{ cursor: 'pointer', background: selectedPO?.id === po.id ? 'var(--color-accent-glow)' : undefined }}
                        onClick={() => viewPODetail(po)}
                      >
                        <td><button className="btn btn-ghost" onClick={e => {e.stopPropagation();viewPODetail(po);}}>{po.po_number}</button></td>
                        <td className="font-medium">{po.supplier?.name || '-'}</td>
                        <td className="text-muted">{formatDate(po.created_at)}</td>
                        <td className="text-right font-bold">{fmt(po.total_amount)}</td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(po.status)}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {po.status}
                          </span>
                        </td>
                        <td className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="action-buttons justify-end">
                            {canManage && po.status === 'draft' && (
                              <>
                                <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(po)} title="Edit">Edit</button>
                                <button className="btn btn-sm" onClick={() => handleSend(po)} style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: 'none', cursor: 'pointer' }}>Mark sent</button>
                              </>
                            )}
                            {canReceive && (po.status === 'sent' || po.status === 'partial') && (
                              <button className="btn btn-sm btn-primary" onClick={() => handleReceiveOpen(po)} style={{ background: 'linear-gradient(135deg, var(--color-success), #16a34a)', border: 'none' }}>Receive</button>
                            )}
                            {canManage && ['draft', 'sent'].includes(po.status) && (
                              <button className="btn btn-sm" onClick={() => handleCancel(po)} style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: 'none', cursor: 'pointer' }}>Cancel</button>
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
                  <div key={po.id} className="m-card" style={{ background: selectedPO?.id === po.id ? 'var(--color-accent-glow)' : undefined, cursor: 'pointer' }} onClick={() => viewPODetail(po)}>
                    <div className="m-card-top">
                      <div className="flex-1 min-w-0">
                        <button className="btn btn-ghost" onClick={e => {e.stopPropagation();viewPODetail(po);}}>{po.po_number}</button>
                        <div className="m-card-sub">{po.supplier?.name || '-'}</div>
                        <div className="m-card-meta">{formatDate(po.created_at)}</div>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(po.status)}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase', flexShrink: 0 }}>{po.status}</span>
                    </div>
                    <div className="m-card-row">
                      <span className="m-card-amount">{fmt(po.total_amount)}</span>
                    </div>
                    <div className="m-card-actions" onClick={e => e.stopPropagation()}>
                      {canManage && po.status === 'draft' && (<>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(po)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => handleSend(po)} style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: 'none' }}>Mark sent</button>
                      </>)}
                      {canReceive && (po.status === 'sent' || po.status === 'partial') && (
                        <button className="btn btn-sm btn-primary" onClick={() => handleReceiveOpen(po)} style={{ background: 'linear-gradient(135deg, var(--color-success), #16a34a)', border: 'none' }}>Receive</button>
                      )}
                      {canManage && ['draft', 'sent'].includes(po.status) && (
                        <button className="btn btn-sm" onClick={() => handleCancel(po)} style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: 'none' }}>Cancel</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-md border-t flex justify-between items-center">
                  <div className="text-sm text-muted">Page {page} of {totalPages} ({totalOrders} orders)</div>
                  <div className="flex gap-sm">
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
          <div className="glass-panel p-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{selectedPO.po_number}</h2>
                  <span className={`badge uppercase ${getStatusBadgeClass(selectedPO.status)}`}>{selectedPO.status}</span>
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
                      <th className="text-center">Ordered</th>
                      <th className="text-center">Received</th>
                      <th className="text-right">Unit Cost</th>
                      <th className="text-right">Total</th>
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
                          <td className="text-center font-bold">{item.quantity}</td>
                          <td className="text-center">
                            <span style={{ fontWeight: 600, color: isComplete ? 'var(--color-success)' : item.received_quantity > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                              {item.received_quantity || 0}
                            </span>
                          </td>
                          <td className="text-right">{fmt(item.unit_cost)}</td>
                          <td className="text-right font-bold">{fmt(item.total || (item.quantity * item.unit_cost))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                      <td colSpan="4" className="text-right font-bold">Grand Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)', fontSize: '1.05rem' }}>{fmt(selectedPO.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>

                <button className="btn btn-secondary" onClick={()=>setShowOrderDocument(true)}>Preview / print purchase order</button>
                {/* Notes */}
                {selectedPO.notes && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Notes</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{selectedPO.notes}</div>
                  </div>
                )}

                {hasPermission('manage_financials') && <PurchaseBilling key={selectedPO.id} order={selectedPO} fmt={fmt} />}
                <p className="workspace-status">Print or save the order and share it with your supplier. “Mark as sent” records that handoff; it does not send a message.</p>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
                  {canManage && selectedPO.status === 'draft' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleSend(selectedPO)}>Mark as sent</button>
                  )}
                  {canReceive && (selectedPO.status === 'sent' || selectedPO.status === 'partial') && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleReceiveOpen(selectedPO)} style={{ background: 'linear-gradient(135deg, var(--color-success), #16a34a)', border: 'none' }}>Receive Goods</button>
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
        initialDraft={initialDraft}
        isSubmitting={isSubmitting || saveAction.busy || !!saveAction.pending || !saveAction.ready}
        error={formError || saveAction.error}
      />

      {/* Receive Goods Modal */}
      <ReceiveGoodsModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        onSubmit={handleReceiveSubmit}
        purchaseOrder={receivePO}
        locked={receiveLocked}
        savedRequest={receiveRequest}
        activeLocationId={scope?.locationId}
        locations={locations}
        isSubmitting={isReceiving}
        error={receiveError}
      />

      <Modal isOpen={showOrderDocument} onClose={()=>setShowOrderDocument(false)} title="Purchase order document" size="lg">
        {selectedPO && <PurchaseOrderDocument business={business} purchaseOrder={selectedPO} items={(selectedPO.items || []).map(item=>({product_name:item.product?.name,sku:item.product?.sku,quantity:item.quantity,unit_cost:item.unit_cost,notes:item.notes}))} notes={selectedPO.notes} date={selectedPO.created_at} fmt={fmt} documentType="purchase_order" />}
        <button className="btn btn-primary" onClick={()=>printElement('printable-grn','a4')}>Print / save PDF</button>
      </Modal>
      {/* GRN Print Modal */}
      <Modal isOpen={showGrnModal} onClose={() => setShowGrnModal(false)} title="Goods Received Note" size="lg">
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
              <button className="btn btn-primary flex items-center gap-sm" onClick={() => printElement('printable-grn', 'a4')}>
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
