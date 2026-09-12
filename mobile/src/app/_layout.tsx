/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │          AutoGloss (AutoSPF+) — Root Layout & Navigator            │
 * │                                                                      │
 * │  Responsibilities:                                                   │
 * │  1. Wrap the app in ThemeProvider + AuthProvider (global state)     │
 * │  2. Listen for auth state changes via AuthContext                   │
 * │  3. Admit only an authoritatively verified Customer session         │
 * │     into the Customer application                                  │
 * │  4. Redirect unauthenticated users to (auth)/welcome              │
 * │  5. Show a premium cinematic splash screen on cold start          │
 * │                                                                      │
 * │  Layer: app/_layout.tsx (Expo Router root)                          │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Stack, useSegments, useRouter, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { AuthFontAssets } from '@/constants/authTheme';
import { ThemeProvider, useTheme } from '@/hooks/useThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import PremiumToast from '@/components/ui/PremiumToast';
import AppLockGuard from '@/components/AppLockGuard';
import { resolveRouteForRole } from '@/utils/routeResolver';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { focusManager, QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { processQueue } from '@/services/offlineQueue';
import { apiClient, getApiStatusCode, hasCompletedNetworkRetries } from '@/services/api/client';
import { isCustomerRole } from '@/services/api/roles';
import { SystemStatusProvider } from '@/context/SystemStatusContext';
import SystemStatusGate from '@/components/SystemStatusGate';
import { FullScreenLoader } from '@/components/ui/loading';
import { Motion } from '@/constants/motion';
import { KeyboardProvider } from 'react-native-keyboard-controller';

// Keep the native splash visible while AuthContext restores and validates the
// persisted session. Failure is non-fatal: Expo can continue with auto-hide.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Role-Based Route Resolver ──────────────────────────────────────────
// Lives in @/utils/routeResolver — imported above.

// ── Inner Layout (consumes AuthContext) ────────────────────────────────
function InnerLayout() {
  const { isDark, colors } = useTheme();
  const { session, token, profile, initialized, pendingLoginOtp, loginOtpVerified } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [authFontsLoaded, authFontsError] = useFonts(AuthFontAssets);

  // Role resolution is part of authentication. AuthContext only initializes
  // after /auth/me has validated restored sessions against the live DB role.
  const isAuthorizedCustomer = Boolean(token && profile && isCustomerRole(profile.role));
  const isAuthed = isAuthorizedCustomer && Boolean(session || loginOtpVerified);
  const inAuthGroup = segments[0] === '(auth)';
  const inLoginOtpScreen = inAuthGroup && segments[1] === 'verify';

  useEffect(() => {
    if (!initialized) return;
    // A font load failure falls back to the system font rather than blocking
    // the app — never leave the native splash stuck on a font error.
    if (!authFontsLoaded && !authFontsError) return;
    // AuthContext always reaches `initialized`, including its recovery paths,
    // so a failed session restore cannot leave the native splash stuck.
    void SplashScreen.hideAsync().catch(() => {});
  }, [initialized, authFontsLoaded, authFontsError]);

  useEffect(() => {
    if (!initialized) return;
    if (isAuthed && inAuthGroup) {
      // Authenticated Customer still on auth screens → enter Customer app.
      const target = resolveRouteForRole(profile?.role);
      router.replace(target);
    }
  }, [inAuthGroup, isAuthed, initialized, segments, router, profile?.role]);

  // ── Block ALL rendering until Firebase auth is confirmed ──────────────
  if (!initialized) {
    return <FullScreenLoader label="Restoring your session" detail="Securing your AutoSPF+ experience" />;
  }

  // ── Unauthenticated route gate ──────────────────────────────────────────
  // A password-validated OTP challenge may render only the verification
  // screen. It is not a session and cannot render any protected route.
  if (!isAuthed) {
    const challengeUsable = Boolean(
      pendingLoginOtp && pendingLoginOtp.challengeExpiresAt > Date.now()
    );
    const redirectTarget = challengeUsable
      ? (inLoginOtpScreen ? null : '/(auth)/verify')
      : (inAuthGroup ? null : '/(auth)/login');

    return (
      <>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'simple_push',
            animationDuration: Motion.duration.screen,
          }}
        >
          {/* Keep the root gate registered because successful login/OTP flows
              replace to "/" before RootIndex performs the final redirect. */}
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
        </Stack>
        {redirectTarget ? <Redirect href={redirectTarget} /> : null}
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'simple_push',
          animationDuration: Motion.duration.screen,
          freezeOnBlur: true,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade', animationDuration: Motion.duration.standard }} />
        <Stack.Screen name="(customer)" options={{ animation: 'fade', animationDuration: Motion.duration.standard }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade', animationDuration: Motion.duration.standard }} />
        <Stack.Screen
          name="(screens)/booking-details"
          options={{ animation: 'simple_push', animationDuration: Motion.duration.screen }}
        />
        <Stack.Screen
          name="(screens)/payments"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/documents"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/notifications"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/settings"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/waiver"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="(screens)/appointments"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/services"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/change-password"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/edit-profile"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/vehicles"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/address"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/notification-preferences"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/ai-chat"
          options={{
            animation: 'ios_from_right',
            presentation: 'card',
            gestureEnabled: true,
            contentStyle: { backgroundColor: '#050506' },
          }}
        />
      </Stack>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (getApiStatusCode(error) === 401) return false;
        if (hasCompletedNetworkRetries(error)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

// React Query Network online/offline state management
NetInfo.addEventListener((state: any) => {
  onlineManager.setOnline(!!state.isConnected);
  if (state.isConnected) {
    // Attempt to drain queue immediately when network connects!
    processQueue(apiClient);
  }
});

function GlobalWatchers({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  // Initiates socket connection natively based on user role
  useRealtimeSync();
  // Initializes Expo push registration only after a JWT session exists.
  usePushNotifications(Boolean(token));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}

// ── Root Layout (wraps everything in providers) ────────────────────────
export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <KeyboardProvider
        preserveEdgeToEdge
        statusBarTranslucent
        navigationBarTranslucent
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SystemStatusProvider>
              <AuthProvider>
                <NotificationsProvider>
                  <AppLockGuard>
                    <PremiumToast />
                    <GlobalWatchers>
                      <SystemStatusGate>
                        <InnerLayout />
                      </SystemStatusGate>
                    </GlobalWatchers>
                  </AppLockGuard>
                </NotificationsProvider>
              </AuthProvider>
            </SystemStatusProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GlobalErrorBoundary>
  );
}
