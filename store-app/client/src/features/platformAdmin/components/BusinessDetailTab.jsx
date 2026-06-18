import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../../../components/icons/Icons';

export default function BusinessDetailTab() {
  const {
    selectedBusiness, setActiveTab, businessDetails, detailsLoading, businessSubscription,
    setShowAssignPlanModal, setAssignForm, setPaymentForm, setShowRecordPaymentModal,
    formatCurrency,
  } = usePlatformAdmin();

  const handleBackFromDetail = () => setActiveTab('businesses');

  return (
    <>
      <header className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={handleBackFromDetail}>
            {Icons.back} Back
          </button>
          <div>
            <h1 className="dashboard-title">{selectedBusiness.name}</h1>
            <p className="dashboard-subtitle">
              Business details — Products, Sales & Inventory
            </p>
          </div>
        </div>
        <div>
          {selectedBusiness.status === 'banned' ? (
            <span className="badge badge-warning">Banned</span>
          ) : (
            <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
          )}
        </div>
      </header>

      {detailsLoading ? (
        <div className="table-loading">
          <div className="spinner"></div>
          <span>Loading business data…</span>
        </div>
      ) : (
        <div className="pa-detail-sections">
          {/* Subscription Info */}
          {businessSubscription && (
            <div className="pa-sub-card">
              <div className="pa-sub-header">
                <span className="pa-sub-plan-name">{businessSubscription.platform_plans?.name || 'No Plan'} Plan</span>
                <span className={`pa-sub-status ${businessSubscription.status}`}>{businessSubscription.status}</span>
              </div>
              <div className="pa-sub-details">
                <div className="pa-sub-detail">
                  <span className="pa-sub-detail-label">Billing Cycle</span>
                  <span className="pa-sub-detail-value" style={{ textTransform: 'capitalize' }}>{businessSubscription.billing_cycle}</span>
                </div>
                <div className="pa-sub-detail">
                  <span className="pa-sub-detail-label">Amount</span>
                  <span className="pa-sub-detail-value">{formatCurrency(businessSubscription.amount, businessSubscription.currency)}</span>
                </div>
                <div className="pa-sub-detail">
                  <span className="pa-sub-detail-label">Period Start</span>
                  <span className="pa-sub-detail-value">{businessSubscription.current_period_start ? new Date(businessSubscription.current_period_start).toLocaleDateString() : '—'}</span>
                </div>
                <div className="pa-sub-detail">
                  <span className="pa-sub-detail-label">Period End</span>
                  <span className="pa-sub-detail-value">{businessSubscription.current_period_end ? new Date(businessSubscription.current_period_end).toLocaleDateString() : '—'}</span>
                </div>
                {businessSubscription.trial_ends_at && (
                  <div className="pa-sub-detail">
                    <span className="pa-sub-detail-label">Trial Ends</span>
                    <span className="pa-sub-detail-value">{new Date(businessSubscription.trial_ends_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              <div className="pa-sub-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setAssignForm({ business_id: selectedBusiness.id, plan_id: businessSubscription.plan_id || '', billing_cycle: businessSubscription.billing_cycle || 'monthly' }); setShowAssignPlanModal(true); }}>
                  {Icons.edit} Change Plan
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setPaymentForm({ business_id: selectedBusiness.id, amount: '', currency: businessSubscription.currency || 'GHS', payment_method: 'bank_transfer', description: '' }); setShowRecordPaymentModal(true); }}>
                  {Icons.plus} Record Payment
                </button>
              </div>
            </div>
          )}
          {!businessSubscription && (
            <div className="pa-sub-card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>No subscription assigned to this business.</p>
              <button className="btn btn-primary btn-sm" onClick={() => { setAssignForm({ business_id: selectedBusiness.id, plan_id: '', billing_cycle: 'monthly' }); setShowAssignPlanModal(true); }}>
                {Icons.pricing} Assign a Plan
              </button>
            </div>
          )}

          {/* Quick Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card">
              <div className="stat-icon stat-icon-products">{Icons.business}</div>
              <div className="stat-details">
                <span className="stat-label">Products</span>
                <span className="stat-value">{businessDetails.products.length}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-sales">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Total Sales</span>
                <span className="stat-value">{businessDetails.sales.length}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-stock">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 17H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M5 21H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="stat-details">
                <span className="stat-label">Stock Movements</span>
                <span className="stat-value">{businessDetails.inventory.length}</span>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="content-card mb-xl">
            <div className="toolbar">
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Products Catalog</h2>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Product</th><th>Price</th><th>Stock</th></tr>
                </thead>
                <tbody>
                  {businessDetails.products.slice(0, 20).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td>${Number(p.price || 0).toFixed(2)}</td>
                      <td>
                        <span className={`stock-count ${
                          (p.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0) <= 
                          (p.product_inventory?.[0]?.low_stock_threshold || 5) ? 'text-warning' : ''
                        }`}>
                          {p.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {businessDetails.products.length === 0 && (
                    <tr><td colSpan="3" className="text-center py-xl text-muted">No products.</td></tr>
                  )}
                  {businessDetails.products.length > 20 && (
                    <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '0.75rem' }}>…and {businessDetails.products.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Sales Table */}
          <div className="content-card mb-xl">
            <div className="toolbar">
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Recent Sales</h2>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Sale ID</th><th>Total</th><th>Items</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {businessDetails.sales.slice(0, 20).map(s => (
                    <tr key={s.id}>
                      <td className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{s.id.substring(0, 8)}…</td>
                      <td style={{ fontWeight: 600, color: '#4ade80' }}>${Number(s.total_amount || 0).toFixed(2)}</td>
                      <td>{s.sale_items?.length || 0}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(s.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {businessDetails.sales.length === 0 && (
                    <tr><td colSpan="4" className="text-center py-xl text-muted">No sales recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Movements Table */}
          <div className="content-card">
            <div className="toolbar">
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Stock Movements</h2>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Product</th><th>Type</th><th>Qty</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {businessDetails.inventory.slice(0, 20).map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.products?.name || '—'}</td>
                      <td>
                        <span className={`badge ${m.movement_type === 'restock' ? 'badge-neutral' : 'badge-warning'}`} style={m.movement_type === 'restock' ? { color: '#4ade80', borderColor: '#4ade80' } : {}}>
                          {m.movement_type}
                        </span>
                      </td>
                      <td>{m.quantity}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(m.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {businessDetails.inventory.length === 0 && (
                    <tr><td colSpan="4" className="text-center py-xl text-muted">No stock movements.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
