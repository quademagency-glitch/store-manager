import { useState } from 'react';
import { useAuthContext } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function ProfileTab() {
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    </>
  );
}
