import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reportError } from '../lib/errorReporting';

/**
 * React error boundary.
 *
 * Two variants, because "something broke" means different things depending on
 * how much is still standing:
 *
 *   variant="page"  (default) The whole app is gone. Offer a reload, because
 *                   there is nothing else left to interact with.
 *   variant="route" Only the page content failed. The sidebar, the navigation
 *                   and the rest of the shell are still alive, so the fallback
 *                   sits in the content area and offers a way back rather than
 *                   pretending the application died.
 *
 * WHY THE ROUTE VARIANT EXISTS
 *
 * There was one boundary, wrapped around <Routes> in App.jsx. A throw anywhere
 * in any of ~49 pages therefore unmounted the entire application, sidebar
 * included, and left a centred error message on an otherwise blank screen. The
 * only way out was reloading, which on a POS mid-sale means losing the cart.
 *
 * `resetKey` is what makes the route variant more than decoration. Without it
 * the boundary stays latched after it catches, so even navigating elsewhere
 * would keep showing the error: React does not reset boundary state on its
 * own. Feeding it the pathname clears the error the moment the user goes
 * somewhere else, which is the recovery people actually attempt first.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // reportError handles the DEV console itself and is a no-op in production
    // when no DSN is configured. Previously this branch was DEV-only, so a
    // crash in production left no trace anywhere.
    reportError(error, {
      componentStack: errorInfo?.componentStack,
      boundary: this.props.name,
    });
    this.setState({ errorInfo });
  }

  componentDidUpdate(prevProps) {
    // Clear on navigation. A boundary that has caught stays caught until its
    // state is reset, so without this the user would carry the error with them
    // to every subsequent page.
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  /**
   * Put the details on the clipboard.
   *
   * Deliberately not a "Report issue" button: no error reporting DSN is
   * configured, so such a button would look like it filed something and file
   * nothing. Copying works today, needs no account, and gives the user
   * something concrete to paste into a support email.
   */
  copyDetails = async () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Page: ${window.location.pathname}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.toString() ?? 'unknown'}`,
      errorInfo?.componentStack ? `\nComponent stack:${errorInfo.componentStack}` : '',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
    } catch {
      // Clipboard access is denied over plain http and in some embedded
      // browsers. Say nothing rather than throwing inside the error screen,
      // which is the one place a second failure is least recoverable.
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isRoute = this.props.variant === 'route';

    return (
      <div className={`error-boundary ${isRoute ? 'error-boundary--route' : 'error-boundary--page'}`} role="alert">
        <div className="error-boundary-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="error-boundary-title">
          {isRoute ? 'This page ran into a problem' : 'Something went wrong'}
        </h1>

        <p className="error-boundary-message">
          {isRoute
            ? 'The rest of the app is still working, so you can carry on somewhere else.'
            : 'An unexpected error stopped the application.'}
        </p>

        {import.meta.env.DEV && this.state.error && (
          <div className="error-boundary-details">
            <strong>{this.state.error.toString()}</strong>
            <pre>{this.state.errorInfo?.componentStack}</pre>
          </div>
        )}

        <div className="error-boundary-actions">
          {isRoute ? (
            <>
              <button className="btn btn-primary" onClick={this.reset}>Try again</button>
              {this.props.onGoHome && (
                <button className="btn btn-secondary" onClick={this.props.onGoHome}>
                  Go to dashboard
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          )}
          <button className="btn btn-secondary" onClick={this.copyDetails}>
            {this.state.copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      </div>
    );
  }
}

/**
 * The boundary that wraps the routed content inside the app shell.
 *
 * A separate component because the class above cannot use hooks, and the two
 * things that make the route variant work, the current pathname and a way to
 * navigate, both come from them.
 */
export function RouteErrorBoundary({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      variant="route"
      name={`route:${location.pathname}`}
      resetKey={location.pathname}
      onGoHome={() => navigate('/dashboard')}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
