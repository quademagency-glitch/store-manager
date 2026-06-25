// Per-business branded login: visiting acme-hardware.app.quaderp.app shows
// a login page branded for that business. quaderp.app itself is the public
// landing site (a separate app/deployment) — the ERP lives one level down,
// at app.quaderp.app, so business slugs nest under that, not the apex.
// Detection is scoped strictly to our own base domain so Vercel preview
// URLs (*.vercel.app) and localhost are never mistaken for a business
// subdomain.
const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'app.quaderp.app';
const RESERVED_SUBDOMAINS = new Set(['www', 'api']);

export function getBusinessSlugFromHost(hostname = window.location.hostname) {
  const suffix = `.${BASE_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null;

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.') || RESERVED_SUBDOMAINS.has(slug)) return null;

  return slug;
}
