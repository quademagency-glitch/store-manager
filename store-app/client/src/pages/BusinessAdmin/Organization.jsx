import { useState, useEffect } from 'react';
import { useAuthContext } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import LetterheadBuilder from '../../components/LetterheadBuilder';
import { Icons } from '../../components/icons/Icons';
import { CURRENCY_OPTIONS } from '../../utils/currencyOptions';

export default function Organization() {
  const { user } = useAuthContext();
  const toast = useToast();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadBusiness() {
      try {
        const data = await api.get('/businesses/me');
        setBusiness(data);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Error loading business", err);
      } finally {
        setLoading(false);
      }
    }
    if (user?.id) loadBusiness();
  }, [user?.id]);

  const updateField = (key, value) => {
    setBusiness(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put(`/businesses/${business.id}`, {
        name: business.name,
        contact_email: business.contact_email,
        logo_url: business.logo_url,
        phone: business.phone,
        address_line1: business.address_line1,
        city: business.city,
        region: business.region,
        tax_rate: business.tax_rate,
        return_policy: business.return_policy,
        currency: business.currency,
        qr_tracking_mode: business.qr_tracking_mode,
      });
      setBusiness(updated);
      toast.success('Organization profile saved!');
    } catch (err) {
      toast.error(err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLetterheadSave = async (letterheadData) => {
    try {
      const updated = await api.put(`/businesses/${business.id}`, {
        letterhead: letterheadData
      });
      setBusiness(updated);
      toast.success('Letterhead saved!');
    } catch (err) {
      toast.error(err.message || 'Failed to save letterhead.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: 'var(--color-text-muted)' }}>
        <svg className="acct-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M4 12a8 8 0 018-8" opacity="0.75" />
        </svg>
        <span style={{ marginLeft: '12px' }}>Loading organization...</span>
      </div>
    );
  }

  if (!business) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--color-error)' }}>
        Organization not found.
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header" style={{ marginBottom: 'var(--space-xl)' }}>
        <div>
          <h1 className="page-title">Organization Settings</h1>
          <p className="page-subtitle">Manage your company profile, branding, and document letterhead.</p>
        </div>
      </header>

      <form onSubmit={handleSave}>
        <div className="org-settings-page">

          {/* ─── Section 1: Company Profile ─── */}
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.business}</div>
              <div>
                <h2 className="org-section-title">Company Profile</h2>
                <p className="org-section-subtitle">Basic information about your business</p>
              </div>
            </div>
            <div className="org-section-body">
              <div className="org-form-grid">
                <div className="form-group">
                  <label htmlFor="org-name">Business Name</label>
                  <input
                    id="org-name"
                    type="text"
                    className="form-input"
                    value={business.name || ''}
                    onChange={e => updateField('name', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="org-email">Contact Email</label>
                  <input
                    id="org-email"
                    type="email"
                    className="form-input"
                    placeholder="info@company.com"
                    value={business.contact_email || ''}
                    onChange={e => updateField('contact_email', e.target.value)}
                  />
                  <p className="org-form-hint">Used on receipts and customer communications.</p>
                </div>
                <div className="form-group">
                  <label htmlFor="org-phone">Phone Number</label>
                  <input
                    id="org-phone"
                    type="tel"
                    className="form-input"
                    placeholder="+233 20 000 0000"
                    value={business.phone || ''}
                    onChange={e => updateField('phone', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="org-address">Street Address</label>
                  <input
                    id="org-address"
                    type="text"
                    className="form-input"
                    placeholder="123 Oxford Street"
                    value={business.address_line1 || ''}
                    onChange={e => updateField('address_line1', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="org-city">City / Town</label>
                  <input
                    id="org-city"
                    type="text"
                    className="form-input"
                    placeholder="Accra"
                    value={business.city || ''}
                    onChange={e => updateField('city', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="org-region">Region / State</label>
                  <input
                    id="org-region"
                    type="text"
                    className="form-input"
                    placeholder="Greater Accra"
                    value={business.region || ''}
                    onChange={e => updateField('region', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ─── Section 2: Branding ─── */}
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.palette}</div>
              <div>
                <h2 className="org-section-title">Branding</h2>
                <p className="org-section-subtitle">Your logo appears on receipts, invoices, and reports</p>
              </div>
            </div>
            <div className="org-section-body">
              <div className="org-logo-area">
                <div className={`org-logo-preview ${business.logo_url ? 'has-logo' : ''}`}>
                  {business.logo_url ? (
                    <img src={business.logo_url} alt="Business logo" />
                  ) : (
                    <span aria-hidden="true">{Icons.image}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="org-logo">Logo URL</label>
                    <input
                      id="org-logo"
                      type="url"
                      className="form-input"
                      placeholder="https://example.com/logo.png"
                      value={business.logo_url || ''}
                      onChange={e => updateField('logo_url', e.target.value)}
                    />
                    <p className="org-form-hint">Paste a public URL to your company logo (PNG, JPG, SVG).</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Section 3: Store Policies ─── */}
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.clipboard}</div>
              <div>
                <h2 className="org-section-title">Store Policies & Compliance</h2>
                <p className="org-section-subtitle">Tax configuration and return policy for your business</p>
              </div>
            </div>
            <div className="org-section-body">
              <div className="org-form-grid">
                <div className="form-group">
                  <label htmlFor="org-tax">Default Tax Rate (%)</label>
                  <input
                    id="org-tax"
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 12.5"
                    value={business.tax_rate || 0}
                    onChange={e => updateField('tax_rate', parseFloat(e.target.value) || 0)}
                  />
                  <p className="org-form-hint">Applied to all sales unless overridden per product.</p>
                </div>
                <div className="form-group">
                  <label htmlFor="org-currency">Operating Currency</label>
                  <select
                    id="org-currency"
                    className="form-input"
                    value={business.currency || 'GHS'}
                    onChange={e => updateField('currency', e.target.value)}
                  >
                    {CURRENCY_OPTIONS.map(opt => (
                      <option key={opt.code} value={opt.code}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="org-form-hint">Default for locations that don't set their own currency.</p>
                </div>
                <div className="form-group">
                  <label htmlFor="org-qr-mode">QR Tracking Mode</label>
                  <select
                    id="org-qr-mode"
                    className="form-input"
                    value={business.qr_tracking_mode || 'single'}
                    onChange={e => updateField('qr_tracking_mode', e.target.value)}
                  >
                    <option value="single">Single (Item Code only)</option>
                    <option value="double">Double (Pack Code + Item Code)</option>
                  </select>
                  <p className="org-form-hint">Requires double scanning and serial numbers to prevent theft.</p>
                </div>
                <div className="form-group full-width">
                  <label htmlFor="org-return-policy">Return Policy</label>
                  <textarea
                    id="org-return-policy"
                    className="form-input"
                    rows="3"
                    placeholder="e.g. Returns accepted within 30 days with receipt."
                    value={business.return_policy || ''}
                    onChange={e => updateField('return_policy', e.target.value)}
                  />
                  <p className="org-form-hint">Printed on customer receipts.</p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="org-save-bar">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? (
                  <>
                    <svg className="acct-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M4 12a8 8 0 018-8" opacity="0.75" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Profile'
                )}
              </button>
            </div>
          </div>

          {/* ─── Section 4: Billing ─── */}
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.creditCard}</div>
              <div>
                <h2 className="org-section-title">Billing & Plan</h2>
                <p className="org-section-subtitle">Your current subscription details</p>
              </div>
            </div>
            <div className="org-section-body">
              <div className="org-billing-info">
                <div className="org-billing-plan">
                  <span className="org-billing-plan-name">{business.billing_plan || 'Free'}</span>
                  {business.billing_status === 'Active' || business.status === 'active' ? (
                    <span className="org-billing-badge active">Active</span>
                  ) : (
                    <span className="org-billing-badge inactive">{business.billing_status || business.status || 'Unknown'}</span>
                  )}
                </div>
              </div>
              <p className="org-billing-note">
                Billing is managed by the Platform Administrator. Contact support to change your subscription tier.
              </p>
            </div>
          </div>

          {/* ─── Section 5: Letterhead ─── */}
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.document}</div>
              <div>
                <h2 className="org-section-title">Document Letterhead</h2>
                <p className="org-section-subtitle">Configure the header and footer for receipts, invoices, and printable documents</p>
              </div>
            </div>
            <div className="org-section-body">
              <LetterheadBuilder
                letterhead={business.letterhead || {}}
                logoUrl={business.logo_url}
                businessName={business.name}
                onSave={handleLetterheadSave}
              />
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
