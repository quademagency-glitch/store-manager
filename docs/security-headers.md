# Security headers

Two places set headers, and they are not interchangeable.

| Where | Serves | Sets |
|---|---|---|
| `vercel.json` | The SPA document (`index.html`) and static assets | **CSP**, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |
| `store-app/server/index.js` (helmet) | JSON API responses | HSTS, `nosniff`, `frameguard`, `Referrer-Policy`, CORP, `hidePoweredBy` |

## Why there is no CSP on the API server

CSP applies to **documents and workers**, not to `fetch`/XHR responses. A
`Content-Security-Policy` header on `GET /api/sales` is parsed by nothing. The
policy that constrains what the frontend may load, execute or connect to has to
be attached to the HTML document — which Vercel serves, not Express.

Putting CSP directives in helmet would look like a control while doing nothing.
`contentSecurityPolicy: false` in `index.js` is deliberate; don't "fix" it.

Two related corrections to assumptions that keep resurfacing:

- **Paystack needs no CSP allowance.** `BusinessAdmin/Billing.jsx` redirects via
  `window.location.href` — a top-level navigation. There is no iframe and no
  popup, and CSP has no shipped directive that restricts top-level navigation
  (`navigate-to` was never shipped; `form-action` only covers form submissions).
- **Recharts needs `style-src-attr 'unsafe-inline'`, not blanket
  `style-src 'unsafe-inline'`.** It sets inline `style=` attributes. Tailwind v4
  emits a real stylesheet, which `'self'` already covers.

## ⚠️ The inline-script hashes will bite you

`store-app/client/index.html` contains **two inline `<script>` blocks**:

1. the pre-paint theme resolver (must stay synchronous and inline — as an
   external file it would flash an unstyled page), and
2. the service-worker `controllerchange` reload hook.

`script-src` allows them by **SHA-256 hash**. If you edit either script — even
one character of whitespace or a comment — its hash changes and the browser
will refuse to run it. Blocking the theme script renders the app as an
unstyled white page.

**After any edit to `index.html`, recompute and update the hashes in
`vercel.json`:**

```bash
cd store-app/client && npm run build
node -e "
const fs=require('fs'),crypto=require('crypto');
const html=fs.readFileSync('dist/index.html','utf8');
const re=/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m; while((m=re.exec(html))!==null)
  console.log(\"'sha256-\"+crypto.createHash('sha256').update(m[1],'utf8').digest('base64')+\"'\");
"
```

Hashes must be computed from **`dist/index.html`**, not the source file — the
build can alter the document around them.

## Rollout: Report-Only first

The CSP currently ships as `Content-Security-Policy-Report-Only`, so violations
are reported by the browser but **nothing is blocked**. A CSP that breaks the
POS at 9am on a Monday is worse than no CSP.

Before switching the header name to `Content-Security-Policy`:

1. Leave it in report-only for at least a week of real traffic.
2. Check the browser console on the main flows — login, dashboard, a full sale
   with a printed receipt, inventory, reports (Recharts), and a letterhead
   upload — for `[Report Only]` violation messages.
3. **Verify `VITE_API_URL` in the Vercel dashboard.** If it is unset, the client
   calls `/api` same-origin and `connect-src 'self'` covers it. If it is set to
   the Railway host, the explicit Railway origin in `connect-src` covers it.
   Both are currently allowed, so either configuration works — but if the API
   host ever changes, that entry must change with it or every API call is
   blocked.
4. Only then rename the header.

There is no `report-uri`/`report-to` endpoint configured, so violations appear
in the browser console only. If you want them aggregated, point `report-to` at
Sentry once a DSN is configured (see `store-app/server/instrument.js`).

## HSTS: why `includeSubDomains` is off

Because Vercel rewrites `/api/*` to Railway, the API's response headers reach
the browser under **`quaderp.app`**, not the Railway hostname. An HSTS header
with `includeSubDomains` would therefore pin `quaderp.app` *and every
subdomain* to HTTPS for two years, in every visitor's browser, with no way to
revoke it — including the per-business subdomains that
`services/emailService.js`'s `resolveBusinessLoginUrl` generates.

Enable it only after confirming every `*.quaderp.app` host is HTTPS-only.

## `crossOriginResourcePolicy: 'cross-origin'`

Helmet defaults this to `same-origin`, which would break the binary attachments
the API deliberately serves cross-origin: the receipts ZIP (`routes/ledger.js`),
the payroll CSV (`routes/hr.js`), and the business export. CORP does not gate
CORS-enabled fetches, so this does not widen data access — the CORS allowlist in
`index.js` is still what authorises callers.
