/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │           AutoGloss (AutoSPF+) — Role-Based Access Hook            │
 * │                                                                      │
 * │  Provides convenient role-checking utilities for any component.     │
 * │  Reads from the global AuthContext — no prop drilling needed.       │
 * │                                                                      │
 * │  Usage:                                                              │
 * │    const { role, isAdmin, isStaff, isCustomer } = useRole();       │
 * │    if (isAdmin) { showAdminPanel(); }                              │
 * │                                                                      │
 * │  Layer: hooks/useRole.ts                                            │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/services/api/types';
import {
  CUSTOMER_ROLE,
  isAdminDashboardRole,
  isServiceStaffRole,
} from '@/services/api/roles';

interface RoleInfo {
  /** The canonical role string from the backend RBAC model. */
  role: UserRole | null;

  /** True if the current user has admin-dashboard privileges */
  isAdmin: boolean;

  /** True if the current user is a service staff member */
  isStaff: boolean;

  /** True if the current user is a regular customer */
  isCustomer: boolean;

  /**
   * Check if the current user's role is included in the allowed list.
   * Usage: hasRole('administrator', 'service_staff')
   */
  hasRole: (...roles: UserRole[]) => boolean;
}

export function useRole(): RoleInfo {
  const { profile } = useAuth();

  return useMemo(() => {
    const role = profile?.role ?? null;

    return {
      role,
      isAdmin: role ? isAdminDashboardRole(role) : false,
      isStaff: role ? isServiceStaffRole(role) : false,
      isCustomer: role === CUSTOMER_ROLE,
      hasRole: (...roles: UserRole[]) => Boolean(role && roles.includes(role)),
    };
  }, [profile?.role]);
}
