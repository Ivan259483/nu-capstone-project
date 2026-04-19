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

export const FULL_ADMIN_ROLES: UserRole[] = [
  'administrator',
];

export const SETTINGS_MANAGER_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
];

export const STAFF_MANAGER_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
];

export const REPORTING_ROLES: UserRole[] = [
  'administrator',
  'operation_manager',
  'sales',
];

export const USER_MANAGEMENT_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
];

export const INVENTORY_MANAGER_ROLES: UserRole[] = [
  'administrator',
  'operation_manager',
  'inventory',
];

export const SUPPLIER_VIEW_ROLES: UserRole[] = [
  'administrator',
  'inventory',
];

export const SUPPLIER_MANAGER_ROLES: UserRole[] = [
  'administrator',
];

export const SERVICE_CATALOG_ROLES: UserRole[] = [
  'administrator',
];

export const BOOKING_MANAGER_ROLES: UserRole[] = [
  'administrator',
  'operation_manager',
];

export const POS_MANAGER_ROLES: UserRole[] = [
  'administrator',
  'sales',
];

// Roles that can view/manage digital waivers & legal records
export const WAIVER_ACCESS_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'operation_manager',
];

// Roles that can view the booking appointment calendar (read + manual adjust)
export const APPOINTMENT_VIEW_ROLES: UserRole[] = [
  'administrator',
  'hr',
  'sales',
];

// Roles that can create/register new user accounts
export const USER_REGISTRATION_ROLES: UserRole[] = [
  'administrator',
  'operation_manager',
  'hr',
  'sales',
];

// Roles that can access the AI Damage Detection & Cost Estimator
export const AI_ESTIMATOR_ROLES: UserRole[] = [
  'administrator',
  'office_admin',
  'operation_manager',
];

// Roles that can access AI Chatbot
export const AI_CHATBOT_ROLES: UserRole[] = [
  'administrator',
  'sales',
];

export const SERVICE_STAFF_ROLE: UserRole = 'service_staff';
export const CUSTOMER_ROLE: UserRole = 'customer';

// ── Granular Staff / Technician role constants ───────────────────────────────
export const STAFF_QC_ROLE: UserRole = 'staff_quality_checker';
export const STAFF_INVENTORY_ROLE: UserRole = 'staff_inventory';
export const TECHNICIAN_ROLE: UserRole = 'technician';

// All roles that are treated as "staff" (redirect to detailer dashboard)
export const STAFF_ROLES: UserRole[] = [
  'service_staff',
  'staff_quality_checker',
  'staff_inventory',
  'technician',
];

// Modules available to Quality Checker staff
export const STAFF_QC_ROLES: UserRole[] = [
  'staff_quality_checker',
];

// Modules available to Inventory Staff
export const STAFF_INVENTORY_ROLES: UserRole[] = [
  'staff_inventory',
];

// Modules available to Technicians (web + mobile)
export const TECHNICIAN_ROLES: UserRole[] = [
  'technician',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  office_admin: 'Office Admin',
  operation_manager: 'Operation Manager',
  hr: 'HR',
  inventory: 'Inventory (Legacy)',
  sales: 'Sales',
  service_staff: 'Service Staff (Legacy)',
  staff_quality_checker: 'Staff - Quality Checker',
  staff_inventory: 'Staff - Inventory',
  technician: 'Technician',
  customer: 'Customer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  administrator: 'Full system access.',
  office_admin: 'Admin dashboard access for users and settings.',
  operation_manager: 'Bookings, staff coordination, and reports.',
  hr: 'Users and staff management access.',
  inventory: 'Inventory module access only.',
  sales: 'POS, receipts, and sales reports.',
  service_staff: 'Access to staff dashboard and assignments.',
  staff_quality_checker: 'QC staff dashboard, job queue, and POS receipts.',
  staff_inventory: 'Real-time inventory management and stock monitoring.',
  technician: 'Voice assistant, AI damage detection, AR, and inventory.',
  customer: 'Booking and status tracking access.',
};

export const USER_ROLE_OPTIONS = [
  // Note: 'administrator' is intentionally omitted — office_admin is the highest assignable role via UI
  { group: 'Admin Roles', value: 'office_admin', label: 'Office Admin' },
  { group: 'Admin Roles', value: 'operation_manager', label: 'Operation Manager' },
  { group: 'Operational Roles', value: 'hr', label: 'HR' },
  { group: 'Operational Roles', value: 'sales', label: 'Sales' },
  { group: 'Staff & Technicians', value: 'staff_quality_checker', label: 'Staff - Quality Checker' },
  { group: 'Staff & Technicians', value: 'staff_inventory', label: 'Staff - Inventory' },
  { group: 'Staff & Technicians', value: 'technician', label: 'Technician' },
  { group: 'Customer Access', value: 'customer', label: 'Customer' },
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
const STAFF_INVENTORY_ROLE_SET = new Set<string>(STAFF_INVENTORY_ROLES);
const TECHNICIAN_ROLE_SET = new Set<string>(TECHNICIAN_ROLES);
const WAIVER_ACCESS_ROLE_SET = new Set<string>(WAIVER_ACCESS_ROLES);
const APPOINTMENT_VIEW_ROLE_SET = new Set<string>(APPOINTMENT_VIEW_ROLES);
const USER_REGISTRATION_ROLE_SET = new Set<string>(USER_REGISTRATION_ROLES);
const AI_ESTIMATOR_ROLE_SET = new Set<string>(AI_ESTIMATOR_ROLES);
const AI_CHATBOT_ROLE_SET = new Set<string>(AI_CHATBOT_ROLES);
const USER_MANAGEMENT_SCOPE: Record<UserRole, UserRole[]> = {
  administrator: [...USER_ROLES],
  office_admin: USER_ROLES.filter(role => role !== 'administrator'),
  operation_manager: [SERVICE_STAFF_ROLE, STAFF_QC_ROLE, STAFF_INVENTORY_ROLE, TECHNICIAN_ROLE],
  hr: [SERVICE_STAFF_ROLE, STAFF_QC_ROLE, STAFF_INVENTORY_ROLE, TECHNICIAN_ROLE, 'inventory', 'sales'],
  inventory: [],
  sales: [],
  service_staff: [],
  staff_quality_checker: [],
  staff_inventory: [],
  technician: [],
  customer: [],
};

export const isUserRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && USER_ROLE_SET.has(role);

export const migrateLegacyUserRole = (role: string | null | undefined): UserRole | null => {
  if (!role) return null;
  const normalizedRole = role.toLowerCase();
  if (isUserRole(normalizedRole)) return normalizedRole as UserRole;

  const mappedRole = LEGACY_ROLE_MAP[normalizedRole as keyof typeof LEGACY_ROLE_MAP];
  return mappedRole || null;
};

export const getSafeUserRole = (
  role: string | null | undefined,
  fallback: UserRole = CUSTOMER_ROLE
): UserRole => migrateLegacyUserRole(role) || fallback;

export const isAdminDashboardRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(role);

export const isFullAdminRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && FULL_ADMIN_ROLE_SET.has(role);

export const isSettingsManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SETTINGS_MANAGER_ROLE_SET.has(role);

export const isStaffManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_MANAGER_ROLE_SET.has(role);

export const isReportingRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && REPORTING_ROLE_SET.has(role);

export const isInventoryManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && INVENTORY_MANAGER_ROLE_SET.has(role);

export const isSupplierViewRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SUPPLIER_VIEW_ROLE_SET.has(role);

export const isSupplierManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SUPPLIER_MANAGER_ROLE_SET.has(role);

export const isServiceCatalogRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && SERVICE_CATALOG_ROLE_SET.has(role);

export const isBookingManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && BOOKING_MANAGER_ROLE_SET.has(role);

export const isPosManagerRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && POS_MANAGER_ROLE_SET.has(role);

export const isServiceStaffRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_ROLE_SET.has(role);

export const isStaffQCRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_QC_ROLE_SET.has(role);

export const isStaffInventoryRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && STAFF_INVENTORY_ROLE_SET.has(role);

export const isTechnicianRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && TECHNICIAN_ROLE_SET.has(role);

export const isWaiverAccessRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && WAIVER_ACCESS_ROLE_SET.has(role);

export const isAppointmentViewRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && APPOINTMENT_VIEW_ROLE_SET.has(role);

export const isUserRegistrationRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && USER_REGISTRATION_ROLE_SET.has(role);

export const isAIEstimatorRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && AI_ESTIMATOR_ROLE_SET.has(role);

export const isAIChatbotRole = (role: string | null | undefined): role is UserRole =>
  typeof role === 'string' && AI_CHATBOT_ROLE_SET.has(role);

export const getManageableUserRoles = (role: string | null | undefined): UserRole[] => {
  const safeRole = getSafeUserRole(role);
  return USER_MANAGEMENT_SCOPE[safeRole];
};

export const canManageUserRole = (
  actorRole: string | null | undefined,
  targetRole: string | null | undefined
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

  if (isAdminDashboardRole(safeRole)) {
    return '/admin/dashboard';
  }

  // All staff & technician roles go to the staff/detailer dashboard
  if (STAFF_ROLE_SET.has(safeRole)) {
    return '/detailer/dashboard';
  }

  return '/customer/dashboard';
};
