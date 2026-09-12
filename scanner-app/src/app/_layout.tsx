import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useAppTheme } from '@/lib/theme-context';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { PostHogProvider } from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';

/**
 * Sentry error tracking.
 *
 * INERT BY DEFAULT: with no EXPO_PUBLIC_SENTRY_DSN set, Sentry.init() is
 * never called and the SDK does nothing. Setting one env var in EAS or .env
 * turns it on.
 *
 * Privacy: sendDefaultPii is OFF so no IPs, cookies or device identifiers are
 * auto-attached. Tracing is off by default (this is being adopted for error
 * visibility, not performance work). Request bodies are stripped because the
 * scanner sends authentication tokens.
 */
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    // Error visibility only; tracing is the expensive part.
    tracesSampleRate: 0,
    // No auto-captured IPs, cookies or device identity.
    sendDefaultPii: false,
    beforeSend(event) {
      // Never ship request bodies — the scanner sends auth tokens.
      if (event.request) delete event.request.data;
      return event;
    },
  });
}

/**
 * Analytics is allowed only when a key is configured AND the start date set
 * alongside it has arrived.
 *
 * The same rule as the web app's src/lib/analyticsGate.js, and for the same
 * reason: clause 5.3 of the Data Processing Agreement owes every business
 * customer 30 days' notice before a new sub-processor starts processing, and
 * the Privacy Policy currently states in two places that this one is not in
 * use. The start date is chosen as 30 days after that notice goes out, so
 * enabling analytics takes a deliberate act rather than a pasted key.
 *
 * The provider was previously mounted unconditionally with whatever apiKey the
 * environment held, including undefined.
 */
function analyticsAllowed(): boolean {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const start = process.env.EXPO_PUBLIC_POSTHOG_START;
  if (!key || !start) return false;
  const startsAt = new Date(`${String(start).trim()}T00:00:00Z`);
  if (Number.isNaN(startsAt.getTime())) return false;
  return new Date() >= startsAt;
}

function MaybeAnalytics({ children }: { children: React.ReactNode }) {
  if (!analyticsAllowed()) return <>{children}</>;
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY}
      options={{
        host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        // Screens opened, not what is on them. See the web app's main.jsx.
        captureAppLifecycleEvents: true,
      }}
      autocapture={false}
    >
      {children}
    </PostHogProvider>
  );
}

function RootLayoutNav() {
  const { theme, scheme } = useAppTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.card,
          },
          headerTintColor: theme.colors.primaryText,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
          headerRight: () => <ThemeToggleButton />,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: 'Setup Scanner', headerBackTitle: 'Back' }} />
        <Stack.Screen name="link-manual" options={{ title: 'Manual Link', headerBackTitle: 'Back' }} />
        <Stack.Screen name="link-camera" options={{ title: 'Scan Token', headerBackTitle: 'Back' }} />
        <Stack.Screen name="scanner" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  return (
    <MaybeAnalytics>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </MaybeAnalytics>
  );
}

// Sentry.wrap provides automatic error boundary and touch event tracking.
// No-op when Sentry is not initialised (no DSN).
export default Sentry.wrap(RootLayout);

