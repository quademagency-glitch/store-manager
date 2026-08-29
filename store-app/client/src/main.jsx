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
    /* The four below are NOT covered by `autocapture: false`. Each is its own
       switch, each defaults to whatever PostHog's project settings say, and on
       2026-08-29 the project said yes to all of them: a debug trace of the
       live app logged "[Heatmaps] starting", "[Dead Clicks] starting" and
       "[ExceptionAutocapture] enabled" within a second of load.

       Heatmaps and dead clicks are click tracking — the exact thing the
       privacy notice tells customers is switched off, and dead clicks carry
       the text of the element clicked, which in an ERP is a customer or
       product name. Exception autocapture ships error messages and stack
       traces, which quote whatever the user was working on.

       They are pinned here rather than in the PostHog dashboard for the same
       reason the start date is: a checkbox in someone's dashboard should not
       be able to silently make our published privacy notice untrue. */
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    disable_surveys: true,
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
   mounted always and told to stay quiet, so there is no path from "key set
   early" to "data sent".

   Note the mechanism is NOT that usePostHog() goes undefined without a
   provider: posthog-js/react's context default returns the global instance,
   so the hook always hands back an object and PostHogPageView's `if (posthog)`
   guard always passes. What actually stops it is that posthog.init() never
   runs, leaving __loaded false, and capture() returns at its own first guard.
   The property holds; this comment used to give the wrong reason for it. */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {analyticsOn ? <PostHogProvider client={posthog}>{appTree}</PostHogProvider> : appTree}
  </StrictMode>,
)
