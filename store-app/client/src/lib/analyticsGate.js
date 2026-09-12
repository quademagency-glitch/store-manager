/**
 * Whether product analytics is allowed to run at all.
 *
 * This is a legal control expressed as code, not a feature flag.
 *
 * Clause 5.3 of the Data Processing Agreement commits us to at least 30 days'
 * notice by email before a new sub-processor begins processing, with a right to
 * object and terminate for a refund. Clause 7 of the Privacy Policy lists
 * PostHog as not in use, and clause 14.2 promises no third-party analytics that
 * profile you. All three of those statements become false the moment analytics
 * starts sending, and the person who makes that happen will be setting an
 * environment variable, which does not feel like publishing a legal change.
 *
 * So a key on its own is not enough. A start date has to be set as well, and it
 * has to have arrived. The date is the thing somebody has to think about: it is
 * chosen as 30 days after the notice actually went out, and it cannot be
 * arrived at by pasting a key into a dashboard.
 *
 * Set VITE_POSTHOG_START to an ISO date, e.g. 2026-09-30.
 */

/**
 * @param {string|undefined} key   The project key, if one is configured.
 * @param {string|undefined} start ISO date the notice period ends.
 * @param {Date} [now]
 * @returns {boolean}
 */
export function analyticsAllowed(key, start, now = new Date()) {
  if (!key) return false;
  return subprocessorAllowed(start, now);
}

/**
 * The same clause 5.3 test, for a sub-processor that has no key to configure.
 *
 * PostHog needs a project key, so `analyticsAllowed` can insist on one and the
 * date is the second lock. Vercel Speed Insights has no key at all: it starts
 * sending the moment its component is mounted, which means the ONLY thing
 * standing between a routine `npm i` and a new sub-processor is this date.
 *
 * That makes the date matter more here, not less. Clause 5.2 of the DPA
 * discloses Vercel for "web application hosting and delivery", and the Privacy
 * Policy's table says the same. Performance analytics is a different purpose
 * from delivery, so switching this on without the 30 days' notice makes both
 * of those documents inaccurate about a company already named in them, which
 * is a worse position than an undisclosed processor: the row looks checked.
 *
 * Set VITE_SPEED_INSIGHTS_START to an ISO date 30 days after the notice goes
 * out, exactly as with VITE_POSTHOG_START.
 *
 * @param {string|undefined} start ISO date the notice period ends.
 * @param {Date} [now]
 * @returns {boolean}
 */
export function subprocessorAllowed(start, now = new Date()) {
  if (!start) return false;

  const startsAt = new Date(`${String(start).trim()}T00:00:00Z`);
  if (Number.isNaN(startsAt.getTime())) return false;

  return now >= startsAt;
}
