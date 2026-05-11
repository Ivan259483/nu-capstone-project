/**
 * Mobile role constants — keep in sync with backend `constants/roles.js`.
 */
export const USER_ROLES = [
  'administrator',
  'office_admin',
  'sales',
  'staff_quality_checker',
  'customer',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const LEGACY_ROLE_MAP = {
  admin: 'administrator',
  detailer: 'staff_quality_checker',
  operation_manager: 'office_admin',
  hr: 'office_admin',
  inventory: 'office_admin',
  staff_inventory: 'office_admin',
  service_staff: 'staff_quality_checker',
  technician: 'staff_quality_checker',
} as const;

export const ADMIN_DASHBOARD_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'staff_quality_checker',
];

export const CUSTOMER_ROLE: UserRole = 'customer';

export const STAFF_ROLES: UserRole[] = ['staff_quality_checker'];

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  office_admin: 'Office Admin',
  sales: 'Sales',
  staff_quality_checker: 'Quality Checker - Technician',
  customer: 'Customer',
};

const USER_ROLE_SET = new Set<string>(USER_ROLES);
const ADMIN_DASHBOARD_ROLE_SET = new Set<string>(ADMIN_DASHBOARD_ROLES);
const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

export const normalizeToCanonical = (role: string | null | undefined): UserRole | null => {
  if (!role) return null;
  const lowered = role.toLowerCase();
  const mapped = LEGACY_ROLE_MAP[lowered as keyof typeof LEGACY_ROLE_MAP];
  if (mapped) return mapped;
  if (USER_ROLE_SET.has(lowered)) return lowered as UserRole;
  return null;
};

export const migrateLegacyUserRole = (role: string | null | undefined): UserRole | null =>
  normalizeToCanonical(role);

export const getSafeUserRole = (
  role: string | null | undefined,
  fallback: UserRole = CUSTOMER_ROLE,
): UserRole => migrateLegacyUserRole(role) || fallback;

export const isUserRole = (role: string | null | undefined): role is UserRole =>
  normalizeToCanonical(role) !== null;

export const isAdminDashboardRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(getSafeUserRole(role));

export const isServiceStaffRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_ROLE_SET.has(getSafeUserRole(role));

export const getRoleLabel = (role: string | null | undefined): string =>
  ROLE_LABELS[getSafeUserRole(role, CUSTOMER_ROLE)];

export const getDashboardPathForRole = (role: string | null | undefined): string => {
  const safeRole = getSafeUserRole(role);
  if (safeRole === 'sales') return '/sales/dashboard';
  if (safeRole === 'staff_quality_checker') return '/detailer/dashboard';
  if (isAdminDashboardRole(safeRole)) return '/admin/dashboard';
  return '/customer/dashboard';
};
