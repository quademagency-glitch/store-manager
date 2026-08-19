/**
 * The guided tour, in order.
 *
 * `target` is matched against `[data-tour-step="<id>"]`, which
 * components/MainLayout.jsx stamps onto the corresponding sidebar entry. Two
 * consequences follow from that, and both are handled rather than avoided:
 *
 *   - Most targets live inside a collapsible sidebar section that is closed by
 *     default, so the element genuinely is not in the DOM when the step
 *     begins. MainLayout watches the active step and opens the section that
 *     owns it; the tooltip retries for a beat before giving up.
 *   - A step's target may not exist at all for this user, because the nav item
 *     is behind a permission they do not have. Those steps are skipped
 *     silently — a Sales Executive should not be told about Loss Prevention.
 *
 * Adding a step therefore means adding `tour: '<id>'` to a nav item in
 * MainLayout as well; a step whose id nothing carries is simply never shown.
 */
export const TOUR_STEPS = [
  {
    id: 'dashboard',
    title: 'Your command centre',
    body: "Today's sales, revenue and alerts at a glance. Start here each morning to see how the store is doing.",
  },
  {
    id: 'sales',
    title: 'Ring up a sale',
    body: 'Search products, build a cart and take payment. Cash, card, mobile money and split payments all live here.',
  },
  {
    id: 'inventory',
    title: 'Stock, in real time',
    body: "Every sale moves stock the moment it happens. Set reorder levels and you'll get an alert before anything runs out.",
  },
  {
    id: 'customers',
    title: 'Know your customers',
    body: 'Build your customer list, track what each one has bought, and keep an eye on outstanding balances.',
  },
  {
    id: 'suppliers',
    title: 'Suppliers and restocking',
    body: 'Keep supplier details in one place and raise purchase orders when it is time to bring stock back in.',
  },
  {
    id: 'reports',
    title: 'Reports that answer questions',
    body: 'Sales performance, profit and loss, and inventory analytics, built from your live data, no spreadsheets needed.',
  },
  {
    id: 'settings',
    title: 'Your team and their access',
    body: 'Add staff, decide what each role can see and do, and manage your business profile, locations and integrations.',
  },
  {
    id: 'setup',
    title: 'Finish setting up',
    body: "Work through this checklist and your store will be fully configured. It ticks itself off as you go, and it's the last stop on the tour.",
  },
];

/** localStorage flag: set once the tour is finished or skipped. */
export const TOUR_COMPLETED_KEY = 'tour_completed';
