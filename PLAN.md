# Store Management App — Implementation Plan

## User Stories

1. **Check-in & floor tracking** — As a manager, I want to see who is on the floor and when they arrived so I can monitor activity in real time.
2. **Theft alerts (staff)** — As a manager, I want to be alerted when a staff member logs unusual transactions (voids, discounts, cash overrides) so I can investigate quickly.
3. **Quick sale flow** — As a salesperson, I want to find a product, add it to a sale, and complete a transaction in under 30 seconds so I never keep a customer waiting.
4. **Inventory discrepancy flag** — As a manager, I want to see automatic flags when physical stock doesn't match system records so I can identify where shrinkage is happening.
5. **End-of-day reconciliation** — As a manager, I want a daily summary of sales, voids, and stock changes per staff member so I can spot patterns that suggest theft.

---

## Non-Goals

1. **Customer-facing timers** — No countdown clocks or customer check-in; time management is not part of this app.
2. **CCTV / video integration** — Theft prevention is data and transaction-driven, not camera-based.
3. **E-commerce / online orders** — In-store operations only; no delivery, online storefront, or remote access for customers.

---

## Tech Stack

| Layer | Tool | Reason |
|---|---|---|
| Frontend | React + Vite | Fast dev setup, massive ecosystem, every developer knows it |
| Styling | Tailwind CSS | Utility-first, no context switching, mobile-responsive out of the box |
| Backend | Node.js + Express | Simple REST API, huge community, easy to hire for |
| Database | PostgreSQL | Reliable, relational (sales + inventory data fits tables well), free |
| Auth | Supabase Auth | Handles sessions, roles, and JWT out of the box with no boilerplate |
| Realtime alerts | Supabase Realtime | Built-in WebSocket layer — no separate service needed |
| Hosting | Railway | Deploys Postgres + Node in one place, no DevOps expertise needed |
| Frontend deploy | Vercel | One-click React deploys, free tier sufficient for a single store |

> **Trade-off:** Supabase handles auth, database, and realtime — reducing the stack but creating a single vendor dependency. Acceptable for a small store app; easy to migrate off later.

---

## Data Model

**users** — `id, name, email, password_hash, role (manager|salesperson), created_at`

**products** — `id, name, sku, category, price, stock_quantity, low_stock_threshold, created_at`

**sales** — `id, salesperson_id, total_amount, payment_method, created_at`

**sale_items** — `id, sale_id, product_id, quantity, unit_price`

**stock_movements** — `id, product_id, salesperson_id, type (restock|removal|adjustment), quantity, note, created_at`

**alerts** — `id, type (void|discount|override|discrepancy), salesperson_id, sale_id, note, resolved, created_at`

---

## Folder Structure

```
store-app/
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── pages/           # Login, Dashboard, Sales, Inventory, Alerts
│   │   ├── components/      # Shared UI (Table, Modal, Badge, Button)
│   │   ├── hooks/           # useAuth, useSales, useAlerts
│   │   ├── lib/             # Supabase client, API helpers
│   │   └── main.jsx
│   └── index.html
│
└── server/                  # Node.js + Express backend
    ├── routes/              # auth, sales, products, alerts, stock
    ├── middleware/          # authGuard, roleCheck
    ├── db/                  # PostgreSQL queries
    ├── services/            # alertEngine, reconciliation
    └── index.js
```

---

## Build Order

1. **Auth** — login, roles, protected routes. Nothing else works without this.
2. **Products** — CRUD for inventory. Sales depend on this existing first.
3. **Sales flow** — product search → add to cart → complete sale. Core salesperson experience.
4. **Stock movements** — log restocks and adjustments. Needed before discrepancy detection.
5. **Alert engine** — flag voids, discounts, and stock discrepancies automatically.
6. **Manager dashboard** — pull together sales, alerts, and stock data into one view.
7. **Reconciliation report** — end-of-day summary per staff member. Built last because it depends on all other data.

---

## Future Enhancements

1. **New Modules (ERP Expansion)**:
   - **Procurement & Vendor Management (Supply Chain)**: Purchase Orders (POs), goods receiving workflows, automated reordering, and vendor databases.
   - **HR & Employee Management**: Time & attendance (clock in/out), staff scheduling/rostering, sales commissions, and payroll exports.
   - **Advanced CRM & Loyalty**: Loyalty points systems, store credit, gift cards, customer segmentation, and targeted marketing campaigns.
   - **Advanced Inventory & Warehouse Operations**: Multi-location stock transfers, cycle counts/audits, batch/expiry tracking, and custom barcode generation.
   - **Core Financials & Accounting**: Accounts Receivable (AR) for B2B customers, Accounts Payable (AP) for suppliers, and Profit & Loss (P&L) statements.
   - **E-Commerce & Omnichannel Integration**: BOPIS (Buy Online, Pick Up In Store) workflows and public storefront APIs for online selling.
   - **Global Settings Panel**: Business admins configure store's currency, tax rates, receipt formatting.

2. **UI/UX Polish**:
   - **Dashboard Upgrades**: Interactive charts (Recharts/Chart.js) for sales trends.
   - **Animations**: Page transitions, hover states, and toast notifications.
   - **Dark Mode**: Refined modern dark theme with glassmorphism or sleek gradients.

3. **Fortification**:
   - **Automated Testing**: Switch manual test scripts to a proper framework (Vitest).
   - **CI/CD Pipeline**: GitHub Actions for automated lint/build/deploy.
   - **Data Exports**: Add CSV/PDF export functionality for sales and inventory.