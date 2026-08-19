/**
 * Client-side error reporting.
 *
 * THE PROBLEM THIS SOLVES: roughly 70 `console.error` calls across the app are
 * wrapped in `if (import.meta.env.DEV)`. That correctly keeps noise out of the
 * production console — but nothing replaced them, so in production every one of
 * those errors vanished completely. A user hitting a broken page produced no
 * signal anywhere.
 *
 * `reportError` is that missing sink. It is safe to call unconditionally: with
 * no VITE_SENTRY_DSN configured it logs in dev and does nothing in production,
 * exactly matching today's behaviour, so adopting it can never make things
 * worse.
 *
 * Sentry is loaded with a DYNAMIC import so Vite splits it into its own chunk
 * that is only fetched when a DSN exists. A static import would add the SDK to
 * the main bundle for every user whether or not it is ever used.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN;

let sentryPromise = null;
let sentry = null;

/** Kick off SDK load + init. Safe to call more than once. */
export function initErrorReporting() {
  if (!DSN || sentryPromise) return sentryPromise;

  sentryPromise = import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_COMMIT_SHA || undefined,
        tracesSampleRate: 0,
        // No auto-captured IPs or cookies. setUserContext below attaches an id
        // only, once the user is known.
        sendDefaultPii: false,
        beforeSend(event) {
          // Never ship request bodies — the auth screens post credentials.
          if (event.request) delete event.request.data;
          return event;
        },
      });
      sentry = Sentry;
      return Sentry;
    })
    .catch(() => {
      // A blocked or failed SDK load must never break the app.
      sentryPromise = null;
      return null;
    });

  return sentryPromise;
}

/**
 * Report a caught error.
 *
 * @param {unknown} error
 * @param {object} [context] Extra detail (endpoint, page, ids). Keep it free of
 *   anything sensitive — it is attached verbatim.
 */
export function reportError(error, context) {
  if (import.meta.env.DEV) {
    console.error('[error]', error, context ?? '');
  }
  if (!DSN) return;

  const send = (Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  };

  if (sentry) send(sentry);
  else initErrorReporting()?.then(send);
}

/** Attach the signed-in user's id. No email or name. */
export function setUserContext(user) {
  if (!DSN) return;
  const apply = (Sentry) => {
    if (!Sentry) return;
    if (user?.id) Sentry.setUser({ id: user.id });
    else Sentry.setUser(null);
    if (user?.business_id) Sentry.setTag('business_id', user.business_id);
  };
  if (sentry) apply(sentry);
  else initErrorReporting()?.then(apply);
}

/** True when a DSN is configured — lets UI offer a "Report issue" affordance. */
export const errorReportingEnabled = Boolean(DSN);
