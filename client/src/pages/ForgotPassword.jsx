import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      setMessage('Check your email for the password reset link.');
    } catch (err) {
      setError(err.message || 'An error occurred during password reset.');
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
            <h1 className="login-title">Reset Password</h1>
            <p className="login-subtitle">Enter your email to receive a reset link</p>
          </div>

          <form onSubmit={handleResetPassword} className="login-form">
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
              <label htmlFor="email" className="login-label">Email address</label>
              <div className="login-input-wrapper">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="login-input"
                  required
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
              {loading ? 'Sending link...' : 'Send Reset Link'}
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/login" style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
                &larr; Back to Login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
