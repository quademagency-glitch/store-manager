import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../lib/AuthContext';
import { api } from '../../lib/api';

export default function Organization() {
  const { user } = useAuthContext();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    async function loadBusiness() {
      try {
        const { data: userData } = await supabase.from('users').select('business_id').eq('id', user.id).single();
        if (!userData?.business_id) return;
        
        const { data, error } = await supabase.from('businesses').select('*').eq('id', userData.business_id).single();
        if (error) throw error;
        setBusiness(data);
      } catch (err) {
        console.error("Error loading business", err);
      } finally {
        setLoading(false);
      }
    }
    if (user?.id) loadBusiness();
  }, [user?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      await api.put(`/businesses/${business.id}`, {
        name: business.name,
        contact_email: business.contact_email,
        logo_url: business.logo_url
      });
        
      setMessage({ text: 'Organization profile updated successfully!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-xl text-center">Loading organization details...</div>;
  if (!business) return <div className="p-xl text-center text-error">Organization not found.</div>;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Organization Settings</h1>
          <p className="dashboard-subtitle">Manage your company's global profile and billing.</p>
        </div>
      </header>

      {message.text && (
        <div className={`alert alert-${message.type} mb-lg`}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="content-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>Profile Details</h2>
          <form onSubmit={handleSave} className="form-layout">
            <div className="form-group">
              <label>Business Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={business.name || ''} 
                onChange={(e) => setBusiness({...business, name: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Contact Email (Public/Receipts)</label>
              <input 
                type="email" 
                className="form-input" 
                value={business.contact_email || ''} 
                onChange={(e) => setBusiness({...business, contact_email: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Logo URL</label>
              <input 
                type="url" 
                className="form-input" 
                placeholder="https://example.com/logo.png"
                value={business.logo_url || ''} 
                onChange={(e) => setBusiness({...business, logo_url: e.target.value})}
              />
              <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '4px' }}>Used for receipts and reports.</p>
            </div>

            <div style={{ marginTop: '24px' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        <div className="content-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>Billing & Plan</h2>
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: '16px' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Current Plan</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '1.125rem' }}>{business.billing_plan || 'Free'}</strong>
                {business.billing_status === 'Active' ? (
                  <span className="badge" style={{ background: '#dcfce7', color: '#166534', border: 'none' }}>Active</span>
                ) : (
                  <span className="badge badge-warning">{business.billing_status}</span>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
              Billing is currently managed by the Platform Administrator. Contact support to change your subscription tier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
