import { useState, useEffect, useMemo } from 'react';
import { useSuppliers } from '../hooks/useSuppliers';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { useCurrency } from '../hooks/useCurrency';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { api } from '../lib/api';
import SupplierModal from '../features/inventory/components/SupplierModal';

export default function Suppliers() {
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { suppliers, loading, fetchSuppliers, addSupplier, updateSupplier, archiveSupplier } = useSuppliers();

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchSuppliers(showArchived);
  }, [fetchSuppliers, showArchived]);

  const filteredSuppliers = useMemo(() => {
    if (!search) return suppliers;
    const lower = search.toLowerCase();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(lower) ||
      s.contact_person?.toLowerCase().includes(lower) ||
      s.email?.toLowerCase().includes(lower) ||
      s.phone?.includes(lower)
    );
  }, [suppliers, search]);

  const handleAdd = () => {
    setEditingSupplier(null);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (data) => {
    setIsSubmitting(true);
    setFormError('');
    try {
      if (editingSupplier) {
        const result = await updateSupplier(editingSupplier.id, data);
        if (!result.success) throw new Error(result.error);
        toast.success('Supplier updated');
      } else {
        const result = await addSupplier(data);
        if (!result.success) throw new Error(result.error);
        toast.success('Supplier added');
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (supplier) => {
    const action = supplier.is_active ? 'archive' : 'reactivate';
    const confirmed = await confirm({
      title: `${supplier.is_active ? 'Archive' : 'Reactivate'} Supplier`,
      message: `Are you sure you want to ${action} "${supplier.name}"?${supplier.is_active ? ' Their PO history will be preserved.' : ''}`,
      variant: supplier.is_active ? 'warning' : 'default',
      confirmText: supplier.is_active ? 'Archive' : 'Reactivate'
    });

    if (confirmed) {
      const result = await archiveSupplier(supplier.id);
      if (result.success) {
        toast.success(`Supplier ${action}d`);
      } else {
        toast.error(result.error);
      }
    }
  };

  const viewSupplierDetail = async (supplier) => {
    setSelectedSupplier(supplier);
    setDetailLoading(true);
    try {
      const detail = await api.get(`/suppliers/${supplier.id}`);
      setSupplierDetail(detail);
    } catch {
      setSupplierDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="inventory-page">
      <div className="inventory-header page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">Manage your supplier contacts and purchase history.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
          <button className="btn btn-primary" onClick={handleAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Add Supplier
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: '400px', minWidth: '200px' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input type="text" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
        </div>
        <span className="badge badge-neutral">{filteredSuppliers.length} suppliers</span>
      </div>

      {/* Two-column layout: list + detail */}
      <div className={`suppliers-grid ${selectedSupplier ? 'has-selection' : ''}`}>
        {/* Suppliers Table */}
        <div className="glass-panel suppliers-table-wrapper">
          {loading ? (
            <div className="table-loading"><div className="spinner"></div><p>Loading suppliers...</p></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Supplier</th><th>Contact</th><th>Terms</th><th>POs</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-xl text-muted">No suppliers found.</td></tr>
                ) : (
                  filteredSuppliers.map(supplier => (
                    <tr
                      key={supplier.id}
                      style={{ cursor: 'pointer', opacity: supplier.is_active ? 1 : 0.6, background: selectedSupplier?.id === supplier.id ? 'rgba(99,102,241,0.06)' : undefined }}
                      onClick={() => viewSupplierDetail(supplier)}
                    >
                      <td>
                        <div className="product-cell">
                          <div className="product-avatar" style={{ background: supplier.is_active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#94a3b8' }}>
                            {supplier.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="product-info">
                            <span className="product-name">{supplier.name}</span>
                            {!supplier.is_active && <span className="badge badge-neutral badge-sm mt-xs">Archived</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.9rem' }}>{supplier.contact_person || '—'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{supplier.phone || supplier.email || ''}</div>
                      </td>
                      <td><span className="badge badge-neutral">{supplier.payment_terms || 'Net 30'}</span></td>
                      <td style={{ fontWeight: 600 }}>{supplier.po_count || 0}</td>
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="action-buttons">
                          <button className="btn-icon" onClick={() => handleEdit(supplier)} title="Edit">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            className={`btn-icon ${supplier.is_active ? 'text-warning' : 'text-success'}`}
                            onClick={() => handleArchive(supplier)}
                            title={supplier.is_active ? 'Archive' : 'Reactivate'}
                          >
                            {supplier.is_active ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 8v13H3V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 3h22v5H1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Supplier Detail Panel */}
        {selectedSupplier && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 4px 0' }}>{selectedSupplier.name}</h2>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{selectedSupplier.contact_person || 'No contact person'}</p>
              </div>
              <button className="btn-icon" onClick={() => { setSelectedSupplier(null); setSupplierDetail(null); }} title="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="table-loading"><div className="spinner"></div><p>Loading details...</p></div>
            ) : supplierDetail && (
              <>
                {/* Contact Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: 'Phone', value: supplierDetail.phone },
                    { label: 'Email', value: supplierDetail.email },
                    { label: 'Payment Terms', value: supplierDetail.payment_terms },
                    { label: 'Lead Time', value: `${supplierDetail.lead_time_days || 7} days` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ flex: 1, padding: '16px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>{supplierDetail.po_count || 0}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total POs</div>
                  </div>
                  <div style={{ flex: 1, padding: '16px', background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(22,163,74,0.08))', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>{fmt(supplierDetail.total_spend || 0)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total Spend</div>
                  </div>
                </div>

                {/* Recent POs */}
                {supplierDetail.purchase_orders?.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px' }}>Recent Purchase Orders</h3>
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      {supplierDetail.purchase_orders.slice(0, 10).map(po => (
                        <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                          <div>
                            <code style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{po.po_number}</code>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              {new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 600 }}>{fmt(po.total_amount)}</div>
                            <span className={`badge badge-sm ${
                              po.status === 'received' ? 'badge-success' :
                              po.status === 'sent' ? 'badge-warning' :
                              po.status === 'cancelled' ? 'badge-error' :
                              'badge-neutral'
                            }`}>{po.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Address & Notes */}
                {(supplierDetail.address || supplierDetail.notes) && (
                  <div style={{ marginTop: '20px' }}>
                    {supplierDetail.address && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Address</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{supplierDetail.address}</div>
                      </div>
                    )}
                    {supplierDetail.notes && (
                      <div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Notes</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{supplierDetail.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        editingSupplier={editingSupplier}
        isSubmitting={isSubmitting}
        error={formError}
      />
    </div>
  );
}
