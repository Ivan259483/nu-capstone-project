/**
 * AutoSPF+ — Frontend RBAC Permission System
 *
 * Maps each role to the modules and actions they are allowed to perform.
 * Role slugs match backend JWT and `frontend/src/lib/roles.ts`.
 */

export type RoleSlug =
  | 'office_admin'
  | 'staff_quality_checker'
  | 'sales'
  | 'customer'
  | 'administrator';

export type ModuleSlug =
  | 'user_management'
  | 'booking_management'
  | 'job_management'
  | 'quality_control'
  | 'inventory'
  | 'pos_transactions'
  | 'hr_management'
  | 'reports'
  | 'system_settings'
  | 'service_catalog'
  | 'ai_ar_module'
  | 'customer_tracker'
  | 'own_bookings'
  | 'own_profile';

export type ActionSlug =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'assign'
  | 'approve'
  | 'verify'
  | 'execute_refund'
  | 'assign_role'
  | 'request_create';

type PermissionMap = Partial<Record<ModuleSlug, ActionSlug[]>>;

export const PERMISSIONS: Record<RoleSlug, PermissionMap> = {
  administrator: {
    user_management: ['create', 'read', 'update', 'delete', 'assign_role'],
    booking_management: ['create', 'read', 'update', 'delete', 'assign'],
    job_management: ['create', 'read', 'update', 'delete', 'assign', 'approve'],
    quality_control: ['create', 'read', 'verify'],
    inventory: ['create', 'read', 'update', 'delete', 'approve'],
    pos_transactions: ['create', 'read', 'execute_refund', 'approve'],
    hr_management: ['create', 'read', 'update', 'delete'],
    reports: ['read'],
    system_settings: ['read', 'update'],
    service_catalog: ['create', 'read', 'update', 'delete'],
    ai_ar_module: ['read'],
    customer_tracker: ['read'],
  },

  office_admin: {
    user_management: ['create', 'read', 'update', 'delete', 'assign_role'],
    service_catalog: ['create', 'read', 'update', 'delete'],
    system_settings: ['read', 'update'],
    job_management: ['read', 'update', 'assign', 'approve'],
    booking_management: ['create', 'read', 'update', 'delete', 'assign'],
    inventory: ['create', 'read', 'update', 'delete', 'approve'],
    customer_tracker: ['read'],
    reports: ['read'],
    ai_ar_module: ['read'],
  },

  staff_quality_checker: {
    customer_tracker: ['read'],
    job_management: ['read'],
    quality_control: ['create', 'read', 'verify'],
    ai_ar_module: ['read'],
    reports: ['read'],
  },

  sales: {
    pos_transactions: ['create', 'read', 'execute_refund'],
    booking_management: ['create', 'read', 'update', 'assign'],
    user_management: ['read'],
    reports: ['read'],
  },

  customer: {
    own_bookings: ['create', 'read', 'update', 'delete'],
    own_profile: ['read', 'update'],
    customer_tracker: ['read'],
    service_catalog: ['read'],
    ai_ar_module: ['read'],
  },
};

/** Deprecated API / JWT role strings → current permission bucket */
const ROLE_ALIASES: Record<string, RoleSlug> = {
  admin: 'administrator',
  qc: 'staff_quality_checker',
  quality_checker: 'staff_quality_checker',
  hr: 'office_admin',
  inventory: 'office_admin',
  staff_inventory: 'office_admin',
  service_staff: 'staff_quality_checker',
  technician: 'staff_quality_checker',
};

function resolvePermissionRole(role: string): RoleSlug | null {
  const lower = role.toLowerCase();
  if (ROLE_ALIASES[lower]) return ROLE_ALIASES[lower];
  if (Object.prototype.hasOwnProperty.call(PERMISSIONS, lower)) return lower as RoleSlug;
  return null;
}

export function hasPermission(
  role: string | undefined | null,
  module: ModuleSlug,
  action: ActionSlug,
): boolean {
  if (!role) return false;
  const slug = resolvePermissionRole(role);
  if (!slug) return false;
  const rolePerms = PERMISSIONS[slug];
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(action);
}

export function canAccessModule(
  role: string | undefined | null,
  module: ModuleSlug,
): boolean {
  if (!role) return false;
  const slug = resolvePermissionRole(role);
  if (!slug) return false;
  return (PERMISSIONS[slug][module]?.length ?? 0) > 0;
}
