import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';

export default function PostHogPageView() {
  const location = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    // Shared receipt links carry a secret token and belong to a shop's customer.
    if (posthog && !location.pathname.startsWith('/r/')) {
      // The address is reduced to its route pattern by `before_send`.
      posthog.capture('$pageview');
    }
  }, [location, posthog]);

  return null;
}
