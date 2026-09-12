import { useLocation } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { subprocessorAllowed } from '../lib/analyticsGate';
import { routePattern } from '../lib/routePattern';

/**
 * Vercel Speed Insights, behind the same control as PostHog and reporting
 * route patterns rather than resolved paths.
 *
 * The import is `/react`, not `/next`. Vercel's dashboard hands you the
 * Next.js snippet by default and this app is React + Vite, so `/next` pulls in
 * next/navigation and fails.
 *
 * Mounted inside <BrowserRouter> because useLocation needs the router.
 */
export default function SpeedInsightsRoute() {
  const { pathname } = useLocation();

  // Gate first, but AFTER the hook: bailing before useLocation would change
  // the hook order between renders the moment the date arrives.
  if (!subprocessorAllowed(import.meta.env.VITE_SPEED_INSIGHTS_START)) return null;

  return <SpeedInsights route={routePattern(pathname)} />;
}
