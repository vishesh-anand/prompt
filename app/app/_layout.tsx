import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/design';
import { useResumeAnswers } from '@/features/answers/useResumeAnswers';
import { AuthProvider, useSession } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { useReminders } from '@/features/reminders/useReminders';

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
  const profile = useProfile();
  // Signed in: keep the splash up until the profile has loaded (or failed), so first-time setup doesn't flash the Home screen.
  // Only the splash waits. The screens are on as soon as the login is known, and Home shows nothing but the themed
  // background until the profile arrives.
  const ready = session !== undefined && (session === null || !profile.isPending);
  useResumeAnswers();
  useReminders();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (session === undefined) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)/sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(onboarding)/reminder" />
          <Stack.Screen name="record" />
          <Stack.Screen name="feedback/[answerId]" />
          <Stack.Screen name="compare/[answerId]" />
          <Stack.Screen name="dev/design" />
          <Stack.Screen name="dev/reminders" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
