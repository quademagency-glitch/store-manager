import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useAppTheme } from '@/lib/theme-context';
import { ThemeToggleButton } from '@/components/theme-toggle-button';

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
        <Stack.Screen name="scanner" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
