/**
 * Read-mostly enforcement for the public demo tenant.
 *
 * The sandbox is more convincing if visitors can actually *do* something —
 * ring up a sale, add a product, register a customer — so this does not
 * blanket-block writes. It blocks the two categories that would ruin it:
 *
 *   1. Destruction. Deleting the catalogue or voiding the sales history
 *      leaves the next visitor an empty shop. The nightly reset would fix it
 *      eventually; the visitor twenty minutes later would still have seen
 *      nothing.
 *   2. Account and platform surface. Billing, subscriptions, team management,
 *      roles, integrations, API keys. Nothing here is interesting to
 *      demonstrate, and all of it is a way to make a mess that outlives the
 *      session — an invited "team member" would get a real email.
 *
 * Invoked from inside authGuard rather than mounted as its own middleware.
 * authGuard is what every authenticated route already goes through, and it is
 * the only place req.user exists — mounting this globally would run it before
 * authGuard, where there is no user to check and nothing would ever be
 * blocked. Calling it there means a new router is covered the day it is
 * written, with nobody having to remember.
 *
 * This is a product guardrail, not a security boundary: the demo account's
 * real protection is that it owns nothing worth taking and is rebuilt nightly.
 * Tenant isolation is still RLS and business_id scoping, exactly as for
 * everyone else.
 */

const logger = require('../utils/logger');

/**
 * Route mounts a demo visitor may not write to at all, by any method.
 * Matched against req.baseUrl, i.e. the path the router was mounted at.
 */
const BLOCKED_MOUNTS = new Set([
  '/api/billing',
  '/api/subscriptions',
  '/api/users',
  '/api/roles',
  '/api/integrations',
  '/api/platform',
  '/api/communications',
  '/api/crm-communications', // sends real SMS and email to real numbers
]);

/**
 * Paths a demo visitor may not POST to, even on an otherwise-open mount.
 * Matched as a prefix against the path within the router.
 */
const BLOCKED_ACTIONS = [
  { mount: '/api/sales', path: '/void' },
  { mount: '/api/sales', path: '/refund' },
  { mount: '/api/returns', path: '/' },       // a return reverses real history
  { mount: '/api/stocktake', path: '/commit' },
  { mount: '/api/imports', path: '/undo' },
  { mount: '/api/businesses', path: '/send-welcome' },
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Why this request should be refused, or null to let it through.
 *
 * A pure predicate rather than middleware so authGuard can consult it at both
 * of its exit points (cache hit and cache miss) without the two of them
 * drifting apart.
 *
 * @param {import('express').Request} req — must already have req.user
 * @returns {string|null} a message written for the visitor, or null
 */
function demoWriteRefusal(req) {
  if (!req.user || !req.user.is_demo) return null;
  if (!WRITE_METHODS.has(req.method)) return null;

  if (req.method === 'DELETE') {
    return 'Deleting things is switched off in the demo, so the next visitor gets a full store. Start a free trial to try it for real.';
  }

  if (BLOCKED_MOUNTS.has(req.baseUrl)) {
    return 'Account, billing and team settings are read-only in the demo. Start a free trial to set up your own.';
  }

  for (const action of BLOCKED_ACTIONS) {
    if (req.baseUrl === action.mount && req.path.startsWith(action.path)) {
      return 'That action is switched off in the demo. Start a free trial to try it for real.';
    }
  }

  logger.debug({ method: req.method, path: `${req.baseUrl}${req.path}` }, '[demo] write allowed');
  return null;
}

function respondDemoRefusal(res, reason) {
  return res.status(403).json({
    error: 'Not available in the demo',
    code: 'DEMO_READ_ONLY',
    message: reason,
  });
}

module.exports = { demoWriteRefusal, respondDemoRefusal, BLOCKED_MOUNTS, BLOCKED_ACTIONS };
