/**
 * Turn a resolved URL path into the route pattern that produced it.
 *
 * WHY THIS EXISTS: @vercel/speed-insights sends `window.location.pathname`
 * verbatim when it is not given a `route`. Three routes in this app carry a
 * record id, `/customers/:id`, `/invoice/:id` and `/imports/:entityType`, so
 * the raw path for a real visit is `/customers/9f3c...`, and sending it would
 * put customer and invoice identifiers into a third party's analytics with
 * nobody having decided to send them.
 *
 * It also makes the numbers useless. Every customer becomes its own "route",
 * so the one page you might want a p75 for is split into as many buckets as
 * you have customers, each with a single sample.
 *
 * react-router's own `useMatches` would give the pattern directly, but it
 * needs a data router (createBrowserRouter) and App.jsx uses <BrowserRouter>
 * with declarative <Routes>. Matching the shape of the segment is the part
 * that does not depend on which router is in use.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} pathname
 * @returns {string} the path with identifier segments replaced by `:id`
 */
export function routePattern(pathname) {
  if (typeof pathname !== 'string' || !pathname) return '/';

  const out = pathname
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      // A uuid, or a bare number. Deliberately NOT "anything that looks
      // opaque": /imports/products is a fixed set of entity names and is
      // useful to see separately, so only shapes that are certainly an
      // identifier are collapsed.
      if (UUID.test(segment) || /^\d+$/.test(segment)) return ':id';
      return segment;
    })
    .join('/');

  return out || '/';
}
