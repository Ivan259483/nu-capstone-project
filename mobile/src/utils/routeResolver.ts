import { isCustomerRole } from '@/services/api/roles';

export type RouteTarget = '/(customer)' | '/(auth)/login';

export function resolveRouteForRole(role: string | undefined): RouteTarget {
  return isCustomerRole(role) ? '/(customer)' : '/(auth)/login';
}
