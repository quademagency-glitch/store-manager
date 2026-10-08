import posthog from 'posthog-js';
import { routePattern } from './routePattern';

/**
 * Privacy clause 7.1 says analytics receives page addresses, some carrying a
 * record identifier, but never "anything you type". Search text lives in the
 * query string (`/inventory?q=…`, `/item-history?code=…`), and PostHog attaches
 * the full address to every event by itself, so each event is reduced to the
 * route pattern before it leaves the browser. It runs as `before_send` so the
 * properties PostHog adds on its own are covered, not only the ones we pass.
 */
const URL_PROPS = ['$current_url', '$initial_current_url', '$pathname', '$initial_pathname', '$referrer', '$initial_referrer'];

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

/** @param {import('@posthog/types').CaptureResult | null} event */
export function scrubEvent(event) {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const key of URL_PROPS) if (typeof bag[key] === 'string') bag[key] = scrubUrl(bag[key]);
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
