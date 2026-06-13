import { useState } from 'react';
import { useAuthContext } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { usePlatformAdmin } from '../PlatformAdminContext';

export default function ProfileTab() {
  const { user } = useAuthContext();
  const { platformSettings, handleSavePlatformSettings } = usePlatformAdmin();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Settings Form State
  const [settingsForm, setSettingsForm] = useState(platformSettings || []);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const handlePasswordReset = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Platform Settings</h1>
          <p className="dashboard-subtitle">Manage your personal admin account and preferences.</p>
        </div>
      </header>

      <div className="content-card" style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Admin Profile</h2>
        
        {message && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{message}</div>}
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Email Address</label>
            <input 
              type="email" 
              value={user?.email || ''} 
              disabled 
              className="form-input" 
              style={{ width: '100%', background: 'var(--color-bg-tertiary)' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Role</label>
            <div className="badge badge-neutral" style={{ display: 'inline-block' }}>Platform Admin</div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Security</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              We will send a secure link to your email to reset your password.
            </p>
            <button 
              className="btn btn-secondary" 
              onClick={handlePasswordReset}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Password Reset Link'}
            </button>
          </div>
        </div>
      </div>

      <div className="content-card" style={{ maxWidth: '600px', marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Integrations & API Keys</h2>
          <span className="badge badge-neutral" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: 'none' }}>Global</span>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Manage global API keys for services like SMS (Arkesel).
        </p>

        <form onSubmit={async (e) => {
          e.preventDefault();
          setSettingsSaving(true);
          await handleSavePlatformSettings(settingsForm);
          setSettingsSaving(false);
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {settingsForm.map((setting, index) => (
              <div key={setting.key} style={{ 
                background: 'var(--color-bg-secondary)', 
                padding: '1rem', 
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {setting.key.replace(/_/g, ' ')}
                  </label>
                  {setting.is_secret && (
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-error)', fontWeight: 600, background: 'rgba(239, 68, 68, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Secret
                    </span>
                  )}
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{setting.description}</p>
                <input 
                  type={setting.is_secret && setting.value === '********' ? 'password' : 'text'}
                  value={setting.value || ''} 
                  onChange={(e) => {
                    const newForm = [...settingsForm];
                    newForm[index].value = e.target.value;
                    setSettingsForm(newForm);
                  }}
                  className="form-input" 
                  style={{ width: '100%', fontFamily: setting.is_secret ? 'monospace' : 'inherit', fontSize: '0.9rem', padding: '0.6rem 0.8rem' }}
                  placeholder={setting.is_secret ? 'Enter new key to update' : ''}
                  onFocus={(e) => {
                    // Clear masked password on focus so user can type a new one
                    if (setting.is_secret && setting.value === '********') {
                      const newForm = [...settingsForm];
                      newForm[index].value = '';
                      setSettingsForm(newForm);
                    }
                  }}
                />
              </div>
            ))}
            
            {settingsForm.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>No platform settings found in database.</p>
              </div>
            )}

            {settingsForm.length > 0 && (
              <div style={{ marginTop: '0.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={settingsSaving} style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}>
                  {settingsSaving ? 'Saving...' : 'Save Integrations'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
