/**
 * Splitting a cluster-wide rate limit across worker processes.
 *
 * express-rate-limit's default MemoryStore lives inside one process. This API
 * runs under cluster with one worker per core, measured at 8 in production on
 * 2026-08-21, and Node round-robins connections between them. So a limit of
 * `max: 100` is not 100 requests, it is 100 PER WORKER, and the real ceiling is
 * 800. Nothing warns about this; the RateLimit-Remaining header a caller sees
 * is the count for whichever worker answered, which is why the same caller can
 * watch it read 4, 4, 3, 4 across four consecutive requests.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
 *
 * Use it for a large, coarse ceiling whose whole job is to bound a runaway:
 * dividing 100 across 8 workers gives 13 each, and 13 is far above anything a
 * single caller does, so the division costs nothing and the total comes out
 * roughly where it was meant to.
 *
 * Do NOT use it on a small per-person limit. Ten failed logins split eight ways
 * is one per worker, and a person who mistypes their password twice and is
 * unlucky enough to be routed to the same worker twice is locked out for
 * fifteen minutes having made two attempts. That trades a limit which is too
 * loose for one which is wrong, and being wrong here means locking out
 * customers.
 *
 * So the small per-person limits in routes/auth.js are deliberately left
 * undivided and are therefore effectively multiplied by the worker count. That
 * is a real weakness, not a rounding detail: it makes ten failed logins per
 * account nearer eighty. Fixing it properly needs a store shared between
 * workers, which is a decision about infrastructure rather than a number to
 * tune here.
 */

/**
 * @param {number} total the limit you want across the whole cluster
 * @returns {number} the per-process limit to configure, never below 1
 */
function perWorker(total) {
  const workers = Math.max(1, parseInt(process.env.WORKER_COUNT, 10) || 1);
  return Math.max(1, Math.ceil(total / workers));
}

module.exports = { perWorker };
