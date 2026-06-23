import { useState } from 'react';
import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../../../components/icons/Icons';

export default function PricingTab() {
  const {
    plans, billingCycle, setBillingCycle,
    openPlanModal, handleDeletePlan,
    subscriptions, FEATURE_LABELS, formatCurrency
  } = usePlatformAdmin();

  const [expandedCards, setExpandedCards] = useState({});
  const toggleFeatures = (planId) => setExpandedCards(prev => ({ ...prev, [planId]: !prev[planId] }));
  const activePlans = plans.filter(plan => plan.is_active !== false);

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
        {activePlans.map((plan, idx) => {
          const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
          let comparePrice = billingCycle === 'yearly' ? plan.compare_at_price_yearly : plan.compare_at_price_monthly;
          const subCount = subscriptions.filter(s => s.plan_id === plan.id).length;
          const features = plan.features || {};

          // Promo Logic
          const promoMode = plan.promo_mode || 'none';
          const isTrial = promoMode === 'trial';
          const isIntro = promoMode === 'intro';
          const introPrice = billingCycle === 'yearly' ? plan.intro_price_yearly : plan.intro_price_monthly;
          const trialValue = billingCycle === 'yearly' ? (plan.trial_days_yearly ?? 0) : (plan.trial_days_monthly ?? 0);
          const trialUnit = billingCycle === 'yearly' ? (plan.trial_unit_yearly || 'days') : (plan.trial_unit_monthly || 'days');

          // Auto-calculate discount intelligence
          let discountLabel = null;
          if (isIntro && introPrice !== null && introPrice !== '' && Number(introPrice) < price) {
            const percentOff = Math.round(((price - Number(introPrice)) / price) * 100);
            discountLabel = `Save ${percentOff}%`;
          } else if (billingCycle === 'yearly' && plan.price_monthly > 0) {
            const naturalYearly = plan.price_monthly * 12;
            if (price < naturalYearly) {
              if (!comparePrice) comparePrice = naturalYearly;
              const monthsFree = Math.round((naturalYearly - price) / plan.price_monthly);
              if (monthsFree > 0 && monthsFree < 12) {
                discountLabel = `${monthsFree} month${monthsFree > 1 ? 's' : ''} free`;
              } else {
                const percentOff = Math.round(((naturalYearly - price) / naturalYearly) * 100);
                discountLabel = `Save ${percentOff}%`;
              }
            }
          }

          // Split features into available / not available
          const allFeatureEntries = Object.entries(FEATURE_LABELS);
          const availableFeatures = allFeatureEntries.filter(([key]) => features[key]);
          const unavailableFeatures = allFeatureEntries.filter(([key]) => !features[key]);
          const isExpanded = expandedCards[plan.id];

          return (
            <div key={plan.id} className={`pa-plan-card ${idx === 1 ? 'featured' : ''}`}>
              {(idx === 1 || discountLabel) && (
                <div style={{ position: 'absolute', top: '-12px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                  {idx === 1 && <span className="pa-plan-badge" style={{ position: 'relative', top: 0, transform: 'none' }}>Popular</span>}
                  {discountLabel && <span className="pa-plan-badge" style={{ position: 'relative', top: 0, transform: 'none', background: 'var(--color-primary)', color: 'white' }}>{discountLabel}</span>}
                </div>
              )}
              <div className="pa-plan-header">
                <h3 className="pa-plan-name" style={{ fontSize: '1.3rem' }}>{plan.name}</h3>
                <p className="pa-plan-desc" style={{ fontSize: '0.9rem' }}>{plan.description || 'No description'}</p>
              </div>
              <div className="pa-plan-price">
                <span className="pa-plan-currency" style={{ fontSize: '1.1rem' }}>{plan.currency || 'GHS'}</span>
                <span className="pa-plan-amount" style={{ fontSize: '2.4rem' }}>{Number(price).toLocaleString()}</span>
                {comparePrice && Number(comparePrice) > Number(price) && (
                  <span style={{ textDecoration: 'line-through', color: 'var(--color-text-tertiary)', fontSize: '1.1rem', marginLeft: '0.5rem' }}>
                    {Number(comparePrice).toLocaleString()}
                  </span>
                )}
                <span className="pa-plan-period" style={{ fontSize: '0.95rem' }}>/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
              </div>

              {isTrial && trialValue > 0 && (
                <div style={{ textAlign: 'center', padding: '0.5rem 0.75rem', marginTop: '0.25rem', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  <span style={{ color: '#22d3ee' }}>🧪 {trialValue} {trialUnit} free trial</span>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px', fontSize: '0.75rem' }}>
                    Requires a GHS 1.00 card authorization
                  </span>
                </div>
              )}

              {isIntro && Number(introPrice) > 0 && (
                <div style={{ textAlign: 'center', padding: '0.5rem 0.75rem', marginTop: '0.25rem', background: 'rgba(74, 222, 128, 0.08)', border: '1px solid rgba(74, 222, 128, 0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  <span style={{ color: '#4ade80', fontWeight: 'bold' }}>🎁 Introductory Offer</span>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px', fontSize: '0.8rem' }}>
                    First payment: <strong style={{ color: '#4ade80' }}>{formatCurrency(introPrice, plan.currency)}</strong>
                  </span>
                </div>
              )}

              <div className="pa-plan-limits" style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
                <span className="pa-plan-limit"><strong>{plan.setup_fee > 0 ? formatCurrency(plan.setup_fee, plan.currency) : 'Free'}</strong> Setup Fee</span>
                <span className="pa-plan-limit"><strong>{plan.max_users === -1 ? '∞' : plan.max_users}</strong> Users</span>
                <span className="pa-plan-limit"><strong>{plan.max_locations === -1 ? '∞' : plan.max_locations}</strong> Locations</span>
                <span className="pa-plan-limit"><strong>{plan.max_products === -1 ? '∞' : plan.max_products}</strong> Products</span>
              </div>
              {/* Collapsible features toggle */}
              <button 
                onClick={() => toggleFeatures(plan.id)}
                style={{
                  width: '100%', background: 'transparent', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', cursor: 'pointer',
                  color: 'var(--color-text-secondary)', fontSize: '0.85rem', fontWeight: 600,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginTop: 'var(--space-sm)', transition: 'all 0.15s ease',
                }}
              >
                <span>{availableFeatures.length} of {allFeatureEntries.length} features</span>
                <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease', fontSize: '0.7rem' }}>▼</span>
              </button>

              {isExpanded && (
                <div style={{ marginTop: 'var(--space-sm)', animation: 'fadeIn 0.2s ease' }}>
                  {/* Available features */}
                  {availableFeatures.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(74, 222, 128, 0.15)' }}>
                        ✓ Included ({availableFeatures.length})
                      </div>
                      {availableFeatures.map(([key, label]) => (
                        <div key={key} className="pa-plan-feature" style={{ fontSize: '0.85rem', padding: '0.25rem 0' }}>
                          <span className="pa-plan-feature-check enabled" style={{ fontSize: '0.9rem' }}>✓</span>
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Unavailable features */}
                  {unavailableFeatures.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', paddingBottom: '0.3rem', borderBottom: '1px solid var(--color-border)' }}>
                        ✗ Not Included ({unavailableFeatures.length})
                      </div>
                      {unavailableFeatures.map(([key, label]) => (
                        <div key={key} className="pa-plan-feature" style={{ fontSize: '0.85rem', padding: '0.25rem 0', opacity: 0.5 }}>
                          <span className="pa-plan-feature-check disabled" style={{ fontSize: '0.9rem' }}>✗</span>
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pa-plan-subscribers" style={{ fontSize: '0.9rem', marginTop: 'var(--space-md)' }}>
                {Icons.users} {subCount} subscriber{subCount !== 1 ? 's' : ''}
              </div>
              <div className="pa-plan-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openPlanModal(plan)}>{Icons.edit} Edit</button>
                <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeletePlan(plan.id, plan.name)}>{Icons.trash} Remove</button>
              </div>
            </div>
          );
        })}
        {activePlans.length === 0 && (
          <div className="text-center py-xl text-muted" style={{ gridColumn: '1 / -1' }}>
            No plans created yet. Click "New Plan" to get started.
          </div>
        )}
      </div>
    </>
  );
}
