import { getSafeUserRole, isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

export type RouteTarget = '/(customer)' | '/(staff)' | '/(auth)/login';

export function resolveRouteForRole(role: string | undefined): RouteTarget {
  const safeRole = getSafeUserRole(role);
  if (isAdminDashboardRole(safeRole) || isServiceStaffRole(safeRole)) {
    return '/(staff)';
  }
  return '/(customer)';
}
