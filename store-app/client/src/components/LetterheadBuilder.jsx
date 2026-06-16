import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';

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
  accent_color: '#4338ca',
  mode: 'build', // 'build' or 'upload'
  uploaded_header_url: '',
  uploaded_footer_url: '',
};

export default function LetterheadBuilder({ letterhead, logoUrl, businessName, onSave }) {
  const { user } = useAuthContext();
  const toast = useToast();
  const [data, setData] = useState({ ...defaultLetterhead, ...letterhead });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const headerInputRef = useRef(null);
  const footerInputRef = useRef(null);

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

  // Upload a letterhead image (header or footer)
  const handleImageUpload = async (file, type) => {
    if (!file) return;
    
    // Validate
    if (!file.type.startsWith('image/')) {
      toast.warning('Please upload an image file (PNG, JPG, etc.).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('File must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.business_id}/letterhead_${type}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error } = await supabase.storage
        .from('receipts') // Reuse existing receipts bucket
        .upload(fileName, file, { upsert: true });
      
      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(uploadData.path);

      const publicUrl = urlData.publicUrl;
      
      if (type === 'header') {
        update('uploaded_header_url', publicUrl);
      } else {
        update('uploaded_footer_url', publicUrl);
      }
      
      toast.success(`${type === 'header' ? 'Header' : 'Footer'} image uploaded!`);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Upload failed:', err);
      toast.error('Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const clearUpload = (type) => {
    if (type === 'header') {
      update('uploaded_header_url', '');
    } else {
      update('uploaded_footer_url', '');
    }
  };

  // Use configured name or fallback to business name
  const displayName = data.company_name || businessName || 'Your Business';
  const mode = data.mode || 'build';

  return (
    <div>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-lg)', background: 'var(--color-bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <button
          type="button"
          onClick={() => update('mode', 'build')}
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: mode === 'build' ? 'var(--color-accent-primary)' : 'transparent',
            color: mode === 'build' ? '#fff' : 'var(--color-text-secondary)',
            boxShadow: mode === 'build' ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none'
          }}
        >
          🛠 Build Letterhead
        </button>
        <button
          type="button"
          onClick={() => update('mode', 'upload')}
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: mode === 'upload' ? 'var(--color-accent-primary)' : 'transparent',
            color: mode === 'upload' ? '#fff' : 'var(--color-text-secondary)',
            boxShadow: mode === 'upload' ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none'
          }}
        >
          📤 Upload Letterhead
        </button>
      </div>

      {/* ─── UPLOAD MODE ─── */}
      {mode === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
            Upload your pre-designed letterhead images. The header appears at the top of receipts and invoices, and the footer at the bottom.
          </p>

          {/* Header Upload */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              Header Image <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(appears at the top of documents)</span>
            </label>
            {data.uploaded_header_url ? (
              <div style={{ position: 'relative', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#fff' }}>
                <img
                  src={data.uploaded_header_url}
                  alt="Uploaded letterhead header"
                  style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '200px', objectFit: 'contain' }}
                />
                <button
                  type="button"
                  onClick={() => clearUpload('header')}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                onClick={() => headerInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-xl)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: 'var(--color-bg-secondary)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.5 }}>🖼</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 4px 0' }}>
                  Click to upload your header letterhead
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  PNG, JPG or SVG — max 5MB. Recommended width: 800px+
                </p>
                <input
                  ref={headerInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleImageUpload(e.target.files[0], 'header')}
                />
              </div>
            )}
          </div>

          {/* Footer Upload */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              Footer Image <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional — appears at the bottom)</span>
            </label>
            {data.uploaded_footer_url ? (
              <div style={{ position: 'relative', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#fff' }}>
                <img
                  src={data.uploaded_footer_url}
                  alt="Uploaded letterhead footer"
                  style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '120px', objectFit: 'contain' }}
                />
                <button
                  type="button"
                  onClick={() => clearUpload('footer')}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                onClick={() => footerInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-lg)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: 'var(--color-bg-secondary)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '4px', opacity: 0.5 }}>📎</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: '0 0 2px 0' }}>
                  Click to upload footer image
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>Optional</p>
                <input
                  ref={footerInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleImageUpload(e.target.files[0], 'footer')}
                />
              </div>
            )}
          </div>

          {/* Footer text still usable in upload mode */}
          <div className="form-group">
            <label htmlFor="lh-footer-upload" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Footer Text <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(shown below footer image if no footer image)</span>
            </label>
            <input
              id="lh-footer-upload"
              type="text"
              className="form-input"
              placeholder="Thank you for your business!"
              value={data.footer_text}
              onChange={e => update('footer_text', e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Upload Preview */}
          {data.uploaded_header_url && (
            <div>
              <div className="lh-preview-label">Preview</div>
              <div className="lh-preview-frame" style={{ padding: '0' }}>
                <img src={data.uploaded_header_url} alt="Header" style={{ width: '100%', height: 'auto', display: 'block' }} />
                <div className="lh-preview-body-placeholder" style={{ padding: '1.5rem 2rem' }}>
                  <div className="lh-preview-line long" />
                  <div className="lh-preview-line medium" />
                  <div className="lh-preview-line long" />
                  <div className="lh-preview-line short" />
                </div>
                {data.uploaded_footer_url ? (
                  <img src={data.uploaded_footer_url} alt="Footer" style={{ width: '100%', height: 'auto', display: 'block' }} />
                ) : data.footer_text ? (
                  <div className="lh-preview-footer">{data.footer_text}</div>
                ) : null}
              </div>
            </div>
          )}

          {/* Save */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || uploading}
          >
            {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save Letterhead'}
          </button>
        </div>
      )}

      {/* ─── BUILD MODE ─── */}
      {mode === 'build' && (
        <div className="lh-builder">
          {/* Left: Form */}
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

          {/* Right: Live Preview */}
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
      )}
    </div>
  );
}
