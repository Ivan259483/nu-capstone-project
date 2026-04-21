export const USER_ROLES = [
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
  'service_staff',
  // Granular staff / technician roles
  'staff_quality_checker',
  'staff_inventory',
  'technician',
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

// All roles that are treated as "staff" (redirect to staff dashboard on mobile)
export const STAFF_ROLES: UserRole[] = [
  'service_staff',
  'staff_quality_checker',
  'staff_inventory',
  'technician',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  office_admin: 'Office Admin',
  operation_manager: 'Operation Manager',
  hr: 'HR',
  inventory: 'Inventory',
  sales: 'Sales',
  service_staff: 'Service Staff',
  staff_quality_checker: 'Staff - Quality Checker',
  staff_inventory: 'Staff - Inventory',
  technician: 'Technician',
  customer: 'Customer',
};

const USER_ROLE_SET = new Set<string>(USER_ROLES);
const ADMIN_DASHBOARD_ROLE_SET = new Set<string>(ADMIN_DASHBOARD_ROLES);
const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

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
  typeof role === 'string' && STAFF_ROLE_SET.has(role);

export const getRoleLabel = (role: string | null | undefined): string =>
  ROLE_LABELS[getSafeUserRole(role, CUSTOMER_ROLE)];
