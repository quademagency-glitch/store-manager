# QERP Store — Phase 3 Implementation Plan
## ERP Expansion, Polish & Fortification

**Status as of 2026-06-12**
**Prerequisite phases complete:** Auth, multi-tenant, multi-location, POS, QR tracking, inventory, returns, customers, purchase orders, suppliers, loss prevention, accounting, reconciliation, till/ledger, billing (35 DB migrations done, all 12 codebase audit items resolved).

---

## Review Notes Carried Forward

From `codebaseaudit.md` — all 12 critical/important/nice-to-have items are **done**. The following architectural decisions from that audit inform this plan:

- CSS is now split into per-feature stylesheets under `src/styles/` — new modules must each add their own stylesheet, not append to existing files.
- All `alert()`/`confirm()` calls replaced with `useToast` / `useConfirm` — new features must never use native dialogs.
- `authGuard.js` caches the DB user lookup — new routes get this for free; do not bypass it.
- Zod validation middleware (`middleware/validate.js`) is in place — all new route handlers must validate request bodies through it.
- Pagination is required on every new list endpoint (`?page=1&limit=50` pattern already established).
- `new Function()` / `eval` is banned — any dynamic condition logic must use the safe tokenizer already introduced.

---

## Phase 3A — HR & Employee Management
*Priority: HIGH | No blocking dependencies*

This is the highest-value missing module. Staff scheduling, attendance, and commissions are frequently requested by store managers. It slots naturally next to the existing Team Management panel.

### 3A.1 — Time & Attendance

**DB Migration: `036_hr_attendance.sql`**
```
attendance_logs — id, user_id, business_id, location_id, clock_in, clock_out, duration_minutes, note, created_at
shift_schedules — id, user_id, location_id, date, start_time, end_time, role_label, created_at
```

**Server routes: `server/routes/hr.js`**
- `POST /api/hr/clock-in` — record clock-in for authenticated user
- `POST /api/hr/clock-out` — record clock-out, compute duration
- `GET  /api/hr/attendance` — paginated attendance log (manager/admin only; filterable by user, date range, location)
- `GET  /api/hr/attendance/me` — self-service: current user's own log
- `GET  /api/hr/schedules` — fetch shift schedule for a date range
- `POST /api/hr/schedules` — create/update shift (manager/admin only)

**Client pages/components:**
- `src/pages/HR/Attendance.jsx` — clock-in/clock-out button (prominent, full-width on mobile), today's log, weekly summary
- `src/pages/HR/Schedules.jsx` — calendar-style week view of shifts per location
- `src/pages/BusinessAdmin/AttendanceReport.jsx` — cross-staff attendance report with filter by date range

**Implementation checklist:**
- [ ] Write `036_hr_attendance.sql` and run migration
- [ ] Add `hr.js` route with Zod-validated bodies
- [ ] Build Attendance page with clock-in / clock-out state toggle
- [ ] Add sidebar nav entry under "HR" section (manager + admin roles only)
- [ ] Build Schedules page (week view grid, add/edit shift modal)
- [ ] Add AttendanceReport to BusinessAdmin sub-pages
- [ ] Add `useAttendance` hook following existing hook pattern
- [ ] Add `attendance.css` stylesheet

---

### 3A.2 — Sales Commissions

**DB Migration: `037_commissions.sql`**
```
commission_rules — id, business_id, type (flat|percentage), value, min_sale_amount, product_category, active
commission_ledger — id, user_id, sale_id, business_id, amount, rule_id, paid_at, created_at
```

**Server routes (added to `hr.js`):**
- `GET/POST/PATCH /api/hr/commission-rules` — CRUD for commission rules (business admin only)
- `GET /api/hr/commissions` — per-user commission summary for a date range
- `POST /api/hr/commissions/payout` — mark commissions as paid (creates ledger entry)

**Client components:**
- `src/pages/BusinessAdmin/CommissionRules.jsx` — rule builder: flat or %, per-category or global, min sale threshold
- `src/pages/HR/MyCommissions.jsx` — salesperson self-service commission tracker
- Wire commission calculation into `server/routes/sales.js` — on each finalized sale, compute applicable commission and insert into `commission_ledger`

**Implementation checklist:**
- [ ] Write `037_commissions.sql`
- [ ] Add commission rule CRUD endpoints with Zod validation
- [ ] Inject commission calculation into finalize-sale flow (post-receipt generation)
- [ ] Build CommissionRules admin page
- [ ] Build MyCommissions self-service page
- [ ] Add commission summary to ShrinkageReport / BusinessAdmin Overview

---

### 3A.3 — Payroll Export

**No new DB migration needed** — derives from `commission_ledger` and `attendance_logs`.

**Server route:**
- `GET /api/hr/payroll-export?from=&to=&format=csv` — aggregates hours, commissions, unpaid amounts per user; returns CSV or JSON

**Client:**
- Export button on `AttendanceReport.jsx` — triggers CSV download
- `usePrintDocument` hook already handles file downloads; reuse it

**Implementation checklist:**
- [ ] Add payroll export endpoint
- [ ] Integrate export button into AttendanceReport
- [ ] Format: name, location, hours worked, sales count, commission earned, commission paid, unpaid balance

---

## Phase 3B — Advanced CRM & Loyalty
*Priority: HIGH | Depends on existing Customers module*

The Customers page and database table already exist. This phase adds a loyalty layer on top.

### 3B.1 — Loyalty Points System

**DB Migration: `038_loyalty.sql`**
```
loyalty_rules — id, business_id, points_per_currency_unit, min_points_to_redeem, point_value, active
loyalty_ledger — id, customer_id, business_id, sale_id, type (earn|redeem|adjust|expire), points, balance_after, note, created_at
```

**Server routes: `server/routes/loyalty.js`**
- `GET/POST/PATCH /api/loyalty/rules` — CRUD for earning/redemption rules
- `GET /api/loyalty/balance/:customerId` — current points balance
- `GET /api/loyalty/ledger/:customerId` — paginated points history
- `POST /api/loyalty/redeem` — redeem points against an active sale (reduces points_balance, reduces sale total)
- Inject `loyalty_ledger` earn entry into `sales.js` finalize-sale flow

**Client:**
- `src/pages/Loyalty.jsx` — full loyalty dashboard: rule config, customer search, manual adjust
- Add points balance + history panel to `Customers.jsx` detail view
- Add "Redeem Points" option to POS payment flow (`PaymentModal.jsx`)

**Implementation checklist:**
- [ ] Write `038_loyalty.sql`
- [ ] Build loyalty routes with pagination + Zod validation
- [ ] Inject earn logic into sales finalization
- [ ] Add Redeem Points to PaymentModal
- [ ] Build Loyalty admin page
- [ ] Add customer points badge to Customers list
- [ ] Add `loyalty.css` stylesheet

---

### 3B.2 — Store Credit & Gift Cards

**DB Migration: `039_store_credit.sql`**
```
gift_cards — id, business_id, code (unique), initial_balance, current_balance, issued_to_customer_id, issued_at, expires_at, active
store_credit_ledger — id, customer_id, business_id, sale_id, type (issue|redeem|refund), amount, balance_after, note, created_at
```

**Server routes (added to `loyalty.js`):**
- `POST /api/loyalty/gift-cards` — issue a gift card (admin only)
- `GET  /api/loyalty/gift-cards/:code` — look up card balance (for POS use)
- `POST /api/loyalty/gift-cards/redeem` — redeem against active sale
- `POST /api/loyalty/store-credit` — issue store credit to customer (e.g., after return)
- Integrate store credit issue into `returns.js` as an optional refund method

**Client:**
- Gift card issuance panel in `Loyalty.jsx`
- Gift card / store credit options in `PaymentModal.jsx` (alongside cash/card)
- Store credit balance in customer detail view

**Implementation checklist:**
- [ ] Write `039_store_credit.sql`
- [ ] Build gift card CRUD and redemption endpoints
- [ ] Wire store credit as a return refund option in Returns flow
- [ ] Add gift card + store credit payment options to PaymentModal
- [ ] Add card issuance / credit management to Loyalty admin page

---

## Phase 3C — Core Financials: P&L & AR/AP
*Priority: MEDIUM | Depends on existing accounting templates + ledger*

The TillAccount, ledger, and accounting templates system already provides raw transaction data. This phase adds financial reporting on top.

### 3C.1 — Profit & Loss Statement

**No new migration.** Derives from existing `sales`, `sale_items`, `purchase_orders`, `commission_ledger`, `attendance_logs`, and `stock_movements` tables.

**Server route:**
- `GET /api/reports/pnl?from=&to=&location_id=` — aggregates:
  - **Revenue:** sum of finalized sales
  - **COGS:** sum of purchase cost × units sold (requires `cost_price` on products — see migration below)
  - **Gross Profit:** Revenue − COGS
  - **Operating Expenses:** commissions paid + any accounting template entries tagged as "expense"
  - **Net Profit:** Gross Profit − Operating Expenses

**DB Migration: `040_cost_price.sql`**
- Add `cost_price` column to `products` table (nullable initially; backfill from purchase orders where available)

**Client:**
- `src/pages/Reports/ProfitLoss.jsx` — date-range picker, location filter, collapsible P&L table with drill-down
- Add "P&L" card to BusinessAdmin Overview
- Add `reports.css` stylesheet

**Implementation checklist:**
- [ ] Write `040_cost_price.sql` (add `cost_price` to products)
- [ ] Update ProductModal to include cost price field
- [ ] Build P&L aggregation endpoint
- [ ] Build ProfitLoss report page with date range + location filter
- [ ] Wire COGS: use average cost from purchase orders when `cost_price` is null
- [ ] Add export-to-CSV button (reuse payroll export pattern)

---

### 3C.2 — Accounts Receivable (B2B Customers)

**DB Migration: `041_accounts_receivable.sql`**
```
ar_invoices — id, business_id, customer_id, location_id, due_date, status (draft|sent|paid|overdue), total_amount, paid_amount, created_at
ar_payments — id, invoice_id, amount, payment_method, paid_at, note
```

**Server routes: `server/routes/ar.js`**
- Full CRUD for AR invoices (linked to existing customers)
- `POST /api/ar/invoices/:id/mark-paid` — record partial or full payment
- `GET  /api/ar/aging` — aging report (current, 30, 60, 90+ days)

**Client:**
- `src/pages/Reports/AccountsReceivable.jsx` — invoice list with aging bucket columns, status badges, "Record Payment" action
- Link from InvoiceList.jsx (which currently handles subscription invoices — AR invoices are a separate entity)

**Implementation checklist:**
- [ ] Write `041_accounts_receivable.sql`
- [ ] Build AR invoice CRUD endpoints
- [ ] Build AccountsReceivable page with aging view
- [ ] Add "Record Payment" modal
- [ ] Add overdue alert integration (flag in Alerts page when invoice > 30 days)

---

## Phase 3D — Dashboard Charts & UI Polish
*Priority: MEDIUM | No blocking dependencies — can run parallel to 3A/3B/3C*

### 3D.1 — Interactive Charts on Dashboard

**Dependency:** Add `recharts` to client package.json.

**Dashboard additions in `Dashboard.jsx`:**
- **Sales trend line chart** — daily revenue for last 30 days (data from existing analytics route)
- **Top products bar chart** — top 5 by revenue this month
- **Inventory health donut** — in-stock vs. low-stock vs. out-of-stock counts
- **Staff performance table** — sales count + total revenue per salesperson this week (from existing data)

**Implementation checklist:**
- [ ] `npm install recharts` in client
- [ ] Refactor Dashboard to use grid layout with chart cards
- [ ] Wire `useAnalytics` hook data into Recharts components
- [ ] Add responsive sizing (charts collapse to list view on mobile)
- [ ] Add `dashboard-charts.css` stylesheet

---

### 3D.2 — Page Transitions & Toast Polish

**Already have:** `useToast` hook and toast CSS.

**Additions:**
- Wrap React Router `<Routes>` in a transition wrapper using CSS `@starting-style` (no library needed)
- Add hover states to all table rows (currently inconsistent — some pages missing `hover:` classes)
- Add skeleton pulse animation to all `<PageLoader>` instances for data-loading states (currently some show bare spinners)

**Implementation checklist:**
- [ ] Add `transition.css` with `@starting-style` entry animations
- [ ] Audit all pages for missing row hover states
- [ ] Standardize PageLoader skeleton to match each page's data shape

---

### 3D.3 — Dark Mode Refinement

The existing dark mode uses CSS variables. Remaining polish items:
- Charts need explicit dark-mode color overrides (Recharts uses inline styles by default)
- PDF/print receipts must remain white-background regardless of theme
- Some modals still have `bg-slate-900` hardcoded in inline styles (not caught by the audit's Tailwind class scan)

**Implementation checklist:**
- [ ] Audit all `style={}` props for hardcoded colors; replace with CSS variable references
- [ ] Add `prefers-color-scheme` overrides for chart colors
- [ ] Verify `@media print` in `print.css` forces white background (likely already done — verify)

---

## Phase 3E — Testing Infrastructure & CI/CD
*Priority: MEDIUM | Parallel track — does not block feature work*

### 3E.1 — Vitest Unit Tests

**Setup:**
- `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` in client
- Add `vitest.config.js` extending Vite config
- Target: hooks and utility functions first (highest ROI, no DOM needed)

**Test targets (priority order):**
1. `useAuth.js` — token refresh logic, role checks
2. `useSales.js` — cart total calculation, QR validation
3. `server/middleware/validate.js` — Zod schema rejection cases
4. `server/services/lossPreventionEngine.js` — alert threshold logic
5. Commission calculation logic (new, from Phase 3A)
6. Loyalty points earn/redeem calculation (new, from Phase 3B)

**Implementation checklist:**
- [ ] Install and configure Vitest
- [ ] Write tests for `useAuth` (mocking `lib/api.js`)
- [ ] Write tests for `useSales` cart logic
- [ ] Write tests for validate middleware
- [ ] Write tests for lossPreventionEngine
- [ ] Write tests for commission engine
- [ ] Write tests for loyalty engine

---

### 3E.2 — GitHub Actions CI/CD

**File: `.github/workflows/ci.yml`**

```yaml
Triggers: push to main, PRs to main

Jobs:
  lint:       eslint client/src
  build:      vite build (catch import errors)
  test:       vitest run
  deploy:     (only on main merge) railway up + vercel deploy --prod
```

**Implementation checklist:**
- [ ] Create `.github/workflows/ci.yml`
- [ ] Add Railway deploy token to GitHub secrets
- [ ] Add Vercel token + project ID to GitHub secrets
- [ ] Add lint script to client `package.json` if missing
- [ ] Verify build passes clean in CI before wiring deploy step

---

### 3E.3 — Data Exports (CSV/PDF)

The `usePrintDocument` hook already handles print-to-PDF. This adds CSV exports to data-heavy pages.

**Pages to add CSV export:**
- Sales history (`SalesRecord.jsx`) — export filtered results
- Inventory list (`Inventory.jsx`) — export with stock levels
- Customer list (`Customers.jsx`) — export with contact info
- Attendance report (new from Phase 3A)

**Pattern:** Add `useExportCsv` hook that takes a column definition + row array, generates a Blob, and triggers download. One hook, used everywhere.

**Implementation checklist:**
- [ ] Write `src/hooks/useExportCsv.js`
- [ ] Add export button to SalesRecord, Inventory, Customers pages
- [ ] Add export button to AttendanceReport (Phase 3A)

---

## Build Order & Dependencies

```
Phase 3A: HR (attendance → commissions → payroll export)
Phase 3B: CRM/Loyalty (loyalty points → store credit/gift cards)    [parallel with 3A]
Phase 3C: Financials (cost_price migration → P&L → AR)               [parallel with 3A/3B]
Phase 3D: Dashboard charts → transition polish → dark mode audit     [parallel throughout]
Phase 3E: Vitest setup → CI/CD → data exports                        [parallel throughout]
```

**Critical path:** 3A → 3B → 3C (each phase adds data the next one reads)
**Safe parallels:** 3D and 3E can run alongside any feature phase at any time

---

## Migration Sequence

| # | File | Contents |
|---|------|----------|
| 036 | `036_hr_attendance.sql` | `attendance_logs`, `shift_schedules` |
| 037 | `037_commissions.sql` | `commission_rules`, `commission_ledger` |
| 038 | `038_loyalty.sql` | `loyalty_rules`, `loyalty_ledger` |
| 039 | `039_store_credit.sql` | `gift_cards`, `store_credit_ledger` |
| 040 | `040_cost_price.sql` | Add `cost_price` to `products` |
| 041 | `041_accounts_receivable.sql` | `ar_invoices`, `ar_payments` |

---

## New Files Summary

**Server:**
- `server/routes/hr.js`
- `server/routes/loyalty.js`
- `server/routes/ar.js`
- `server/routes/reports.js` (P&L endpoint)

**Client pages:**
- `src/pages/HR/Attendance.jsx`
- `src/pages/HR/Schedules.jsx`
- `src/pages/HR/MyCommissions.jsx`
- `src/pages/BusinessAdmin/AttendanceReport.jsx`
- `src/pages/BusinessAdmin/CommissionRules.jsx`
- `src/pages/Loyalty.jsx`
- `src/pages/Reports/ProfitLoss.jsx`
- `src/pages/Reports/AccountsReceivable.jsx`

**Client hooks:**
- `src/hooks/useHR.js`
- `src/hooks/useLoyalty.js`
- `src/hooks/useReports.js`
- `src/hooks/useExportCsv.js`

**Client styles:**
- `src/styles/hr.css`
- `src/styles/loyalty.css`
- `src/styles/reports.css`
- `src/styles/dashboard-charts.css`
- `src/styles/transition.css`

**Tests:**
- `client/src/hooks/__tests__/useAuth.test.js`
- `client/src/hooks/__tests__/useSales.test.js`
- `server/middleware/__tests__/validate.test.js`
- `server/services/__tests__/lossPreventionEngine.test.js`

---

## Out of Scope for Phase 3

- **E-Commerce / BOPIS** — deferred to Phase 4; requires a public-facing API surface and storefront, which is a separate product track.
- **Multi-warehouse transfers** — `TransferModal.jsx` already exists; enhancement deferred until Phase 4 inventory audit identifies gaps.
- **Batch/expiry tracking extensions** — `BatchModal.jsx` already exists; evaluate if current implementation covers needs before extending.

---

**Document Status:** Ready for Development
**Version:** 3.0
**Date:** 2026-06-12
