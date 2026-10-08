import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';

export default function PostHogPageView() {
  const location = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) {
      // The address is reduced to its route pattern by `before_send`.
      posthog.capture('$pageview');
    }
  }, [location, posthog]);

  return null;
}
