import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function PricingTab() {
  const {
    plans, billingCycle, setBillingCycle,
    openPlanModal, handleDeletePlan,
    subscriptions, FEATURE_LABELS,
  } = usePlatformAdmin();

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Pricing & Plans</h1>
          <p className="dashboard-subtitle">Define subscription tiers and pricing for your tenants.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="pa-cycle-toggle">
            <button className={`pa-cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
            <button className={`pa-cycle-btn ${billingCycle === 'yearly' ? 'active' : ''}`} onClick={() => setBillingCycle('yearly')}>Yearly</button>
          </div>
          <button className="btn btn-primary" onClick={() => openPlanModal()}>
            {Icons.plus} New Plan
          </button>
        </div>
      </header>

      <div className="pa-pricing-grid">
        {plans.map((plan, idx) => {
          const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
          const subCount = subscriptions.filter(s => s.plan_id === plan.id).length;
          const features = plan.features || {};
          return (
            <div key={plan.id} className={`pa-plan-card ${idx === 1 ? 'featured' : ''}`}>
              {idx === 1 && <span className="pa-plan-badge">Popular</span>}
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
                {plan.trial_days > 0 && Number(price) > 0 && <span className="pa-plan-limit"><strong>{plan.trial_days}d</strong> Trial</span>}
              </div>
              <div className="pa-plan-features">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <div key={key} className="pa-plan-feature">
                    <span className={`pa-plan-feature-check ${features[key] ? 'enabled' : 'disabled'}`}>
                      {features[key] ? '✓' : '×'}
                    </span>
                    {label}
                  </div>
                ))}
              </div>
              <div className="pa-plan-subscribers">
                {Icons.users} {subCount} subscriber{subCount !== 1 ? 's' : ''}
              </div>
              <div className="pa-plan-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openPlanModal(plan)}>{Icons.edit} Edit</button>
                <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeletePlan(plan.id, plan.name)}>{Icons.trash} Remove</button>
              </div>
            </div>
          );
        })}
        {plans.length === 0 && (
          <div className="text-center py-xl text-muted" style={{ gridColumn: '1 / -1' }}>
            No plans created yet. Click "New Plan" to get started.
          </div>
        )}
      </div>
    </>
  );
}
