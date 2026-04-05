export const USER_ROLES = [
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
  'service_staff',
  'customer',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const LEGACY_ROLE_MAP = {
  admin: 'administrator',
  detailer: 'service_staff',
} as const;

export const ADMIN_DASHBOARD_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
];

export const SERVICE_STAFF_ROLE: UserRole = 'service_staff';
export const CUSTOMER_ROLE: UserRole = 'customer';

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  office_admin: 'Office Admin',
  operation_manager: 'Operation Manager',
  hr: 'HR',
  inventory: 'Inventory',
  sales: 'Sales',
  service_staff: 'Service Staff',
  customer: 'Customer',
};

const USER_ROLE_SET = new Set<string>(USER_ROLES);
const ADMIN_DASHBOARD_ROLE_SET = new Set<string>(ADMIN_DASHBOARD_ROLES);

export const isUserRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && USER_ROLE_SET.has(role);

export const migrateLegacyUserRole = (role: string | null | undefined): UserRole | null => {
  if (!role) return null;
  if (isUserRole(role)) return role;

  const mappedRole = LEGACY_ROLE_MAP[role as keyof typeof LEGACY_ROLE_MAP];
  return mappedRole || null;
};

export const getSafeUserRole = (
  role: string | null | undefined,
  fallback: UserRole = CUSTOMER_ROLE
): UserRole => migrateLegacyUserRole(role) || fallback;

export const isAdminDashboardRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(role);

export const isServiceStaffRole = (role: string | null | undefined): role is UserRole =>
  getSafeUserRole(role, CUSTOMER_ROLE) === SERVICE_STAFF_ROLE;

export const getRoleLabel = (role: string | null | undefined): string =>
  ROLE_LABELS[getSafeUserRole(role, CUSTOMER_ROLE)];
