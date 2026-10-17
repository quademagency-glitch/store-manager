// Per-business branded login: visiting acme-hardware.app.quaderp.app shows
// a login page branded for that business. quaderp.app itself is the public
// landing site (a separate app/deployment), the ERP lives one level down,
// at app.quaderp.app, so business slugs nest under that, not the apex.
// Detection is scoped strictly to our own base domain so Vercel preview
// URLs (*.vercel.app) and localhost are never mistaken for a business
// subdomain.
const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'app.quaderp.app';

// Whether to send people to a business's branded address. Off unless
// VITE_BRANDED_SUBDOMAINS is 'on', matching BRANDED_SUBDOMAINS on the server
// (server/services/emailService.js says why and .env.production.example has
// the steps). Recognising a branded host below is unaffected: when the
// addresses work again, the login page brands itself without a code change.
export const BRANDED_SUBDOMAINS = import.meta.env.VITE_BRANDED_SUBDOMAINS === 'on';
const RESERVED_SUBDOMAINS = new Set(['www', 'api']);

export function getBusinessSlugFromHost(hostname = window.location.hostname) {
  const suffix = `.${BASE_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null;

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.') || RESERVED_SUBDOMAINS.has(slug)) return null;

  return slug;
}

// Where a business's people sign in: its branded URL, e.g.
// https://acme.app.quaderp.app, when branded subdomains are on, otherwise the
// shared app address. Mirrors the server's resolveBusinessLoginUrl so both
// sides agree.
export function getBusinessUrl(slug) {
  if (!slug) return null;
  return BRANDED_SUBDOMAINS ? `https://${slug}.${BASE_DOMAIN}` : `https://${BASE_DOMAIN}`;
}
