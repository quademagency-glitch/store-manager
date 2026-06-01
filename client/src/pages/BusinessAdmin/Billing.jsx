import { useState } from 'react';

export default function Billing() {
  const [subscriptionStatus, setSubscriptionStatus] = useState(() => {
    return localStorage.getItem('simulated_subscription') || 'inactive';
  });
  
  const [simulating, setSimulating] = useState(false);
  const [provider, setProvider] = useState(null);

  const handleSubscribe = (selectedProvider) => {
    setProvider(selectedProvider);
    setSimulating(true);
    
    // Simulate API call and redirect
    setTimeout(() => {
      localStorage.setItem('simulated_subscription', 'active');
      setSubscriptionStatus('active');
      setSimulating(false);
      setProvider(null);
      alert(`Successfully subscribed using ${selectedProvider}!`);
    }, 1500);
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel your subscription?')) {
      localStorage.setItem('simulated_subscription', 'inactive');
      setSubscriptionStatus('inactive');
    }
  };

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Billing & Subscription</h1>
          <p className="dashboard-subtitle">Manage your ERP subscription plan and payment methods.</p>
        </div>
      </header>

      <div className="content-card">
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Current Plan</h2>
        
        <div style={{ padding: '24px', background: subscriptionStatus === 'active' ? '#f0fdf4' : '#f8fafc', border: subscriptionStatus === 'active' ? '1px solid #86efac' : '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
                {subscriptionStatus === 'active' ? 'Pro Plan' : 'Free Tier'}
              </h3>
              <p style={{ color: '#64748b', marginTop: '4px' }}>
                {subscriptionStatus === 'active' 
                  ? 'Your business has access to all premium multi-location features.' 
                  : 'You are currently on the limited free tier.'}
              </p>
            </div>
            <div>
              {subscriptionStatus === 'active' ? (
                <span className="badge badge-success" style={{ fontSize: '14px', padding: '6px 12px' }}>Active Subscription</span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '14px', padding: '6px 12px' }}>Action Required</span>
              )}
            </div>
          </div>
          
          {subscriptionStatus === 'active' && (
            <div style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={handleCancel} style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {subscriptionStatus !== 'active' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Upgrade to Pro ($49/mo)</h2>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>Select a payment provider to securely process your subscription.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Stripe Option */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', textAlign: 'center', background: '#fff' }}>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#635BFF', marginBottom: '16px', letterSpacing: '-1px' }}>
                  stripe
                </div>
                <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
                  Pay securely with your credit card or Apple Pay via Stripe. Global coverage.
                </p>
                <button 
                  className="btn"
                  style={{ width: '100%', background: '#635BFF', color: 'white' }}
                  onClick={() => handleSubscribe('Stripe')}
                  disabled={simulating}
                >
                  {simulating && provider === 'Stripe' ? 'Processing...' : 'Pay with Stripe'}
                </button>
              </div>

              {/* Paystack Option */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', textAlign: 'center', background: '#fff' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#0BA4DB', marginBottom: '16px', letterSpacing: '-1px' }}>
                  paystack
                </div>
                <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '14px' }}>
                  The best option for businesses in Africa. Pay via Card, Bank Transfer, or USSD.
                </p>
                <button 
                  className="btn"
                  style={{ width: '100%', background: '#0BA4DB', color: 'white' }}
                  onClick={() => handleSubscribe('Paystack')}
                  disabled={simulating}
                >
                  {simulating && provider === 'Paystack' ? 'Processing...' : 'Pay with Paystack'}
                </button>
              </div>
            </div>
            
            {simulating && (
              <div style={{ marginTop: '24px', textAlign: 'center', color: '#64748b' }}>
                <div className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px', width: '16px', height: '16px', borderWidth: '2px' }}></div>
                Simulating {provider} checkout flow...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
