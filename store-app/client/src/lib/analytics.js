import posthog from 'posthog-js';
import { routePattern } from './routePattern';

/**
 * Privacy clause 7.1 says analytics receives page addresses, some carrying a
 * record identifier, but never "anything you type". Search text lives in the
 * query string (`/inventory?q=…`, `/item-history?code=…`), and PostHog attaches
 * the full address to every event by itself, so each event is reduced to the
 * route pattern before it leaves the browser. It runs as `before_send` so the
 * properties PostHog adds on its own are covered, not only the ones we pass.
 *
 * Every string value is checked, not a list of known keys: on 8 October 2026
 * the live check found the full address in `$session_entry_url`, a property
 * outside the six we had listed. Any absolute URL, at any depth, and any key
 * naming a path is reduced.
 */
const PATH_KEY = /pathname$/i;
// A bare query string or fragment carries exactly what users type. Dropped.
const QUERY_KEY = /_(query|search|hash)$/i;

/**
 * @param {string} value an absolute URL, a path, or a PostHog marker such as `$direct`
 * @returns {string} same-origin: origin + route pattern; other origins: origin only
 */
export function scrubUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value.startsWith('/')) return routePattern(value.split(/[?#]/)[0]);
  try {
    const url = new URL(value);
    return url.origin === window.location.origin ? url.origin + routePattern(url.pathname) : url.origin;
  } catch {
    return value;
  }
}

function scrubValue(value, key, depth) {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) || (PATH_KEY.test(key) && value.startsWith('/'))) return scrubUrl(value);
    return value;
  }
  if (value && typeof value === 'object' && depth < 4) {
    for (const k of Object.keys(value)) {
      if (QUERY_KEY.test(k)) delete value[k];
      else value[k] = scrubValue(value[k], k, depth + 1);
    }
  }
  return value;
}

/** @param {import('@posthog/types').CaptureResult | null} event */
export function scrubEvent(event) {
  if (!event) return event;
  for (const bag of ['properties', '$set', '$set_once']) {
    if (event[bag]) scrubValue(event[bag], bag, 0);
  }
  return event;
}

/**
 * Anonymous task timing: which everyday task finished and how long it took
 * from its first step. No names, amounts, products or record ids, only the
 * task and the duration (Privacy 7.1 and 14.2, DPA 5.2).
 */
const TASKS = new Set(['sale', 'till_close', 'goods_received', 'return', 'purchase_order']);
const MAX_DURATION_MS = 60 * 60 * 1000;

/** A start mark for `trackTask`. */
export const taskStart = () => performance.now();

/**
 * @param {'sale'|'till_close'|'goods_received'|'return'|'purchase_order'} task
 * @param {number|null} [startedAt] from `taskStart()`; omitted when unknown
 */
export function trackTask(task, startedAt = null) {
  if (!TASKS.has(task) || !posthog.__loaded) return;
  const elapsed = typeof startedAt === 'number' ? Math.round(performance.now() - startedAt) : null;
  const timed = elapsed !== null && elapsed >= 0 && elapsed <= MAX_DURATION_MS;
  posthog.capture('task_completed', timed ? { task, duration_ms: elapsed } : { task });
}
