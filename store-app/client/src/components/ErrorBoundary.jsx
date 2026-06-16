import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    if (import.meta.env.DEV) console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💥</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--color-error, #ef4444)' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
            An unexpected error occurred in this part of the application.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <div style={{ textAlign: 'left', background: 'var(--color-bg-secondary)', padding: '1rem', borderRadius: '8px', overflow: 'auto', marginBottom: '2rem', fontSize: '0.85rem' }}>
              <strong style={{ color: 'var(--color-error, #ef4444)' }}>{this.state.error.toString()}</strong>
              <br />
              <pre style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
          )}
          <button 
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              window.location.reload();
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}
