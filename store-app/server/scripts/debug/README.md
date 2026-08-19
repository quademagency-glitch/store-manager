# Debug & one-off scripts

Local operator tooling. **Nothing in this directory is imported by the running
server** — `index.js`, `worker.js` and `cluster.js` never require anything from
here, so these files ship to Railway as dead weight but cannot execute on their
own.

They are kept deliberately. A production audit recommended deleting the whole
directory; that was declined because several of these are the only written
record of how a past incident was diagnosed and repaired.

## Before running any of these

Most connect to **production** via `DIRECT_URL` or the service-role Supabase key
— they bypass RLS entirely and several of them write. There is no dry-run flag
and no confirmation prompt. Read the file before you run it, and check which
database your `.env` currently points at.

## What's here

| Script | Purpose |
|---|---|
| `align-plan-pricing.js` | Realigns `platform_plans` rows to the landing page's prices. See the pricing note below. |
| `check_db.cjs`, `check_db2.cjs`, `check_db3.cjs` | Ad-hoc read-only inspection queries from separate investigations. |
| `fix-invoices.js`, `fix-invoices-amount.js` | Repair scripts for malformed `billing_invoices` rows. |
| `fix-subscription.js` | Repairs a single business's subscription state by hand. |
| `test-login.js`, `test-refresh.js`, `test-users.js`, `test-add.js`, `test-body.js`, `test-browser.js`, `test_api.js`, `test_delete.js`, `test_invoice.cjs` | Manual endpoint probes predating the Jest suite. Superseded by `__tests__/` for anything you'd write today. |

## Pricing caveat

The landing page is the source of truth for pricing, not `platform_plans`. If
you run `align-plan-pricing.js`, also check `compare_at` and `promo_mode` — a
price edit that leaves a stale `compare_at` behind turns into a fake discount on
the pricing page.

## Adding to this directory

Prefer a real test in `__tests__/` or a documented command in `db/README.md`.
A script only belongs here if it is a genuine one-off against live data — and if
it destroys data, say so in a header comment at the top of the file.
