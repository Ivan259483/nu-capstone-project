/**
 * usePermissions hook
 *
 * Uses useAuth to derive the current user's role and exposes a clean,
 * component-friendly API for checking permissions.
 *
 * @example
 *   const { can, hasRole } = usePermissions();
 *   can('user_management', 'create')     // → true for office_admin
 *   hasRole('office_admin')              // → boolean
 */
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission, canAccessModule } from '@/config/permissions';
import type { ModuleSlug, ActionSlug } from '@/config/permissions';

export interface UsePermissionsReturn {
  /** Check if the current user can perform an action on a module */
  can: (module: ModuleSlug, action: ActionSlug) => boolean;
  /** Check if the current user can access a module (has any permission on it) */
  canAccess: (module: ModuleSlug) => boolean;
  /** Check if the current user has a specific role */
  hasRole: (roleSlug: string) => boolean;
  /** Check if the current user has any of the given roles */
  hasAnyRole: (roleSlugs: string[]) => boolean;
  /** The current user's role slug, or null if not authenticated */
  role: string | null;
}

export function usePermissions(): UsePermissionsReturn {
  const { user } = useAuth();
  const role: string | null = user?.role ?? null;

  return {
    can: (module: ModuleSlug, action: ActionSlug) =>
      hasPermission(role, module, action),

    canAccess: (module: ModuleSlug) =>
      canAccessModule(role, module),

    hasRole: (roleSlug: string) => role === roleSlug,

    hasAnyRole: (roleSlugs: string[]) =>
      !!role && roleSlugs.includes(role),

    role,
  };
}

