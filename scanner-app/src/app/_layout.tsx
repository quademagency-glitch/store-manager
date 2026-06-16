import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../lib/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
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
