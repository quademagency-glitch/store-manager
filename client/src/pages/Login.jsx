import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, isAuthenticated, loading } = useAuthContext();

  // If already authenticated, redirect to root so SmartRedirect handles role-based routing
  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message || 'Invalid credentials. Please try again.');
      setSubmitting(false);
    }
    // If successful, we do NOT navigate here or reset submitting. 
    // The AuthContext will react to the onAuthStateChange event,
    // update the global state, and the component will re-render
    // and trigger the <Navigate to="/dashboard" />.
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1"></div>
      <div className="login-bg-orb login-bg-orb-2"></div>
      <div className="login-bg-orb login-bg-orb-3"></div>

      <div className="login-container">
        <div className="login-card">
          {/* Logo / Brand */}
          <div className="login-header">
            <div className="login-logo">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="12" fill="url(#logo-gradient)" />
                <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" fillOpacity="0.9" />
                <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" fillOpacity="0.6" />
                <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" fillOpacity="0.6" />
                <defs>
                  <linearGradient id="logo-gradient" x1="0" y1="0" x2="40" y2="40">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className="login-title">Store Manager</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form" id="login-form">
            {error && (
              <div className="login-error" id="login-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email" className="login-label">Email address</label>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2.25 5.25L8.16 9.015C8.68 9.345 9.32 9.345 9.84 9.015L15.75 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2.25" y="3.75" width="13.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="login-input"
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="login-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="password" className="login-label">Password</label>
                <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: 'var(--color-accent-primary)', textDecoration: 'none' }}>
                  Forgot Password?
                </Link>
              </div>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="3.75" y="8.25" width="10.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8.25V5.25C6 3.59315 7.34315 2.25 9 2.25C10.6569 2.25 12 3.59315 12 5.25V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2.25 2.25L15.75 15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M7.5 3.816A7.5 7.5 0 0115.75 9c-.458.915-1.095 1.727-1.87 2.386M3.87 6.614A7.5 7.5 0 002.25 9a7.5 7.5 0 006.75 4.184" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M10.59 10.59a2.25 2.25 0 01-3.18-3.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2.25 9C3.35 6.15 5.95 4.5 9 4.5C12.05 4.5 14.65 6.15 15.75 9C14.65 11.85 12.05 13.5 9 13.5C5.95 13.5 3.35 11.85 2.25 9Z" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-button"
              id="login-submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="login-button-loading">
                  <span className="login-button-spinner"></span>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-footer">
            <p>Store Management System v1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
