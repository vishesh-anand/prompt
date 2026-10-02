import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/design';
import { AuthProvider, useSession } from '@/features/auth/AuthProvider';

// Hold the splash screen until we know whether you're signed in, so a signed-in person never sees the sign-in screen flash by.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Routes() {
  const { colors } = useTheme();
  const { session } = useSession();
  const ready = session !== undefined;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)/sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="index" />
          <Stack.Screen name="record" />
          <Stack.Screen name="feedback/[answerId]" />
          <Stack.Screen name="dev/design" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
