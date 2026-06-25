import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { useBusinessBranding } from '../hooks/useBusinessBranding';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, signOut, isAuthenticated, loading } = useAuthContext();
  const { slug, business, loading: brandingLoading } = useBusinessBranding();

  if (loading || brandingLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
      </div>
    );
  }

  // If already authenticated, redirect to root so SmartRedirect handles role-based routing
  if (isAuthenticated) {
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

    const { error: signInError, businessId } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message || 'Invalid credentials. Please try again.');
      setSubmitting(false);
      return;
    }

    // On a business-branded subdomain, the signed-in account must actually
    // belong to that business — otherwise bounce them back out rather than
    // letting them land on someone else's portal.
    if (slug && business && businessId !== business.id) {
      await signOut();
      setError(`This account isn't part of ${business.name}. Please use your business's own link.`);
      setSubmitting(false);
      return;
    }
    // If successful, we do NOT navigate here or reset submitting.
    // The AuthContext will react to the onAuthStateChange event,
    // update the global state, and the component will re-render
    // and trigger the <Navigate to="/dashboard" />.
  };

  // A slug resolved from the subdomain but no matching (or active) business
  // was found — this is not a generic login attempt, so don't show the form.
  if (slug && (!business || business.status === 'banned')) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <h1 className="login-title">Quad<span className="brand-erp">ERP</span></h1>
              <p className="login-subtitle">This business link isn't valid or is no longer active.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {business?.logo_url ? (
              <div className="login-logo">
                <img src={business.logo_url} alt={business.name} width="40" height="40" style={{ borderRadius: '8px', objectFit: 'cover' }} />
              </div>
            ) : (
              <div className="login-logo">
                <svg width="40" height="40" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="login-logo-bg" x1="60" y1="40" x2="470" y2="480" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#241E5E" /><stop offset="0.52" stopColor="#171244" /><stop offset="1" stopColor="#0D0A28" /></linearGradient>
                    <linearGradient id="login-logo-ring" x1="120" y1="120" x2="392" y2="392" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#6366F1" /><stop offset="0.5" stopColor="#4F7BF6" /><stop offset="1" stopColor="#22D3EE" /></linearGradient>
                    <linearGradient id="login-logo-b1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#4338CA" /><stop offset="1" stopColor="#4F46E5" /></linearGradient>
                    <linearGradient id="login-logo-b2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#5560F0" /><stop offset="1" stopColor="#6366F1" /></linearGradient>
                    <linearGradient id="login-logo-b3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#22D3EE" /><stop offset="1" stopColor="#3FE3F2" /></linearGradient>
                  </defs>
                  <rect width="512" height="512" rx="118" fill="url(#login-logo-bg)" />
                  <circle cx="256" cy="248" r="150" fill="none" stroke="url(#login-logo-ring)" strokeWidth="30" />
                  <line x1="332" y1="324" x2="392" y2="384" stroke="#0D0A28" strokeWidth="70" strokeLinecap="round" />
                  <line x1="332" y1="324" x2="390" y2="382" stroke="#34E0F0" strokeWidth="42" strokeLinecap="round" />
                  <rect x="186" y="326" width="150" height="20" rx="10" fill="url(#login-logo-ring)" />
                  <rect x="198" y="274" width="30" height="52" rx="11" fill="url(#login-logo-b1)" />
                  <rect x="246" y="240" width="30" height="86" rx="11" fill="url(#login-logo-b2)" />
                  <rect x="294" y="206" width="30" height="120" rx="11" fill="url(#login-logo-b3)" />
                </svg>
              </div>
            )}
            <h1 className="login-title">{business ? business.name : (<>Quad<span className="brand-erp">ERP</span></>)}</h1>
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
