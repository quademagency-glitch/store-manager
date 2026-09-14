const { ipKeyGenerator } = require('express-rate-limit');

/**
 * The address of whoever actually made the request, as best it can be known.
 *
 * WHY THIS IS NOT req.ip
 *
 * The SPA reaches this API through Vercel's rewrite of /api/*. Express derives
 * req.ip from x-forwarded-for, and Railway's edge REPLACES that header rather
 * than appending to it, so by the time Express reads it the original caller is
 * gone. Measured against production on 2026-08-21, one request from
 * 154.163.174.227:
 *
 *   x-forwarded-for         15.240.64.77, 152.233.29.1   Vercel egress, Railway edge
 *   x-vercel-forwarded-for  154.163.174.227              the caller
 *   forwarded               for=154.163.174.227; ...     the caller, RFC 7239
 *
 * So every browser request on the platform collapsed into a handful of Vercel
 * egress addresses, and any limiter keyed on req.ip counted the whole platform
 * into one bucket.
 *
 * HOW FAR THIS CAN BE TRUSTED: NOT VERY
 *
 * The Railway host is publicly reachable, by necessity, Paystack's webhooks
 * arrive on it directly. Anyone calling it can set these headers to whatever
 * they like, so a value from here is a CLAIM, not a fact. It is good enough to
 * give genuine visitors their own rate-limit budget, which is what it is for,
 * and useless as a security control on its own. Every limiter that keys on it
 * must sit behind a global ceiling that does not, or an attacker rotating the
 * header simply walks past it, which is worse than not having recovered the
 * address at all.
 *
 * Do NOT wire this into app.set('trust proxy') or into req.ip globally. That
 * would push a spoofable value into every limiter in the app, including the
 * ones that are currently sound, and into anything else that records an
 * address.
 */

/** Strip a port, IPv6 brackets, and RFC 7239's quoting. */
function normalise(value) {
  if (typeof value !== 'string') return null;
  let v = value.trim().replace(/^"|"$/g, '').trim();
  if (!v) return null;

  // "[2001:db8::1]:443" or "[2001:db8::1]"
  const bracketed = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1].toLowerCase();

  // "203.0.113.9:443". A bare IPv6 has many colons and no port, leave it be.
  if ((v.match(/:/g) || []).length === 1) v = v.split(':')[0];

  return v.toLowerCase() || null;
}

/**
 * Pull the first `for=` out of an RFC 7239 Forwarded header.
 * e.g. `for=154.163.174.227;host=example.com;proto=https`
 */
function fromForwarded(header) {
  if (typeof header !== 'string') return null;
  // Leftmost element is the original client, the same convention as XFF.
  const first = header.split(',')[0];
  const match = first.match(/for\s*=\s*("[^"]*"|[^;,\s]+)/i);
  return match ? normalise(match[1]) : null;
}

/**
 * @param {import('express').Request} req
 * @returns {string} an address, never empty, falling back to req.ip
 */
function clientAddress(req) {
  // Vercel's own header first: it is the one measured to carry the caller on
  // the path the SPA actually uses.
  const vercel = req.get('x-vercel-forwarded-for');
  if (vercel) {
    // Comma-separated if it has itself been through a proxy; leftmost is the
    // original client.
    const first = normalise(vercel.split(',')[0]);
    if (first) return first;
  }

  const forwarded = fromForwarded(req.get('forwarded'));
  if (forwarded) return forwarded;

  // Direct callers (webhooks, uptime probes, anything not via Vercel) land
  // here, and for them req.ip is correct: trust proxy is set to the real hop
  // count and x-forwarded-for has not been through Vercel.
  return normalise(req.ip) || 'unknown';
}

/**
 * The rate-limit bucket for a caller. Use THIS as a `keyGenerator`, never
 * `clientAddress` directly.
 *
 * clientAddress returns one exact address. For IPv4 that is a fair bucket,
 * because an address is roughly a caller. For IPv6 it is not: a home
 * connection is handed a whole prefix, so the same person can send every
 * request from a different address and be given a brand new allowance each
 * time. The limit still reads as enforced and simply never fires.
 *
 * express-rate-limit calls this out at startup, once per limiter per worker,
 * as ERR_ERL_KEY_GEN_IPV6. With eight workers that was 72 lines of red
 * stack trace on every boot, ahead of any "Worker started" line, which is
 * both how the bypass stayed unnoticed and why a perfectly healthy deploy
 * looked like a crash loop in the Railway log view.
 *
 * ipKeyGenerator leaves IPv4 untouched and collapses IPv6 to its /56, so one
 * visitor gets one bucket. A non-address fallback such as 'unknown' passes
 * through unchanged rather than throwing.
 */
function clientAddressKey(req) {
  return ipKeyGenerator(clientAddress(req));
}

module.exports = { clientAddress, clientAddressKey, fromForwarded, normalise };
