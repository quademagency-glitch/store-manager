import { useState, useEffect } from 'react';

const defaultLetterhead = {
  company_name: '',
  tagline: '',
  address: '',
  phone: '',
  email: '',
  registration_no: '',
  footer_text: 'Thank you for your business!',
  show_logo: true,
  show_border: true,
  accent_color: '#4338ca'
};

export default function LetterheadBuilder({ letterhead, logoUrl, businessName, onSave }) {
  const [data, setData] = useState({ ...defaultLetterhead, ...letterhead });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData({ ...defaultLetterhead, ...letterhead });
  }, [letterhead]);

  const update = (key, value) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  // Use configured name or fallback to business name
  const displayName = data.company_name || businessName || 'Your Business';

  return (
    <div className="lh-builder">
      {/* ─── Left: Form ─── */}
      <div className="lh-form-panel">
        <div className="form-group">
          <label htmlFor="lh-company">Company Name Override</label>
          <input
            id="lh-company"
            type="text"
            className="form-input"
            placeholder={businessName || 'Company Name'}
            value={data.company_name}
            onChange={e => update('company_name', e.target.value)}
          />
          <p className="org-form-hint">Leave blank to use your business name.</p>
        </div>

        <div className="form-group">
          <label htmlFor="lh-tagline">Tagline / Slogan</label>
          <input
            id="lh-tagline"
            type="text"
            className="form-input"
            placeholder="Your trusted partner in excellence"
            value={data.tagline}
            onChange={e => update('tagline', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="lh-address">Address</label>
          <input
            id="lh-address"
            type="text"
            className="form-input"
            placeholder="123 Oxford St, Osu, Accra"
            value={data.address}
            onChange={e => update('address', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
          <div className="form-group">
            <label htmlFor="lh-phone">Phone</label>
            <input
              id="lh-phone"
              type="tel"
              className="form-input"
              placeholder="+233 20 000 0000"
              value={data.phone}
              onChange={e => update('phone', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="lh-email">Email</label>
            <input
              id="lh-email"
              type="email"
              className="form-input"
              placeholder="info@company.com"
              value={data.email}
              onChange={e => update('email', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="lh-reg">Registration / TIN Number</label>
          <input
            id="lh-reg"
            type="text"
            className="form-input"
            placeholder="GH-CS-123456789"
            value={data.registration_no}
            onChange={e => update('registration_no', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="lh-footer">Footer Text</label>
          <input
            id="lh-footer"
            type="text"
            className="form-input"
            placeholder="Thank you for your business!"
            value={data.footer_text}
            onChange={e => update('footer_text', e.target.value)}
          />
        </div>

        {/* Toggles */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)', marginTop: 'var(--space-sm)' }}>
          <div className="lh-toggle-row">
            <label htmlFor="lh-show-logo">
              <input
                id="lh-show-logo"
                type="checkbox"
                checked={data.show_logo}
                onChange={e => update('show_logo', e.target.checked)}
              />
              Show Logo on Documents
            </label>
          </div>
          <div className="lh-toggle-row">
            <label htmlFor="lh-show-border">
              <input
                id="lh-show-border"
                type="checkbox"
                checked={data.show_border}
                onChange={e => update('show_border', e.target.checked)}
              />
              Show Border Lines
            </label>
          </div>
          <div className="lh-toggle-row">
            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Accent Color</span>
            <div className="lh-color-input">
              <input
                type="color"
                value={data.accent_color}
                onChange={e => update('accent_color', e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                {data.accent_color}
              </span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: 'var(--space-md)' }}
        >
          {saving ? 'Saving Letterhead...' : 'Save Letterhead'}
        </button>
      </div>

      {/* ─── Right: Live Preview ─── */}
      <div className="lh-preview-panel">
        <div className="lh-preview-label">Live Preview</div>
        <div className="lh-preview-frame">
          {/* Header */}
          <div
            className={`lh-preview-header ${data.show_border ? 'with-border' : ''}`}
            style={{ borderColor: data.show_border ? data.accent_color : 'transparent' }}
          >
            <div className="lh-preview-logo-area">
              {data.show_logo && logoUrl && (
                <img src={logoUrl} alt="Logo" className="lh-preview-logo" />
              )}
              <div>
                <div className="lh-preview-company" style={{ color: data.accent_color }}>
                  {displayName}
                </div>
                {data.tagline && <div className="lh-preview-tagline">{data.tagline}</div>}
              </div>
            </div>
            <div className="lh-preview-contact">
              {data.address && <div>{data.address}</div>}
              {data.phone && <div>Tel: {data.phone}</div>}
              {data.email && <div>{data.email}</div>}
              {data.registration_no && <div>Reg: {data.registration_no}</div>}
            </div>
          </div>

          {/* Body placeholder */}
          <div className="lh-preview-body-placeholder">
            <div className="lh-preview-line long" />
            <div className="lh-preview-line medium" />
            <div className="lh-preview-line long" />
            <div className="lh-preview-line short" />
            <div className="lh-preview-line medium" />
            <div className="lh-preview-line long" />
            <div className="lh-preview-line short" />
          </div>

          {/* Footer */}
          {data.footer_text && (
            <div
              className={`lh-preview-footer ${data.show_border ? 'with-border' : ''}`}
              style={{ borderColor: data.show_border ? data.accent_color + '40' : 'transparent' }}
            >
              {data.footer_text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
