/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │          AutoGloss (AutoSPF+) — Root Layout & Navigator            │
 * │                                                                      │
 * │  Responsibilities:                                                   │
 * │  1. Wrap the app in ThemeProvider + AuthProvider (global state)     │
 * │  2. Listen for auth state changes via AuthContext                   │
 * │  3. Route to the correct dashboard based on user role:             │
 * │     - customer        → (customer) Customer Dashboard               │
 * │     - service_staff   → (staff) Staff Dashboard                     │
 * │     - admin-family    → (staff) Admin Dashboard                     │
 * │  4. Redirect unauthenticated users to (auth)/welcome              │
 * │  5. Show a premium cinematic splash screen on cold start          │
 * │                                                                      │
 * │  Layer: app/_layout.tsx (Expo Router root)                          │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from '@/hooks/useThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import PremiumToast from '@/components/ui/PremiumToast';
import AppLockGuard from '@/components/AppLockGuard';
import { getSafeUserRole, isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

// Prevent the native splash from auto-hiding until our custom one is ready.
SplashScreen.preventAutoHideAsync();

// ── Role-Based Route Resolver ──────────────────────────────────────────
// Determines which route group to send the user to after authentication.
// Customers use (customer) and staff/admin use (staff) — each group has its
// own tab navigator. The resolver below determines which to send users to.
//
// If you later need fully separate dashboards, create (staff-tabs) and
// (admin-tabs) route groups and update this resolver.

type RouteTarget = '/(customer)' | '/(staff)' | '/(auth)/welcome';

function resolveRouteForRole(role: string | undefined): RouteTarget {
  const safeRole = getSafeUserRole(role);
  if (isAdminDashboardRole(safeRole) || isServiceStaffRole(safeRole)) {
    return '/(staff)';
  }
  return '/(customer)';
}

// ── Inner Layout (consumes AuthContext) ────────────────────────────────
function InnerLayout() {
  const { isDark, colors } = useTheme();
  const { session, profile, initialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // ► Not authenticated → redirect to welcome/login screen
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      // ► Authenticated but still on auth screens → route by role
      const target = resolveRouteForRole(profile?.role);
      router.replace(target);
    } else if (initialized) {
      // ► Already on the correct screen group → hide native splash
      SplashScreen.hideAsync();
    }
  }, [session, initialized, segments, router, profile?.role]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'ios_from_right',
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen name="(customer)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(staff)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
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
          name="(screens)/preferred-branch"
          options={{ animation: 'ios_from_right' }}
        />
        <Stack.Screen
          name="(screens)/notification-preferences"
          options={{ animation: 'ios_from_right' }}
        />
      </Stack>
    </>
  );
}

import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { processQueue } from '@/services/offlineQueue';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
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
    processQueue();
  }
});

function GlobalWatchers({ children }: { children: React.ReactNode }) {
  // Initiates socket connection natively based on user role
  useRealtimeSync();
  // Initializes expo push tokens and device registration 
  usePushNotifications();

  return <>{children}</>;
}

// ── Root Layout (wraps everything in providers) ────────────────────────
export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <AppLockGuard>
              <PremiumToast />
              <GlobalWatchers>
                <InnerLayout />
              </GlobalWatchers>
            </AppLockGuard>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}
