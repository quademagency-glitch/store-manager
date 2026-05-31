import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a hash fragment (which contains the access token for recovery)
    const hash = window.location.hash;
    if (!hash || !hash.includes('type=recovery')) {
      // If we are logged in, we can update password anyway. If not, this page might not work correctly.
      // But let's allow it to attempt the update using the session.
    }
  }, []);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setMessage('Password updated successfully! Redirecting to dashboard...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || 'An error occurred while updating the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1"></div>
      <div className="login-bg-orb login-bg-orb-2"></div>
      
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Set New Password</h1>
            <p className="login-subtitle">Enter your new secure password</p>
          </div>

          <form onSubmit={handleUpdatePassword} className="login-form">
            {error && (
              <div className="alert alert-error mb-md">
                {error}
              </div>
            )}
            
            {message && (
              <div className="alert alert-success mb-md" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '1rem', borderRadius: '8px' }}>
                {message}
              </div>
            )}

            <div className="login-field">
              <label htmlFor="password" className="login-label">New Password</label>
              <div className="login-input-wrapper">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  required
                  minLength={6}
                  disabled={loading}
                  style={{ paddingLeft: '1rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
