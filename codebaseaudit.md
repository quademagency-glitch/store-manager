# QERP Store — Codebase Audit & Improvement Roadmap

## Summary

After reading through the entire client and server codebase, I've categorized findings into **Critical** (should fix now), **Important** (fix soon), and **Nice-to-Have** (future polish). The app is functional but has accumulated technical debt that, if addressed, will make it significantly more maintainable, secure, and professional.

---

## 🔴 Critical Issues

### 1. Security: `new Function()` eval in client code
> [!CAUTION]
> [AccountingTemplates.jsx:L133](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/AccountingTemplates.jsx#L133) uses `new Function()` to evaluate conditional logic strings. This is essentially `eval()` and opens a **code injection** vulnerability if an admin creates a malicious condition string.

**Fix:** Replace with a safe expression parser (e.g., a simple tokenizer that only supports `==`, `!=`, `&&`, `||` on known field values — no arbitrary JS execution).

---

### 2. UI Consistency: 4 pages still use hardcoded Tailwind colors
These pages will look **broken in Light Mode** because they use hardcoded `bg-slate-800`, `text-white`, etc. instead of CSS variables:

| Page | Hardcoded Lines |
|------|----------------|
| [AccountingApprovals.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/AccountingApprovals.jsx) | ~20 lines (`bg-slate-800`, `text-white`, `bg-slate-900`) |
| [TillAccount.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/TillAccount.jsx) | ~15 lines (`text-slate-100`, `bg-slate-800`, `text-slate-400`) |
| [Reconciliation.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/Reconciliation.jsx) | ~3 lines (`text-white`) |
| [AccountingTemplates.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/AccountingTemplates.jsx) | ~1 line (spinner `text-white`) |

**Fix:** Migrate all hardcoded color classes to `var(--color-*)` CSS variables.

---

### 3. UX Anti-Pattern: 30+ uses of `alert()` and 23 uses of `window.confirm()`
Native browser `alert()` and `confirm()` dialogs are jarring, non-styleable, and block the main thread. They look completely unprofessional on a premium ERP dashboard.

**Fix:** Create a reusable `<Toast>` notification component and a `<ConfirmDialog>` modal component that match the design system.

---

## 🟡 Important Issues

### 4. Monster Files Need Splitting

| File | Lines | Issue |
|------|-------|-------|
| [PlatformAdmin.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/PlatformAdmin.jsx) | **1,961** | Way too large. Should be split into sub-pages like BusinessAdmin was. |
| [index.css](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/index.css) | **4,514** | One monolithic CSS file. Should be split into per-component/per-page stylesheets. |
| [MainLayout.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/components/MainLayout.jsx) | **670+** | Contains sidebar, topbar, mobile drawer, user menu — should be broken into smaller components. |
| [Sales.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/Sales.jsx) | **856** | POS logic, cart, payment, receipt all in one file. |
| [Inventory.jsx](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/client/src/pages/Inventory.jsx) | **851** | Stock transfers, audits, product list all in one file. |

---

### 5. Leftover/Junk Files in Repository

The following files appear to be debug scripts, one-off fixes, and backup files that should not be in production:

**Client:**
- `App.jsx.bak`
- `index.css.bak`
- `PlatformAdmin.jsx.bak`

**Server (test/debug scripts):**
- `test-add.js`, `test-login.js`, `test-refresh.js`, `test-users.js`
- `test_api.js`, `test_delete.js`, `test_invoice.cjs`
- `check_db.cjs`, `check_db2.cjs`, `check_db3.cjs`
- `fix-invoices.js`, `fix-invoices-amount.js`, `fix-subscription.js`

**Root:**
- `test-body.js`, `test-browser.js`, `css_diff.txt`

**Fix:** Move test files to a `/tests` directory or delete them. Delete `.bak` files and `css_diff.txt`.

---

### 6. No Loading States / Error Boundaries
Most pages show nothing while data loads (just a blank screen), or show a bare `<p>Loading...</p>`. There are no React Error Boundaries, so a crash in any component takes down the entire app.

**Fix:** Create a reusable `<PageLoader>` skeleton component and wrap key route segments in `<ErrorBoundary>`.

---

### 7. Server: No Rate Limiting
The Express server has no rate limiting middleware. The login and signup endpoints are especially vulnerable to brute-force attacks.

**Fix:** Add `express-rate-limit` to auth routes at minimum.

---

### 8. Server: Auth Guard DB Query on Every Request
[authGuard.js](file:///Volumes/QUADEM/Personal/VIBE%20CODING/ERP/store-app/server/middleware/authGuard.js) performs a full database query (users + roles + businesses + user_locations) on **every single API request**. This is a significant performance bottleneck.

**Fix:** Cache the user data in memory (or Redis) with a short TTL (e.g., 60 seconds), keyed by the JWT `sub` claim. Only hit the DB when the cache misses.

---

## 🟢 Nice-to-Have Improvements

### 9. No Pagination on Major List Views
Sales, Inventory, Ledger, Customers — all fetch **every** record from the database in a single query. As the business grows, these pages will become extremely slow.

**Fix:** Add server-side pagination (`?page=1&limit=50`) and infinite scroll or page controls on the client.

---

### 10. Console Logs in Production
30+ `console.log` / `console.error` statements across the client pages. These leak internal state information to anyone who opens DevTools.

**Fix:** Remove or wrap in a `if (import.meta.env.DEV)` guard.

---

### 11. PWA Service Worker Caching Issue
As we experienced tonight, the Service Worker aggressively caches old assets. Users don't see updates unless they hard-refresh.

**Fix:** Configure the `vite-plugin-pwa` to use a `skipWaiting` + `clientsClaim` strategy so new versions activate immediately, and optionally show a "New version available — click to refresh" banner.

---

### 12. No Input Validation on Server Routes
Many route handlers trust client-provided data directly (e.g., `req.body.amount`). There's no schema validation (like Zod, Joi, or express-validator).

**Fix:** Add request body validation middleware using Zod or Joi schemas.

---

### 13. Missing `key` Diversity in Some Lists
Some `.map()` calls use array index as the `key` prop, which can cause subtle rendering bugs with React's diffing algorithm when items are reordered or deleted.

---

## 📋 Recommended Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | Fix hardcoded colors in 4 pages (Light Mode broken) | ~1 hour |
| 2 | Replace `alert()`/`confirm()` with Toast + ConfirmDialog | ~2 hours |
| 3 | Fix `new Function()` security issue | ~30 min |
| 4 | Clean up junk/backup files | ~10 min |
| 5 | Fix Service Worker caching (skipWaiting) | ~30 min |
| 6 | Add rate limiting to auth routes | ~15 min |
| 7 | Split PlatformAdmin.jsx into sub-pages | ~3 hours |
| 8 | Add pagination to list views | ~4 hours |
| 9 | Add loading skeletons + ErrorBoundary | ~2 hours |
| 10 | Cache authGuard DB lookups | ~1 hour |
| 11 | Add Zod/Joi request validation | ~3 hours |
| 12 | Split index.css into modules | ~2 hours |
