import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initErrorReporting } from './lib/errorReporting'
import 'virtual:pwa-register'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { analyticsAllowed } from './lib/analyticsGate'

/* Two conditions, not one. The key says analytics is configured; the start
   date says the 30 days' notice the DPA owes every business customer has
   actually elapsed. See lib/analyticsGate.js: enabling this is a legal change,
   and a key pasted into a dashboard should not be able to make it. */
const analyticsOn = analyticsAllowed(
  import.meta.env.VITE_POSTHOG_KEY,
  import.meta.env.VITE_POSTHOG_START,
)

if (analyticsOn) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // We handle this with React Router in App.jsx
    /* Autocapture is on by default and records clicks along with the text of
       the element clicked. This is an ERP: that text is customer names, staff
       names, product lines and amounts, and it would be sent to a processor in
       another country without anyone choosing to send it. Screens opened is
       what the analytics is for, and it is all the notice to customers claims.
       Session recording is off for the same reason, and is the more obvious
       version of the same mistake. */
    autocapture: false,
    disable_session_recording: true,
  })
}

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

const appTree = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

/* The provider is mounted only when analytics is allowed to run, rather than
   mounted always and told to stay quiet. With it absent, usePostHog() returns
   undefined and PostHogPageView's existing guard means nothing is captured,
   so there is no path from "key set early" to "data sent". */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {analyticsOn ? <PostHogProvider client={posthog}>{appTree}</PostHogProvider> : appTree}
  </StrictMode>,
)
