# Traceability and daily operations

Implements the eight improvements authorised on 7 October 2026. Customer identity and unit tracking remain mandatory at checkout. The canonical application stays under `store-app/`.

## Workflows

1. **Item history** — scan item, pack, serial or an approved old label; see attributed changes, sale/customer references, returns and verified supplier deliveries. Receiving links validate branch, product and delivered quantity. Migration snapshots are labelled and do not invent historical movements.
2. **Return inspection** — new returns enter quarantine in the refund transaction. Record condition, warranty and private photographs; damaged/repair/supplier-return stock stays unavailable. Restocking happens once after inspection. Retrying an older refund cannot create a new hold. Completed evidence remains readable and is frozen against new uploads.
3. **Customer follow-up** — filter customers by purchase category, net spend and inactivity; record separate SMS/email preferences; prepare and review campaign drafts; retain staff-recorded follow-up outcomes and provider references. Unknown preferences and opt-outs are excluded, including on the existing CRM send screen. Provider simulation never displays as sent. Preparing a campaign sends nothing.
4. **Scanned transfers** — dispatch specific available units, receive by scan at the destination and retain partial/outstanding quantities. Both steps are atomic and duplicate safe. Quantity-only transfer controls direct tracked products to this workflow.
5. **Investigations** — assign staff and deadlines, append findings and private evidence, and close through a manager-authorised review. Replacing an item label requires a different approver; the old code remains searchable.
6. **Daily work** — permission-filtered live queues for till review, returns, transfers, investigations, supplier bills and deliveries. Errors remain visible; each queue shows up to twelve oldest records. Purchase orders and bills are business records; stock and till work use the active branch.
7. **Provider statements** — validate CSVs, review fees, import duplicates safely, match actual payment/refund amount, channel and currency in the active branch, and display unmatched records. Recent lists are capped at 500; older matches are still excluded correctly. A reviewed uploaded statement is not independent provider verification.
8. **Shared drafts** — save unpaid baskets and purchase drafts for the same account and branch. Revision checks and ten-minute device claims prevent silent overwrites. Explicit release hands work to another device; close the saved copy after finishing the sale/order. Shared drafts do not reserve stock or bypass checkout checks.

## Interface

The workspace has an ink navigation rail in both themes, a compact operational dashboard header, clearer pending-work links, six focused work pages, explicit form labels, keyboard controls and responsive forms. Finalised inspections remain available for evidence review.

The original design concepts are in `../design-previews/retail-next/`. Rendered application screenshots with synthetic records are in `../output/QuadERP-Working-Screens-2026-10-07/`. These files are local handoffs, not production screenshots.

## Data and security

- Migrations `090_traceability_operations.sql` and `091_customer_work_and_settlements.sql` were scaffolded using the Supabase CLI and use the repository migration runner.
- Thirteen new tables have RLS enabled and deny browser roles direct access. Server routes enforce business, branch and capability checks; mutations use authenticated identities.
- Stock, dispositions, approvals, campaigns, preferences, drafts and statement matches use immutable operation references and recorded request bodies. Conflicting retries reject without partial writes.
- Photographs are private, limited to ten per record and 2 MB each. Database subject locks enforce the cap and completed-review boundary; there are no public image URLs.
- Historical data is not reconstructed, external provider delivery is not inferred, and no customer messages are sent during implementation or QA.

## Validation and release

Local acceptance currently includes 619 server tests, 159 populated browser invariants, and 18 PostgreSQL-engine workflow tests. The client production build and lint pass. Empty-data and final release checks are recorded in the private release evidence, not published in this public repository.

Production release status and exact commit/deployment evidence belong in the private `docs/audits/2026-10-07-operations/` report. Do not treat a migration file or a screenshot as proof of deployment.
