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
import { getSafeUserRole } from '@/services/api/roles';

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
  if (safeRole === 'service_staff' || safeRole === 'admin' || safeRole === 'super_admin' || safeRole === 'booking_manager' || safeRole === 'pos_manager') {
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
      </Stack>
    </>
  );
}

// ── Root Layout (wraps everything in providers) ────────────────────────
export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppLockGuard>
            <PremiumToast />
            <InnerLayout />
          </AppLockGuard>
        </AuthProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
