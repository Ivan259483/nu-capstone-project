/**
 * Root index — Auth gate
 *
 * This is the FIRST screen Expo Router renders. It blocks all protected
 * routes by immediately redirecting based on auth state before any
 * dashboard has a chance to mount.
 */

import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getSafeUserRole, isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

/** Set true to verify Expo Router + Metro (pure RN). Set false to continue normal flow. */
const SHOW_DEBUG_BOOT_SCREEN = false;

function resolveRoute(role: string | undefined): '/(customer)' | '/(staff)' {
  const safeRole = getSafeUserRole(role);
  if (isAdminDashboardRole(safeRole) || isServiceStaffRole(safeRole)) return '/(staff)';
  return '/(customer)';
}

export default function RootIndex() {
  const { session, profile, initialized } = useAuth();

  if (SHOW_DEBUG_BOOT_SCREEN) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#15803d',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' }}>
          APP WORKING
        </Text>
        <Text style={{ color: '#dcfce7', fontSize: 15, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
          Expo Router + Metro (RN layer OK)
        </Text>
        <Text style={{ color: '#bbf7d0', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
          Flip SHOW_DEBUG_BOOT_SCREEN to false in src/app/index.tsx to restore auth redirects.
        </Text>
      </View>
    );
  }

  // Still waiting for Firebase to confirm auth state
  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#F97316" />
      </View>
    );
  }

  // Not logged in → login screen
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in → correct dashboard based on role
  const target = resolveRoute(profile?.role);
  return <Redirect href={target} />;
}
