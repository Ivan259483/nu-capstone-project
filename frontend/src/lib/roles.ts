/**
 * Canonical roles (matches backend/constants/roles.js).
 * Staff: office_admin, sales, staff_quality_checker. Plus administrator + customer.
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

/** Map any known legacy slug to a current UserRole (best effort). */
export const normalizeToCanonical = (role: string | null | undefined): UserRole | null => {
  if (!role) return null;
  const lowered = role.toLowerCase();
  const mapped = LEGACY_ROLE_MAP[lowered as keyof typeof LEGACY_ROLE_MAP];
  if (mapped) return mapped;
  if (USER_ROLES.includes(lowered as UserRole)) return lowered as UserRole;
  return null;
};

export const ADMIN_DASHBOARD_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'staff_quality_checker',
];

export const FULL_ADMIN_ROLES: UserRole[] = ['administrator'];

export const SETTINGS_MANAGER_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const STAFF_MANAGER_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const REPORTING_ROLES: UserRole[] = ['administrator', 'office_admin', 'sales'];

export const USER_MANAGEMENT_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const INVENTORY_MANAGER_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const INVENTORY_DASHBOARD_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const SUPPLIER_VIEW_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const SUPPLIER_MANAGER_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const SERVICE_CATALOG_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const BOOKING_MANAGER_ROLES: UserRole[] = ['administrator', 'office_admin', 'sales'];

export const POS_MANAGER_ROLES: UserRole[] = ['administrator', 'sales'];

export const WAIVER_ACCESS_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const APPOINTMENT_VIEW_ROLES: UserRole[] = ['administrator', 'office_admin', 'sales'];

export const USER_REGISTRATION_ROLES: UserRole[] = ['administrator', 'office_admin'];

export const AI_ESTIMATOR_ROLES: UserRole[] = ['administrator', 'office_admin', 'staff_quality_checker'];

export const AI_CHATBOT_ROLES: UserRole[] = ['administrator', 'office_admin', 'sales', 'staff_quality_checker'];

export const STAFF_QC_ROLE: UserRole = 'staff_quality_checker';

/** Legacy name: assignable “floor” staff for job assignment UIs — maps to QC role. */
export const SERVICE_STAFF_ROLE: UserRole = 'staff_quality_checker';

export const CUSTOMER_ROLE: UserRole = 'customer';

export const STAFF_ROLES: UserRole[] = ['staff_quality_checker'];

export const STAFF_QC_ROLES: UserRole[] = ['staff_quality_checker'];

export const TECHNICIAN_ROLES: UserRole[] = [];

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  office_admin: 'Office Admin',
  sales: 'Sales',
  staff_quality_checker: 'Quality Checker - Technician',
  customer: 'Customer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  administrator: 'Full system access (bootstrap superuser).',
  office_admin: 'Oversees and controls everything: users, bookings, operations, live tracking access, and settings.',
  sales: 'Booking appointments, point of sale, and assistance for customer booking.',
  staff_quality_checker: 'Vehicle live tracking, QC workflows, and job visibility.',
  customer: 'Booking and status tracking access.',
};

/** Human-friendly labels for Admin Hub “Create user” role dropdown (title case) */
export const HUB_CREATE_ROLE_LABELS: Record<string, string> = {
  office_admin: 'Office Admin',
  sales: 'Sales',
  staff_quality_checker: 'Quality Checker - Technician',
};

/** Roles offered in Admin Hub "Create user" — one overseer (OFFICE ADMIN) + sales + QC only */
export const HUB_CREATE_USER_ROLES: UserRole[] = ['office_admin', 'sales', 'staff_quality_checker'];

export const USER_ROLE_OPTIONS = [
  { group: 'Staff', value: 'office_admin', label: 'Office Admin' },
  { group: 'Staff', value: 'sales', label: 'Sales' },
  { group: 'Staff', value: 'staff_quality_checker', label: 'Quality Checker - Technician' },
] as const;

const USER_ROLE_SET = new Set<string>(USER_ROLES);
const ADMIN_DASHBOARD_ROLE_SET = new Set<string>(ADMIN_DASHBOARD_ROLES);
const FULL_ADMIN_ROLE_SET = new Set<string>(FULL_ADMIN_ROLES);
const SETTINGS_MANAGER_ROLE_SET = new Set<string>(SETTINGS_MANAGER_ROLES);
const STAFF_MANAGER_ROLE_SET = new Set<string>(STAFF_MANAGER_ROLES);
const REPORTING_ROLE_SET = new Set<string>(REPORTING_ROLES);
const INVENTORY_MANAGER_ROLE_SET = new Set<string>(INVENTORY_MANAGER_ROLES);
const SUPPLIER_VIEW_ROLE_SET = new Set<string>(SUPPLIER_VIEW_ROLES);
const SUPPLIER_MANAGER_ROLE_SET = new Set<string>(SUPPLIER_MANAGER_ROLES);
const SERVICE_CATALOG_ROLE_SET = new Set<string>(SERVICE_CATALOG_ROLES);
const BOOKING_MANAGER_ROLE_SET = new Set<string>(BOOKING_MANAGER_ROLES);
const POS_MANAGER_ROLE_SET = new Set<string>(POS_MANAGER_ROLES);
const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);
const STAFF_QC_ROLE_SET = new Set<string>(STAFF_QC_ROLES);
const TECHNICIAN_ROLE_SET = new Set<string>(TECHNICIAN_ROLES);
const WAIVER_ACCESS_ROLE_SET = new Set<string>(WAIVER_ACCESS_ROLES);
const APPOINTMENT_VIEW_ROLE_SET = new Set<string>(APPOINTMENT_VIEW_ROLES);
const USER_REGISTRATION_ROLE_SET = new Set<string>(USER_REGISTRATION_ROLES);
const AI_ESTIMATOR_ROLE_SET = new Set<string>(AI_ESTIMATOR_ROLES);
const AI_CHATBOT_ROLE_SET = new Set<string>(AI_CHATBOT_ROLES);

export const USER_MANAGEMENT_SCOPE: Record<UserRole, UserRole[]> = {
  /** Full directory (create still uses HUB_CREATE_USER_ROLES; edit dropdown filters out `administrator`) */
  administrator: [...USER_ROLES],
  office_admin: [...USER_ROLES],
  sales: [],
  staff_quality_checker: [],
  customer: [],
};

export const isUserRole = (role: string | null | undefined): role is UserRole =>
  normalizeToCanonical(role) !== null;

export const migrateLegacyUserRole = (role: string | null | undefined): UserRole | null =>
  normalizeToCanonical(role);

export const getSafeUserRole = (
  role: string | null | undefined,
  fallback: UserRole = CUSTOMER_ROLE,
): UserRole => migrateLegacyUserRole(role) || fallback;

export const isAdminDashboardRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(getSafeUserRole(role));

export const isFullAdminRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && FULL_ADMIN_ROLE_SET.has(getSafeUserRole(role));

export const isSettingsManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SETTINGS_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isStaffManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isReportingRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && REPORTING_ROLE_SET.has(getSafeUserRole(role));

export const isInventoryManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && INVENTORY_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isSupplierViewRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SUPPLIER_VIEW_ROLE_SET.has(getSafeUserRole(role));

export const isSupplierManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SUPPLIER_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isServiceCatalogRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SERVICE_CATALOG_ROLE_SET.has(getSafeUserRole(role));

export const isBookingManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && BOOKING_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isPosManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && POS_MANAGER_ROLE_SET.has(getSafeUserRole(role));

export const isServiceStaffRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_ROLE_SET.has(getSafeUserRole(role));

export const isStaffQCRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_QC_ROLE_SET.has(getSafeUserRole(role));

export const isStaffInventoryRole = (_role: string | null | undefined): _role is UserRole => false;

export const isTechnicianRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && TECHNICIAN_ROLE_SET.has(getSafeUserRole(role));

export const isWaiverAccessRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && WAIVER_ACCESS_ROLE_SET.has(getSafeUserRole(role));

export const isAppointmentViewRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && APPOINTMENT_VIEW_ROLE_SET.has(getSafeUserRole(role));

export const isUserRegistrationRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && USER_REGISTRATION_ROLE_SET.has(getSafeUserRole(role));

export const isAIEstimatorRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && AI_ESTIMATOR_ROLE_SET.has(getSafeUserRole(role));

export const isAIChatbotRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && AI_CHATBOT_ROLE_SET.has(getSafeUserRole(role));

export const getManageableUserRoles = (role: string | null | undefined): UserRole[] => {
  const safeRole = getSafeUserRole(role);
  return USER_MANAGEMENT_SCOPE[safeRole] ?? [];
};

export const canManageUserRole = (
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean => {
  const normalizedTargetRole = getSafeUserRole(targetRole);
  return getManageableUserRoles(actorRole).includes(normalizedTargetRole);
};

export const getRoleLabel = (role: string | null | undefined): string => {
  const safeRole = getSafeUserRole(role);
  return ROLE_LABELS[safeRole];
};

export const getDashboardPathForRole = (role: string | null | undefined): string => {
  const safeRole = getSafeUserRole(role);

  if (safeRole === 'sales') {
    return '/sales/dashboard';
  }

  /** QC / technician floor staff — Detailer portal (`components/technician`), not Admin Hub */
  if (safeRole === 'staff_quality_checker') {
    return '/detailer/dashboard';
  }

  if (isAdminDashboardRole(safeRole)) {
    return '/admin/dashboard';
  }

  return '/customer/dashboard';
};
