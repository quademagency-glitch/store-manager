import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../../../components/icons/Icons';

export default function BillingTab() {
  const {
    billingStats, gateways, invoices,
    openGatewayModal, handleDeleteGateway,
    setShowSendInvoiceModal, setSelectedInvoiceId, setShowRecordPaymentModal,
    setShowAssignPlanModal, setAssignForm,
    formatCurrency,
  } = usePlatformAdmin();

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Billing & Payments</h1>
          <p className="dashboard-subtitle">Payment gateways, revenue overview, and invoice management.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowRecordPaymentModal(true)}>
            {Icons.plus} Record Payment
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAssignPlanModal(true); setAssignForm({ business_id: '', plan_id: '', billing_cycle: 'monthly' }); }}>
            {Icons.pricing} Assign Plan
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Revenue Stats */}
        <div className="pa-billing-stats">
          <div className="pa-revenue-card revenue">
            <span className="pa-revenue-label">Total Revenue</span>
            <span className="pa-revenue-value positive">{formatCurrency(billingStats.total_revenue)}</span>
          </div>
          <div className="pa-revenue-card mrr">
            <span className="pa-revenue-label">Monthly Recurring</span>
            <span className="pa-revenue-value accent">{formatCurrency(billingStats.mrr)}</span>
          </div>
          <div className="pa-revenue-card subs">
            <span className="pa-revenue-label">Active Subs</span>
            <span className="pa-revenue-value">{billingStats.active_subscriptions}</span>
          </div>
          <div className="pa-revenue-card outstanding">
            <span className="pa-revenue-label">Outstanding</span>
            <span className="pa-revenue-value warning">{formatCurrency(billingStats.outstanding)}</span>
          </div>
          <div className="pa-revenue-card failed">
            <span className="pa-revenue-label">Failed</span>
            <span className="pa-revenue-value error">{formatCurrency(billingStats.failed_payments)}</span>
          </div>
        </div>

        {/* Payment Gateways */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h2 className="pa-section-title" style={{ marginBottom: 0 }}>
              {Icons.billing} Payment Gateways
            </h2>
            <button className="btn btn-secondary btn-sm" onClick={() => openGatewayModal()}>
              {Icons.plus} Add Gateway
            </button>
          </div>
          <div className="pa-gateway-grid">
            {gateways.map(gw => (
              <div key={gw.id} className="pa-gateway-card">
                <div className="pa-gateway-header">
                  <div className="pa-gateway-provider">
                    <div className={`pa-gateway-logo ${gw.provider}`}>
                      {gw.provider === 'paystack' ? 'P' : gw.provider === 'flutterwave' ? 'F' : 'S'}
                    </div>
                    <span className="pa-gateway-name">{gw.display_name}</span>
                  </div>
                  <span className={`pa-gateway-status ${gw.is_active ? 'active' : 'inactive'}`}>
                    <span className="pa-gateway-status-dot"></span>
                    {gw.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="pa-gateway-details">
                  {gw.public_key && (
                    <div className="pa-key-field">
                      <span className="pa-key-label">Public Key</span>
                      <span className="pa-key-value">{gw.public_key}</span>
                    </div>
                  )}
                  <div className="pa-key-field">
                    <span className="pa-key-label">Secret Key</span>
                    <span className="pa-key-value">{gw.secret_key || 'Not set'}</span>
                  </div>
                </div>
                <div className="pa-gateway-currencies">
                  {(gw.supported_currencies || []).map(c => (
                    <span key={c} className="pa-currency-tag">{c}</span>
                  ))}
                </div>
                <div className="pa-gateway-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openGatewayModal(gw)}>{Icons.edit} Edit</button>
                  <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeleteGateway(gw.id)}>{Icons.trash} Remove</button>
                </div>
              </div>
            ))}
            {gateways.length === 0 && (
              <div className="text-center py-xl text-muted">No payment gateways configured yet.</div>
            )}
          </div>
        </div>

        {/* Invoices Table */}
        <div>
          <h2 className="pa-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Recent Invoices
          </h2>
          <div className="content-card">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Business</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 25).map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{inv.invoice_number}</td>
                      <td>{inv.businesses?.name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount, inv.currency)}</td>
                      <td><span className={`pa-invoice-badge ${inv.status}`}>{inv.status}</span></td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="text-right">
                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => window.open(`/invoice/${inv.id}`, '_blank')} title="View Invoice">
                            {Icons.eye} View
                          </button>
                          {inv.status !== 'paid' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedInvoiceId(inv.id); setShowSendInvoiceModal(true); }}>
                              {Icons.send} Send
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan="6" className="text-center py-xl text-muted">No invoices yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
