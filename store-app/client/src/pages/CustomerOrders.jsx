import { useState, useEffect, useCallback } from 'react';
import { useCustomerOrders } from '../hooks/useCustomerOrders';
import { useCustomers } from '../hooks/useCustomers';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

const STATUS_LABELS = {
  draft:     { label: 'Draft',     color: 'var(--color-text-secondary)', bg: 'var(--color-bg-secondary)' },
  confirmed: { label: 'Confirmed', color: '#2563eb', bg: '#eff6ff' },
  sourcing:  { label: 'Sourcing',  color: '#d97706', bg: '#fffbeb' },
  ready:     { label: 'Ready',     color: '#059669', bg: '#ecfdf5' },
  fulfilled: { label: 'Fulfilled', color: '#7c3aed', bg: '#f5f3ff' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
};

const STATUS_ORDER = ['draft', 'confirmed', 'sourcing', 'ready', 'fulfilled', 'cancelled'];

const NEXT_STATUS = {
  draft:     'confirmed',
  confirmed: 'sourcing',
  sourcing:  'ready',
  ready:     'fulfilled',
};

const NEXT_STATUS_LABEL = {
  draft:     'Confirm Order',
  confirmed: 'Mark Sourcing',
  sourcing:  'Mark Ready',
  ready:     'Mark Fulfilled',
};

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.draft;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: s.color,
      background: s.bg,
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

function formatCurrency(amount) {
  return parseFloat(amount || 0).toFixed(2);
}

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-border)', paddingBottom: '4px',
    marginBottom: '12px', marginTop: '20px',
  }}>
    {children}
  </div>
);

// ─── Order Form (Create / Edit) ────────────────────────────────────────────────
function OrderForm({ order, onSave, onClose, loading }) {
  const [customerId, setCustomerId] = useState(order?.customer_id || '');
  const [customerSearch, setCustomerSearch] = useState(order?.customer?.name || '');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(order?.customer || null);
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustSaving, setNewCustSaving] = useState(false);
  const [newCustError, setNewCustError] = useState('');

  const [items, setItems] = useState(
    order?.items?.map(i => ({
      product_id:         i.product_id || '',
      custom_description: i.custom_description || '',
      quantity:           i.quantity,
      unit_price:         i.unit_price,
      _productName:       i.product?.name || '',
    })) || [{ product_id: '', custom_description: '', quantity: 1, unit_price: 0, _productName: '' }]
  );
  const [notes, setNotes] = useState(order?.notes || '');
  const [dueDate, setDueDate] = useState(order?.due_date || '');
  const [depositAmount, setDepositAmount] = useState(order?.deposit_amount || 0);
  const [depositPaid, setDepositPaid] = useState(order?.deposit_paid || false);
  const [productSearch, setProductSearch] = useState({});
  const [productResults, setProductResults] = useState({});

  const { searchCustomers, createCustomer } = useCustomers();

  const searchCustomer = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomerResults([]); return; }
    const results = await searchCustomers(q);
    setCustomerResults(results || []);
  }, [searchCustomers]);

  useEffect(() => {
    const t = setTimeout(() => searchCustomer(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomer]);

  const searchProduct = async (idx, q) => {
    if (!q || q.length < 2) { setProductResults(prev => ({ ...prev, [idx]: [] })); return; }
    try {
      const results = await api.get(`/products?search=${encodeURIComponent(q)}&limit=10`);
      setProductResults(prev => ({ ...prev, [idx]: results.data || [] }));
    } catch { /* ignore */ }
  };

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setCustomerResults([]);
    setShowNewCust(false);
  };

  const openNewCustForm = () => {
    setCustomerResults([]);
    setShowNewCust(true);
    setNewCustName(customerSearch.trim());
    setNewCustPhone('');
    setNewCustError('');
  };

  const handleNewCustSave = async () => {
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setNewCustError('Name and phone are required.');
      return;
    }
    setNewCustSaving(true);
    setNewCustError('');
    const res = await createCustomer({ name: newCustName.trim(), phone: newCustPhone.trim() });
    setNewCustSaving(false);
    if (res.success) {
      selectCustomer(res.customer);
      setNewCustName('');
      setNewCustPhone('');
    } else {
      setNewCustError(res.error || 'Failed to create customer.');
    }
  };

  const cancelNewCust = () => {
    setShowNewCust(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustError('');
  };

  const selectProduct = (idx, product) => {
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      product_id:   product.id,
      unit_price:   product.price || 0,
      _productName: product.name,
      custom_description: '',
    };
    setItems(updated);
    setProductSearch(prev => ({ ...prev, [idx]: product.name }));
    setProductResults(prev => ({ ...prev, [idx]: [] }));
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const addItem = () => setItems(prev => [
    ...prev,
    { product_id: '', custom_description: '', quantity: 1, unit_price: 0, _productName: '' }
  ]);

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const total = items.reduce((sum, i) => sum + (i.quantity * parseFloat(i.unit_price || 0)), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!customerId) { return; }

    const cleanItems = items.map(i => ({
      product_id:         i.product_id || null,
      custom_description: i.custom_description || null,
      quantity:           parseInt(i.quantity, 10),
      unit_price:         parseFloat(i.unit_price) || 0,
    }));

    onSave({
      customer_id:    customerId,
      items:          cleanItems,
      notes,
      due_date:       dueDate || null,
      deposit_amount: parseFloat(depositAmount) || 0,
      deposit_paid:   depositPaid,
    });
  };

  const isEditingActiveOrder = order && order.status !== 'draft';
  const showCustomerDropdown = !customerId && (customerResults.length > 0 || (customerSearch.length >= 2 && !showNewCust));

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Customer ── */}
      <SectionLabel>Customer</SectionLabel>
      <div className="form-group" style={{ position: 'relative' }}>
        <input
          type="text"
          className="input"
          placeholder="Search by name or phone..."
          value={customerSearch}
          onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(''); setSelectedCustomer(null); setShowNewCust(false); }}
          required={!customerId}
          disabled={!!order}
        />
        {customerId && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px', display: 'block' }}>
            {selectedCustomer?.phone}
            {selectedCustomer?.customer_code && <> &middot; {selectedCustomer.customer_code}</>}
            {!order && (
              <button type="button" onClick={() => { setCustomerId(''); setSelectedCustomer(null); setCustomerSearch(''); }}
                style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '0.75rem', textDecoration: 'underline' }}>
                Change
              </button>
            )}
          </span>
        )}

        {showCustomerDropdown && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxHeight: '220px', overflowY: 'auto',
          }}>
            {customerResults.map(c => (
              <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{c.phone}</div>
              </button>
            ))}
            <button type="button" onClick={openNewCustForm}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
              + Add New Customer
            </button>
          </div>
        )}

        {showNewCust && (
          <div style={{
            border: '1px dashed var(--color-border-focus)', borderRadius: 'var(--radius-md)',
            padding: '12px', marginTop: '8px', background: 'var(--color-bg-secondary)',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
              New Customer
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="Full name *"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                autoFocus
              />
              <input
                type="tel"
                className="input"
                placeholder="Phone number (e.g. +1234567890) *"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
              />
              {newCustError && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{newCustError}</div>
              )}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={cancelNewCust}>
                  Cancel
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={handleNewCustSave} disabled={newCustSaving}>
                  {newCustSaving ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Order Items ── */}
      <SectionLabel>
        <span>Order Items</span>
      </SectionLabel>
      <div className="form-group">
        {!isEditingActiveOrder && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={addItem}>+ Add Item</button>
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} style={{
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            padding: '12px', marginBottom: '8px',
          }}>
            {!isEditingActiveOrder && (
              <div style={{ marginBottom: '8px', position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search catalog product..."
                  value={productSearch[idx] ?? item._productName}
                  onChange={(e) => {
                    setProductSearch(prev => ({ ...prev, [idx]: e.target.value }));
                    updateItem(idx, 'product_id', '');
                    updateItem(idx, '_productName', '');
                    searchProduct(idx, e.target.value);
                  }}
                />
                {(productResults[idx] || []).length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxHeight: '160px', overflowY: 'auto',
                  }}>
                    {productResults[idx].map(p => (
                      <button key={p.id} type="button" onClick={() => selectProduct(idx, p)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                          background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{p.sku} &mdash; {formatCurrency(p.price)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="Custom / bespoke description (if not in catalog)"
                value={item.custom_description}
                onChange={(e) => updateItem(idx, 'custom_description', e.target.value)}
                disabled={isEditingActiveOrder}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr) 1fr auto', gap: '8px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Qty</label>
                <input type="number" className="input" min="1" value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                  disabled={isEditingActiveOrder} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Unit Price</label>
                <input type="number" className="input" min="0" step="0.01" value={item.unit_price}
                  onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                  disabled={isEditingActiveOrder} />
              </div>
              <div style={{ textAlign: 'right', fontWeight: 600, paddingBottom: '6px' }}>
                {formatCurrency(item.quantity * (parseFloat(item.unit_price) || 0))}
              </div>
              {!isEditingActiveOrder && (
                <button type="button" onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  style={{ background: 'transparent', border: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                    color: items.length === 1 ? 'var(--color-text-muted)' : 'var(--color-error)',
                    fontSize: '1.2rem', lineHeight: 1, paddingBottom: '4px' }}>
                  &times;
                </button>
              )}
            </div>
          </div>
        ))}

        <div style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', marginTop: '4px',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Order Total</span>
          <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{formatCurrency(total)}</span>
        </div>
      </div>

      {/* ── Payment ── */}
      <SectionLabel>Payment</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
        <div className="form-group">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Deposit Amount</label>
          <input type="number" className="input" min="0" step="0.01"
            value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        </div>
        <div className="form-group" style={{ paddingBottom: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={depositPaid} onChange={(e) => setDepositPaid(e.target.checked)} />
            Deposit Paid
          </label>
        </div>
      </div>

      {/* ── Details ── */}
      <SectionLabel>Details</SectionLabel>
      <div className="form-group">
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Due Date</label>
        <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Notes</label>
        <textarea className="input" rows={3} style={{ resize: 'vertical' }}
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Special instructions, sourcing notes..." />
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading || !customerId}>
          {loading ? 'Saving...' : (order ? 'Save Changes' : 'Create Order')}
        </button>
      </div>
    </form>
  );
}

// ─── Order Detail Panel ─────────────────────────────────────────────────────────
function OrderDetail({ order, onStatusChange, onEdit, onClose, loading, canAdmin }) {
  const nextStatus = NEXT_STATUS[order.status];
  const nextLabel  = NEXT_STATUS_LABEL[order.status];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{order.order_number}</div>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {order.customer?.name} &middot; {order.customer?.phone}
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Items */}
      <div className="glass-panel" style={{ marginBottom: '16px', padding: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Price</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '8px 0' }}>
                  {item.product?.name || item.custom_description || '—'}
                  {item.product?.sku && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{item.product.sku}</div>}
                  {!item.product_id && item.custom_description && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Custom item</div>
                  )}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 0' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right', padding: '8px 0' }}>{formatCurrency(item.unit_price)}</td>
                <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>
                  {formatCurrency(item.quantity * parseFloat(item.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', padding: '10px 0', fontWeight: 700 }}>Order Total</td>
              <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: 700, fontSize: '1.1rem' }}>
                {formatCurrency(order.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        {order.due_date && (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Due Date</div>
            <div style={{ fontWeight: 600 }}>{new Date(order.due_date).toLocaleDateString()}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Deposit</div>
          <div style={{ fontWeight: 600 }}>
            {formatCurrency(order.deposit_amount)}
            {order.deposit_paid
              ? <span className="badge badge-success ml-sm" style={{ fontSize: '0.65rem' }}>Paid</span>
              : <span className="badge ml-sm" style={{ fontSize: '0.65rem', background: 'var(--color-bg-secondary)' }}>Unpaid</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Created</div>
          <div>{new Date(order.created_at).toLocaleDateString()}</div>
        </div>
        {order.fulfilled_at && (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Fulfilled</div>
            <div>{new Date(order.fulfilled_at).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {order.notes && (
        <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{order.notes}</div>
        </div>
      )}

      {/* Actions */}
      <div className="co-detail-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onClose}>Close</button>

        {order.status === 'draft' && canAdmin && (
          <button className="btn btn-outline" onClick={onEdit}>Edit</button>
        )}
        {!['fulfilled', 'cancelled'].includes(order.status) && canAdmin && (
          <button className="btn btn-outline text-error"
            onClick={() => onStatusChange(order.id, 'cancelled')} disabled={loading}>
            Cancel Order
          </button>
        )}
        {nextStatus && (
          <button className="btn btn-primary"
            onClick={() => onStatusChange(order.id, nextStatus)} disabled={loading}>
            {loading ? 'Updating...' : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function CustomerOrders() {
  const { orders, loading, error, page, totalPages, total, fetchOrders, createOrder, updateOrder, updateStatus, deleteOrder } = useCustomerOrders();
  const { role } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();

  const canAdmin = role === 'Business Admin' || role === 'Platform Admin';

  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    fetchOrders(1, { status: statusFilter });
  }, [statusFilter, fetchOrders]);

  const handleCreate = async (payload) => {
    const res = await createOrder(payload);
    if (res.success) {
      toast.success('Customer order created');
      setIsCreateOpen(false);
      fetchOrders(1, { status: statusFilter });
    } else {
      toast.error(res.error || 'Failed to create order');
    }
  };

  const handleUpdate = async (payload) => {
    const res = await updateOrder(selectedOrder.id, payload);
    if (res.success) {
      toast.success('Order updated');
      setIsEditOpen(false);
      setSelectedOrder(res.order);
      fetchOrders(page, { status: statusFilter });
    } else {
      toast.error(res.error || 'Failed to update order');
    }
  };

  const handleStatusChange = async (id, status) => {
    const res = await updateStatus(id, status);
    if (res.success) {
      toast.success(`Order moved to "${STATUS_LABELS[status]?.label}"`);
      setIsDetailOpen(false);
      fetchOrders(page, { status: statusFilter });
    } else {
      toast.error(res.error || 'Failed to update status');
    }
  };

  const handleDelete = async (order) => {
    const confirmed = await confirm({
      title: 'Delete Order',
      message: `Delete order ${order.order_number}? This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    const res = await deleteOrder(order.id);
    if (res.success) {
      toast.success('Order deleted');
    } else {
      toast.error(res.error || 'Failed to delete order');
    }
  };

  const openDetail = (order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-title">Customer Orders</h1>
          <p className="dashboard-subtitle">Special and custom orders placed by customers.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
          + New Order
        </button>
      </header>

      {error && <div className="alert alert-error mb-xl">{error}</div>}

      {/* Status filter tabs */}
      <div className="co-status-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[{ value: '', label: `All (${total})` }, ...STATUS_ORDER.map(s => ({ value: s, label: STATUS_LABELS[s].label }))].map(tab => (
          <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
            className={statusFilter === tab.value ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="glass-panel mt-xl co-desktop-table">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Due Date</th>
              <th>Deposit</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner mx-auto"></div>
                  <p className="mt-sm text-muted">Loading orders...</p>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                  No customer orders found.
                  {statusFilter && <span> Try clearing the filter.</span>}
                </td>
              </tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(order)}>
                  <td style={{ fontWeight: 600 }}>{order.order_number}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{order.customer?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{order.customer?.phone}</div>
                  </td>
                  <td>{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(order.total_amount)}</td>
                  <td className="text-muted">
                    {order.due_date ? new Date(order.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    {parseFloat(order.deposit_amount) > 0 ? (
                      <span>
                        {formatCurrency(order.deposit_amount)}
                        {order.deposit_paid
                          ? <span className="badge badge-success ml-sm" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Paid</span>
                          : <span className="badge ml-sm" style={{ fontSize: '0.65rem', padding: '1px 6px', background: 'var(--color-bg-secondary)' }}>Due</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td><StatusBadge status={order.status} /></td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-outline mr-sm" onClick={() => openDetail(order)}>View</button>
                    {canAdmin && ['draft', 'cancelled'].includes(order.status) && (
                      <button className="btn btn-sm btn-outline text-error" onClick={() => handleDelete(order)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="text-sm text-muted">Page {page} of {totalPages}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm"
                onClick={() => fetchOrders(Math.max(1, page - 1), { status: statusFilter })}
                disabled={page === 1}>Previous</button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => fetchOrders(Math.min(totalPages, page + 1), { status: statusFilter })}
                disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile card list — shown on ≤640px */}
      <div className="glass-panel mt-xl co-mobile-cards" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner mx-auto" />
            <p className="mt-sm text-muted">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
            No customer orders found.
            {statusFilter && <span> Try clearing the filter.</span>}
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="co-order-card" onClick={() => openDetail(order)}>
              <div className="co-card-header">
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{order.order_number}</span>
                <StatusBadge status={order.status} />
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {order.customer?.name}
                {order.customer?.phone && <span> &middot; {order.customer.phone}</span>}
              </div>
              <div className="co-card-row">
                <span>{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</span>
                <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
                  {formatCurrency(order.total_amount)}
                </span>
              </div>
              {(order.due_date || parseFloat(order.deposit_amount) > 0) && (
                <div className="co-card-row">
                  <span>{order.due_date ? `Due ${new Date(order.due_date).toLocaleDateString()}` : ''}</span>
                  {parseFloat(order.deposit_amount) > 0 && (
                    <span>
                      Dep: {formatCurrency(order.deposit_amount)}
                      <span style={{ marginLeft: '3px', color: order.deposit_paid ? '#059669' : '#dc2626' }}>
                        {order.deposit_paid ? '✓' : '!'}
                      </span>
                    </span>
                  )}
                </div>
              )}
              <div className="co-card-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => openDetail(order)}>
                  View
                </button>
                {canAdmin && ['draft', 'cancelled'].includes(order.status) && (
                  <button className="btn btn-sm btn-outline text-error" style={{ flex: 1 }} onClick={() => handleDelete(order)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {totalPages > 1 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="text-sm text-muted">Page {page} of {totalPages}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm"
                onClick={() => fetchOrders(Math.max(1, page - 1), { status: statusFilter })}
                disabled={page === 1}>Prev</button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => fetchOrders(Math.min(totalPages, page + 1), { status: statusFilter })}
                disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Customer Order">
        <OrderForm loading={loading} onSave={handleCreate} onClose={() => setIsCreateOpen(false)} />
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={isDetailOpen && !isEditOpen} onClose={() => setIsDetailOpen(false)} title="Order Details">
        {selectedOrder && (
          <OrderDetail
            order={selectedOrder}
            loading={loading}
            canAdmin={canAdmin}
            onStatusChange={handleStatusChange}
            onEdit={() => setIsEditOpen(true)}
            onClose={() => setIsDetailOpen(false)}
          />
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit ${selectedOrder?.order_number}`}>
        {selectedOrder && (
          <OrderForm
            order={selectedOrder}
            loading={loading}
            onSave={handleUpdate}
            onClose={() => setIsEditOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
