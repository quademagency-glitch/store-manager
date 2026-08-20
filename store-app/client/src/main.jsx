import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initErrorReporting } from './lib/errorReporting'
import 'virtual:pwa-register'

// Lets the Playwright harness prove it is talking to the dev server *it*
// started. A leftover server from an earlier run serves pre-edit modules, and
// the whole suite then passes against stale baselines without a single
// failure, see tests/helpers.ts. Statically replaced at build time, so this
// folds to `undefined` and drops out of a production bundle.
if (import.meta.env.VITE_TEST_NONCE) {
  window.__TEST_NONCE__ = import.meta.env.VITE_TEST_NONCE;
}

// There used to be a second ErrorBoundary class defined inline here, separate
// from components/ErrorBoundary.jsx and with a different fallback UI. It
// rendered `error.toString()` into a <pre> UNCONDITIONALLY, so production users
// saw raw exception text, while the shared boundary correctly hides that
// behind import.meta.env.DEV. Two boundaries with two behaviours also meant a
// crash's appearance depended on which one caught it. There is now one.
initErrorReporting();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
