# Retail workflow improvements — 7 October 2026

Implemented against `532c6d9`. Production migration `089_retail_workflows.sql` was applied successfully on 7 October 2026 after verifying that it was the only pending migration and that the migration history had no drift. Application deployment and hosted acceptance are tracked in the local release evidence.

## Required business controls

Customer identity and per-unit tracking remain required for checkout. Single and double tracking validation, returns traceability, checkout journals and server transaction controls remain in place. There is no walk-in bypass. Customer selection alone does not enable payment: unscanned units still block it.

## Changes ready for review

| Area | Result |
| --- | --- |
| POS | Category filtering, favourite products, branch stock on tiles, SKU scan-to-add, accessible product buttons, bounded catalogue rendering, scoped saved and parked baskets. One tab owns the active branch basket to prevent competing writes. |
| Phone checkout | Persistent total/cart bar, a full-height cart, accessible quantity/remove/scan controls, readable names and keyboard focus handling. |
| Navigation | Sales, Inventory, Purchasing, Customers, Finance and Settings groups; duplicate destinations consolidated; real links; Add Product/Add Customer open their forms; reports open the correct destination. |
| Inventory | Branch thresholds consistently drive alerts, filtering and badges. Sort, density, column selection, cost/margin visibility by permission, saved views, bounded product rendering and return-to-filter links. |
| Retained work | Inventory, pricing and analysis tabs and filters use URLs. Purchasing and financial status/aging/search/date filters use URLs and saved views. PO forms save drafts by account and branch. Unsaved billing-document dismissal requires confirmation. |
| Dashboard | Smaller greeting, role-filtered daily work actions, neutral Stock Discrepancies wording, independent request states and freshness; failed metrics do not claim successful zeros. |
| Purchasing | Reorder quantities use branch sales and configured thresholds; cost estimates use purchase cost and flag missing costs. Selected items hand off into a PO draft. Supplier sharing is explicitly “Mark as sent”; a printable PO is available. Partial receiving remains supported, with accepted-unit guidance and exception notes. Received value, billed value and supplier payments are connected. |
| Till | Named shared branch session, opening float, permitted cash movements, Ghana cedi denomination count, expected/actual cash, variance explanation, manager review and printable handover. Help updated to match the controls. |
| Financial retrieval | Invoice/bill number and due-date filters, saved views, PO-linked bill retrieval, customer search beyond the initial list, and durable supplier-payment retries. |
| Recovery and consistency | Saved-payment review with individual/all retry and no discard of uncertain payments. Error banners distinguish failures from empty data. Cached POS products show cache age. GRNs no longer substitute selling prices for unknown costs. Shared toolbar, form and focus patterns, phone navigation accessibility and both themes reviewed. |

## Financial and persistence behavior

Migration `server/db/migrations/089_retail_workflows.sql` creates till sessions and the retail operation journal. Service-only RPCs handle till actions, received-value billing, PO saves and supplier-payment recording. Row/advisory locks, exact request references and transaction rollback protect retries. Browser roles receive no access to the new tables or RPCs.

Bills cannot exceed received value remaining to bill; partial bills are supported. Supplier payments retain the original reference on ambiguous failures. Definite database rejection allows correction; ambiguous outcomes remain saved for confirmation. Permission checks distinguish operating a till, recording approved cash movements and reviewing handovers.

A till is shared per branch because existing sales belong to branches, not individual registers. All branch cashiers contribute to that drawer. Card and MoMo amounts are recorded totals, not provider settlement confirmations. MoMo AR/AP payments are excluded from the physical cash calculation. The period ledger remains separate from an individual handover.

Saved baskets and drafts are local to the device and scoped to business, user and branch. They are not cross-device synchronisation. Parked baskets do not reserve stock; the server still validates stock and tracking when checkout proceeds.

## Verification

- Server Jest regression suite, including till authorization and explicit rejection behavior.
- PostgreSQL execution through disposable PGlite: till lifecycle, branch isolation, idempotent retries, denomination totals, cash/MoMo separation, received-value limits, supplier-payment idempotency, rollback and RPC/table permissions. Existing financial-integrity tests also run.
- Playwright invariant suite and targeted populated workflows: threshold filtering and reload, phone cart and parked recovery, PO draft retention, reorder-to-PO creation, till count/review, and returning to the same inventory filter.
- Manual browser checks at desktop and 390 × 844 in dark and light themes. Confirmed the required customer gate and the subsequent Scan All Items gate.
- Client lint and production build, including repository realtime, legal, privacy, inline-style, CSP and PWA checks.

Synthetic browser fixtures do not establish live provider settlement, message delivery or production acceptance. PGlite tests execute PostgreSQL functions, but are not a multi-connection concurrency rehearsal or a production migration rehearsal.

Final local results: client lint passed; production build passed all required checks. The full UI run finished with 142 passes, 38 mode-specific skips and two layout checks passing on retry after hot reload. Those two layouts and the final till workflow then passed again in an isolated three-test run. The targeted workflow/accessibility/navigation run passed 29 tests. All 10 database tests passed; the final changed-route check passed 41 tests. The full server suite passed all 606 tests across 54 suites.

## Release boundary

Migration 089 is applied through the repository's transactional migration runner. The release requires the matching server and client deployment, followed by a labelled disposable-business acceptance flow. Release evidence belongs outside the public source history; migration completion alone does not establish application acceptance.

No automatic supplier messaging or customer remarketing campaign was added. Customer identity remains available for the existing traceability and customer workflows. Supplier attachments, structured damaged-goods claims, provider settlement reconciliation and cross-device drafts are separate extensions, not implied by the new status labels.
