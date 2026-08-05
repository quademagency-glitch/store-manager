import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'virtual:pwa-register'

// Lets the Playwright harness prove it is talking to the dev server *it*
// started. A leftover server from an earlier run serves pre-edit modules, and
// the whole suite then passes against stale baselines without a single
// failure — see tests/helpers.ts. Statically replaced at build time, so this
// folds to `undefined` and drops out of a production bundle.
if (import.meta.env.VITE_TEST_NONCE) {
  window.__TEST_NONCE__ = import.meta.env.VITE_TEST_NONCE;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'white', background: '#0a0a0f', minHeight: '100vh' }}>
          <h2 style={{ color: '#ef4444' }}>Something went wrong.</h2>
          <pre style={{ background: '#1a1a2e', padding: '15px', borderRadius: '8px', overflowX: 'auto', marginTop: '10px' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#6366f1', color: 'white', borderRadius: '5px' }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
