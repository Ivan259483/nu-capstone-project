import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useThemeContext';
import { isCustomerRole } from '@/services/api/roles';

/**
 * Legacy staff screens remain in the tree for now, but the Customer Mobile App
 * never mounts them. A deep link is handled before any staff child can render.
 */
export default function StaffRoutesBlockedLayout() {
  const { colors } = useTheme();
  const { initialized, token, profile, signOut } = useAuth();
  const isAuthorizedCustomer = Boolean(token && profile && isCustomerRole(profile.role));

  useEffect(() => {
    if (initialized && !isAuthorizedCustomer && (token || profile)) {
      void signOut();
    }
  }, [initialized, isAuthorizedCustomer, profile, signOut, token]);

  if (!initialized) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <Redirect href={isAuthorizedCustomer ? '/(customer)' : '/(auth)/login'} />;
}
