// Cloudflare Worker for app.quaderp.app.
//
// The built app in dist/ is served by Workers Static Assets, with the
// single-page fallback and the headers in public/_headers. Only /api/* reaches
// this code (run_worker_first in wrangler.jsonc). It forwards those requests
// to the API on Railway, as the /api rewrite in vercel.json used to.
//
// The SPA itself calls the API directly (VITE_API_URL); what arrives here is
// mostly the browser's CSP reports (Reporting-Endpoints in public/_headers).

const API_ORIGIN = 'https://store-manager-api-production-c330.up.railway.app';

// Headers that claim to say who the caller is. A visitor can send any of
// them, so they are dropped and replaced with what Cloudflare saw.
// server/utils/clientAddress.js reads x-vercel-forwarded-for first, then
// Forwarded: leaving a client's own copy in place would let anyone pick their
// rate-limit bucket.
const CLIENT_CLAIMS = ['x-vercel-forwarded-for', 'forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host', 'x-forwarded-proto'];

/** RFC 7239 node: IPv6 is quoted and bracketed, IPv4 is bare. */
function forwardedFor(ip) {
  return ip.includes(':') ? `"[${ip}]"` : ip;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, API_ORIGIN);

    const headers = new Headers(request.headers);
    for (const h of CLIENT_CLAIMS) headers.delete(h);
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('Forwarded', `for=${forwardedFor(ip)};host=${url.host};proto=https`);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', 'https');

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    const res = new Response(upstream.body, upstream);
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    return res;
  },
};
