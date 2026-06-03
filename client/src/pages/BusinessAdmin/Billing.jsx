import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuthContext } from '../../lib/AuthContext';
import Modal from '../../components/Modal';

export default function Billing() {
  const { user } = useAuthContext();
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  };

  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, invRes] = await Promise.all([
        api.get('/subscriptions/plans').catch(() => []),
        api.get(`/subscriptions/business/${user?.business_id}`).catch(() => null),
        api.get(`/billing/invoices/${user?.business_id}`).catch(() => []),
      ]);
      setPlans(plansRes || []);
      setSubscription(subRes);
      setInvoices(invRes || []);
    } catch (err) {
      console.error('Error fetching billing data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.business_id]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setShowUpgradeModal(true);
  };

  const handlePayWithPaystack = async () => {
    if (!selectedPlan) return;
    setProcessing(true);
    try {
      const result = await api.post('/subscriptions/initialize-paystack', {
        plan_id: selectedPlan.id,
        billing_cycle: billingCycle,
        callback_url: window.location.origin + '/business-admin?tab=billing&payment=success',
      });

      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      } else {
        alert('Could not initialize payment. Please try again.');
      }
    } catch (err) {
      alert(err.message || 'Payment initialization failed. Please contact support.');
    } finally {
      setProcessing(false);
    }
  };

  // Check for payment success callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success' || params.get('trxref')) {
      // Payment completed — refresh data
      setTimeout(() => fetchBillingData(), 2000);
    }
  }, [fetchBillingData]);

  if (loading) {
    return <div className="p-xl text-center"><div className="spinner" style={{ margin: '2rem auto' }}></div>Loading billing...</div>;
  }

  const currentPlan = subscription?.platform_plans;
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrialing = subscription?.status === 'trialing';
  const daysLeft = subscription?.current_period_end
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Billing & Subscription</h1>
          <p className="dashboard-subtitle">Manage your subscription plan, view invoices, and make payments.</p>
        </div>
      </header>

      {/* Current Subscription Card */}
      <div className="pa-sub-card" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div className="pa-sub-header">
          <span className="pa-sub-plan-name">{currentPlan?.name || 'No Plan'}</span>
          {subscription && (
            <span className={`pa-sub-status ${subscription.status}`}>
              {isTrialing ? '🧪 Trial' : subscription.status}
            </span>
          )}
          {!subscription && (
            <span className="pa-sub-status expired">No Subscription</span>
          )}
        </div>

        {subscription && (
          <div className="pa-sub-details">
            <div className="pa-sub-detail">
              <span className="pa-sub-detail-label">Amount</span>
              <span className="pa-sub-detail-value">
                {formatCurrency(subscription.amount, subscription.currency)}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                  /{subscription.billing_cycle === 'yearly' ? 'yr' : 'mo'}
                </span>
              </span>
            </div>
            <div className="pa-sub-detail">
              <span className="pa-sub-detail-label">Billing Cycle</span>
              <span className="pa-sub-detail-value" style={{ textTransform: 'capitalize' }}>{subscription.billing_cycle}</span>
            </div>
            <div className="pa-sub-detail">
              <span className="pa-sub-detail-label">{isTrialing ? 'Trial Ends' : 'Renews On'}</span>
              <span className="pa-sub-detail-value">
                {isTrialing && subscription.trial_ends_at
                  ? new Date(subscription.trial_ends_at).toLocaleDateString()
                  : subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : '—'}
              </span>
            </div>
            <div className="pa-sub-detail">
              <span className="pa-sub-detail-label">Days Remaining</span>
              <span className="pa-sub-detail-value" style={{ color: daysLeft <= 5 ? '#f87171' : daysLeft <= 10 ? '#fbbf24' : '#4ade80' }}>
                {daysLeft} days
              </span>
            </div>
          </div>
        )}

        {currentPlan && (
          <div className="pa-plan-limits" style={{ marginTop: 'var(--space-sm)' }}>
            <span className="pa-plan-limit"><strong>{currentPlan.max_users === -1 ? '∞' : currentPlan.max_users}</strong> Users</span>
            <span className="pa-plan-limit"><strong>{currentPlan.max_locations === -1 ? '∞' : currentPlan.max_locations}</strong> Locations</span>
            <span className="pa-plan-limit"><strong>{currentPlan.max_products === -1 ? '∞' : currentPlan.max_products}</strong> Products</span>
          </div>
        )}
      </div>

      {/* Available Plans */}
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {isActive ? 'Change Plan' : 'Choose a Plan'}
          </h2>
          <div className="pa-cycle-toggle">
            <button className={`pa-cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
            <button className={`pa-cycle-btn ${billingCycle === 'yearly' ? 'active' : ''}`} onClick={() => setBillingCycle('yearly')}>Yearly</button>
          </div>
        </div>

        <div className="pa-pricing-grid">
          {plans.map((plan, idx) => {
            const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            const isCurrent = currentPlan?.id === plan.id;
            const features = plan.features || {};
            return (
              <div key={plan.id} className={`pa-plan-card ${idx === 1 ? 'featured' : ''} ${isCurrent ? 'featured' : ''}`}>
                {isCurrent && <span className="pa-plan-badge">Current</span>}
                {!isCurrent && idx === 1 && <span className="pa-plan-badge">Popular</span>}
                <div className="pa-plan-header">
                  <h3 className="pa-plan-name">{plan.name}</h3>
                  <p className="pa-plan-desc">{plan.description || 'No description'}</p>
                </div>
                <div className="pa-plan-price">
                  <span className="pa-plan-currency">{plan.currency || 'GHS'}</span>
                  <span className="pa-plan-amount">{Number(price).toLocaleString()}</span>
                  <span className="pa-plan-period">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                </div>
                <div className="pa-plan-limits">
                  <span className="pa-plan-limit"><strong>{plan.max_users === -1 ? '∞' : plan.max_users}</strong> Users</span>
                  <span className="pa-plan-limit"><strong>{plan.max_locations === -1 ? '∞' : plan.max_locations}</strong> Locations</span>
                  <span className="pa-plan-limit"><strong>{plan.max_products === -1 ? '∞' : plan.max_products}</strong> Products</span>
                </div>
                <div className="pa-plan-features">
                  {Object.entries(features).map(([key, val]) => (
                    <div key={key} className="pa-plan-feature">
                      <span className={`pa-plan-feature-check ${val ? 'enabled' : 'disabled'}`}>
                        {val ? '✓' : '×'}
                      </span>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </div>
                  ))}
                </div>
                <div className="pa-plan-actions" style={{ marginTop: 'auto' }}>
                  {isCurrent ? (
                    <button className="btn btn-secondary btn-sm" disabled style={{ width: '100%', opacity: 0.6 }}>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => handleSelectPlan(plan)}
                    >
                      {Number(price) === 0 ? 'Switch to Free' : (isActive ? 'Upgrade' : 'Subscribe')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="text-center py-xl text-muted" style={{ gridColumn: '1 / -1' }}>
              No plans available yet. Contact your platform administrator.
            </div>
          )}
        </div>
      </div>

      {/* Invoice History */}
      <div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-lg)' }}>
          Invoice History
        </h2>
        <div className="content-card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{inv.invoice_number}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount, inv.currency)}</td>
                    <td><span className={`pa-invoice-badge ${inv.status}`}>{inv.status}</span></td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>{inv.payment_method || '—'}</td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan="5" className="text-center py-xl text-muted">No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upgrade / Payment Modal */}
      {showUpgradeModal && selectedPlan && (
        <Modal isOpen={true} title={`Subscribe to ${selectedPlan.name}`} onClose={() => { setShowUpgradeModal(false); setSelectedPlan(null); }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="pa-plan-price" style={{ justifyContent: 'center', padding: 'var(--space-lg) 0' }}>
              <span className="pa-plan-currency">{selectedPlan.currency || 'GHS'}</span>
              <span className="pa-plan-amount">
                {Number(billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly).toLocaleString()}
              </span>
              <span className="pa-plan-period">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
            </div>

            {selectedPlan.trial_days > 0 && Number(billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly) > 0 && (
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.85rem', color: '#22d3ee' }}>
                🎉 Includes a {selectedPlan.trial_days}-day free trial
              </div>
            )}

            <div className="pa-plan-limits" style={{ justifyContent: 'center', marginBottom: 'var(--space-md)' }}>
              <span className="pa-plan-limit"><strong>{selectedPlan.max_users === -1 ? '∞' : selectedPlan.max_users}</strong> Users</span>
              <span className="pa-plan-limit"><strong>{selectedPlan.max_locations === -1 ? '∞' : selectedPlan.max_locations}</strong> Locations</span>
              <span className="pa-plan-limit"><strong>{selectedPlan.max_products === -1 ? '∞' : selectedPlan.max_products}</strong> Products</span>
            </div>
          </div>

          {Number(billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly) === 0 ? (
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowUpgradeModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setProcessing(true);
                  try {
                    await api.post('/subscriptions/assign', {
                      business_id: user?.business_id,
                      plan_id: selectedPlan.id,
                      billing_cycle: billingCycle,
                    });
                    alert('Switched to Free plan!');
                    setShowUpgradeModal(false);
                    fetchBillingData();
                  } catch (err) {
                    alert(err.message || 'Failed to switch plan');
                  } finally {
                    setProcessing(false);
                  }
                }}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Switch to Free'}
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
                You will be redirected to Paystack to complete the payment securely.
              </p>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowUpgradeModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handlePayWithPaystack}
                  disabled={processing}
                  style={{ background: '#00a4ef' }}
                >
                  {processing ? (
                    <>
                      <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}></div>
                      Processing...
                    </>
                  ) : (
                    'Pay with Paystack'
                  )}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
