/**
 * Route manifest shared by the visual and invariant specs.
 *
 * Kept in one place so adding a page to the app means adding one line here and
 * every check (screenshot, overflow, contrast, focus) picks it up.
 */
export type Route = { path: string; name: string };

/** Authenticated app surface, in rough navigation order. */
export const APP_ROUTES: Route[] = [
  { path: '/dashboard', name: '01-dashboard' },

  // Store operations
  { path: '/inventory', name: '02-inventory' },
  { path: '/products', name: '03-products' },
  { path: '/sales', name: '04-sales-pos' },
  { path: '/sales-record', name: '05-sales-record' },
  { path: '/returns', name: '06-returns' },
  { path: '/alerts', name: '07-alerts' },
  { path: '/suppliers', name: '08-suppliers' },
  { path: '/purchase-orders', name: '09-purchase-orders' },

  // Accounting
  { path: '/reconciliation', name: '10-reconciliation' },
  { path: '/till-account', name: '11-till-account' },
  { path: '/accounts-receivable', name: '12-accounts-receivable' },
  { path: '/accounts-payable', name: '13-accounts-payable' },
  { path: '/invoice', name: '14-invoices' },
  { path: '/accounting-approvals', name: '15-accounting-approvals' },
  { path: '/accounting-templates', name: '16-accounting-templates' },
  { path: '/accounting-settings', name: '17-accounting-settings' },

  // CRM
  { path: '/customers', name: '18-customers' },
  { path: '/customer-orders', name: '19-customer-orders' },
  { path: '/crm-communications', name: '20-crm-communications' },
  { path: '/loyalty', name: '21-loyalty' },

  // HR
  { path: '/hr/attendance', name: '22-hr-attendance' },
  { path: '/hr/schedules', name: '23-hr-schedules' },
  { path: '/hr/my-commissions', name: '24-hr-my-commissions' },

  // Administration
  { path: '/business-admin', name: '25-business-overview' },
  { path: '/business-admin/roles', name: '26-roles' },
  { path: '/business-admin/team', name: '27-team' },
  { path: '/business-admin/locations', name: '28-locations' },
  { path: '/business-admin/organization', name: '29-organization' },
  { path: '/business-admin/billing', name: '30-billing' },
  { path: '/business-admin/shrinkage', name: '31-shrinkage' },
  { path: '/business-admin/attendance-report', name: '32-attendance-report' },
  { path: '/business-admin/commission-rules', name: '33-commission-rules' },
  { path: '/business-admin/setup', name: '34-setup' },
  { path: '/settings', name: '35-settings' },
  { path: '/profile', name: '36-profile' },

  // Reports
  { path: '/reports/pnl', name: '37-profit-loss' },
  { path: '/reports/accounts-receivable', name: '38-ar-aging' },
];

/** Unauthenticated surface — rendered without the app shell. */
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
 * failed by the evening — a diff that says nothing about the CSS.
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
 */
export function initScript(theme: Theme) {
  return `
    try {
      localStorage.setItem('app-theme', ${JSON.stringify(theme)});
      localStorage.setItem('active_location_id', 'mock-loc');
    } catch (e) {}
  `;
}
