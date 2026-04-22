/**
 * Root index — Auth gate
 *
 * This is the FIRST screen Expo Router renders. It blocks all protected
 * routes by immediately redirecting based on auth state before any
 * dashboard has a chance to mount.
 */

import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getSafeUserRole, isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

function resolveRoute(role: string | undefined): '/(customer)' | '/(staff)' {
  const safeRole = getSafeUserRole(role);
  if (isAdminDashboardRole(safeRole) || isServiceStaffRole(safeRole)) return '/(staff)';
  return '/(customer)';
}

export default function RootIndex() {
  const { session, profile, initialized } = useAuth();

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
