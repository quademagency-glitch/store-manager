/**
 * Route manifest shared by the visual and invariant specs.
 *
 * Kept in one place so adding a page to the app means adding one line here and
 * every check (screenshot, overflow, contrast, focus) picks it up.
 */
import type { Page } from '@playwright/test';

export type Route = {
  path: string;
  name: string;
  /**
   * Optional interaction run after the route settles, before it is captured.
   *
   * Lives here rather than in any one spec so the visual suite, the invariant
   * specs and the app tour all reach the same state, a page whose real story
   * only appears mid-flow tells it in every capture, not just one.
   *
   * Must no-op when the data it needs is missing: `empty-states.spec.ts` walks
   * this same manifest under VITE_USE_MOCKS=empty, where these selectors match
   * nothing at all.
   */
  prepare?: (page: Page) => Promise<void>;
};

/** Authenticated app surface, in rough navigation order. */
export const APP_ROUTES: Route[] = [
  { path: '/dashboard', name: '01-dashboard' },

  // Store operations
  //
  // `/products` is deliberately absent: App.jsx redirects it to /inventory, so
  // capturing it produced a second, identical picture of the Inventory page
  // under a name that promised a Products screen, and a "route problem" line
  // in every tour run. The sidebar still links it; the redirect is what needs
  // a test, not a screenshot.
  { path: '/inventory', name: '02-inventory' },
  {
    path: '/sales',
    name: '03-sales-pos',
    /* A POS terminal with an empty cart is a picture of nothing happening: no
       line items, no per-unit scan rows, no total, and the checkout button
       disabled. The cart is local component state, so the only way to capture
       one mid-sale is to actually ring one up, three taps on the catalogue,
       which is also the shortest real path a cashier takes. */
    prepare: async (page) => {
      const tiles = page.locator('.product-card');
      const taps = Math.min(await tiles.count(), 3);
      for (let i = 0; i < taps; i++) {
        await tiles.nth(i).click();
        // Each click appends a scan row; let React commit before the next.
        await page.waitForTimeout(120);
      }
    },
  },
  { path: '/sales-record', name: '04-sales-record' },
  { path: '/returns', name: '05-returns' },
  { path: '/alerts', name: '06-alerts' },
  { path: '/suppliers', name: '07-suppliers' },
  { path: '/purchase-orders', name: '08-purchase-orders' },

  // Accounting
  { path: '/reconciliation', name: '09-reconciliation' },
  { path: '/till-account', name: '10-till-account' },
  { path: '/accounts-receivable', name: '11-accounts-receivable' },
  { path: '/accounts-payable', name: '12-accounts-payable' },
  { path: '/invoice', name: '13-invoices' },
  { path: '/accounting-approvals', name: '14-accounting-approvals' },
  { path: '/accounting-templates', name: '15-accounting-templates' },
  { path: '/accounting-settings', name: '16-accounting-settings' },

  // CRM
  { path: '/customers', name: '17-customers' },
  { path: '/customer-orders', name: '18-customer-orders' },
  { path: '/crm-communications', name: '19-crm-communications' },
  { path: '/loyalty', name: '20-loyalty' },

  // HR
  { path: '/hr/attendance', name: '21-hr-attendance' },
  { path: '/hr/schedules', name: '22-hr-schedules' },
  { path: '/hr/my-commissions', name: '23-hr-my-commissions' },

  // Administration
  { path: '/business-admin', name: '24-business-overview' },
  { path: '/business-admin/roles', name: '25-roles' },
  { path: '/business-admin/team', name: '26-team' },
  { path: '/business-admin/locations', name: '27-locations' },
  { path: '/business-admin/organization', name: '28-organization' },
  { path: '/business-admin/billing', name: '29-billing' },
  { path: '/business-admin/shrinkage', name: '30-shrinkage' },
  { path: '/business-admin/attendance-report', name: '31-attendance-report' },
  { path: '/business-admin/commission-rules', name: '32-commission-rules' },
  { path: '/business-admin/setup', name: '33-setup' },
  { path: '/settings', name: '34-settings' },
  { path: '/profile', name: '35-profile' },

  // Reports
  { path: '/reports/pnl', name: '36-profit-loss' },
  { path: '/reports/accounts-receivable', name: '37-ar-aging' },
];

/** Unauthenticated surface, rendered without the app shell. */
export const PUBLIC_ROUTES: Route[] = [
  { path: '/login', name: '90-login' },
  { path: '/forgot-password', name: '91-forgot-password' },
];

export const ALL_ROUTES = [...APP_ROUTES, ...PUBLIC_ROUTES];

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Wall clock the app sees during a capture.
 *
 * Without this the suite drifts against itself: the dashboard greets you by
 * time of day ("Good afternoon" vs "Good evening"), and the fixtures date
 * their rows relative to `Date.now()`, so every activity row reads "1 days
 * ago" today and "2 days ago" tomorrow. Baselines committed in the afternoon
 * failed by the evening, a diff that says nothing about the CSS.
 *
 * Set via `page.clock.setFixedTime`, which pins `Date.now()` and leaves
 * timers real, so React transitions and Recharts animations still run.
 * 14:30 UTC lands in the afternoon greeting for most timezones.
 */
export const FIXED_TIME = new Date('2026-07-15T14:30:00Z');

/**
 * Matches the consolidated CSS breakpoints (480 / 768 / 1024 / 1280).
 * Each width sits just inside a tier so a regression in any one shows up.
 */
export const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * Put the app into a deterministic state before first paint:
 *   - theme, so the pre-paint script picks it up and screenshots are stable
 *   - an active location, so location-scoped pages don't sit in a null state
 *   - the product tour marked as already seen
 *
 * That last one is not cosmetic. The tour auto-starts for anyone who has not
 * completed it, and every capture begins with fresh storage, so its spotlight
 * modal was being drawn over the page on all 80 screenshots, pinned to the
 * dashboard's first step regardless of which route was actually being shot.
 * The baselines recorded the tour, not the app.
 */
export function initScript(theme: Theme) {
  return `
    try {
      localStorage.setItem('app-theme', ${JSON.stringify(theme)});
      localStorage.setItem('active_location_id', 'mock-loc');
      localStorage.setItem('tour_completed', 'true');
    } catch (e) {}
  `;
}
