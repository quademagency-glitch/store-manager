# QuadERP web app (app.quaderp.app)

React + Vite single-page app. The API it talks to is `store-app/server`, on
Railway.

## Build and deploy

Hosted on a Cloudflare Worker, `quaderp-app` (Vercel until October 2026).
Cloudflare Workers Builds deploys every push to `main` that touches
`store-app/client/`: it runs `npm run build` here, then `npx wrangler deploy`.

- `npm run build` runs the guard scripts (privacy claims, inline styles, CSP
  hashes, PWA update behaviour) around `vite build`. A failing guard stops the
  deploy.
- `VITE_` values are build variables in Cloudflare (Worker > Settings >
  Build). They are compiled into the JavaScript every visitor downloads, so
  never put a secret in one. The list is in `../../.env.production.example`.
- `public/_headers` holds the response headers and the Content-Security-Policy
  for everything served from `dist/`. `scripts/csp-policy.mjs` reads the policy
  from there for the CSP checks.
- `worker/index.js` answers `/api/*` only, forwarding it to the API on Railway
  with the caller's real address in `Forwarded`. Everything else is static,
  with unknown paths falling back to `index.html` for React Router.
- `wrangler.jsonc` is the Worker's config, including the app.quaderp.app
  domain.

To deploy by hand: `npm run build && npx wrangler deploy`, with the `VITE_`
values in a `.env.production.local` (git ignores it).

## Branded sign-in addresses

`<business>.app.quaderp.app` is switched off (`VITE_BRANDED_SUBDOMAINS`, and
`BRANDED_SUBDOMAINS` on the server). Turning it back on is described under
`BRANDED_SUBDOMAINS` in `../../.env.production.example`.
