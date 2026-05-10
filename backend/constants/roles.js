/**
 * Canonical user roles (MongoDB user.role enum).
 * Staff-facing product roles: office_admin, sales, staff_quality_checker.
 * administrator = bootstrap superuser; customer = app customers.
 */
export const USER_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'sales',
  'staff_quality_checker',
  'customer',
]);

/** Roles that may be assigned when creating staff (not customer, not default superuser). */
export const STAFF_ASSIGNABLE_ROLES = Object.freeze([
  'office_admin',
  'sales',
  'staff_quality_checker',
]);

export const LEGACY_USER_ROLE_MAP = Object.freeze({
  admin: 'administrator',
  detailer: 'staff_quality_checker',
  operation_manager: 'office_admin',
  hr: 'office_admin',
  inventory: 'office_admin',
  staff_inventory: 'office_admin',
  service_staff: 'staff_quality_checker',
  technician: 'staff_quality_checker',
});

export const ADMIN_DASHBOARD_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'staff_quality_checker',
]);

export const FULL_ADMIN_ROLES = Object.freeze(['administrator']);

export const SETTINGS_MANAGER_ROLES = Object.freeze(['administrator', 'office_admin']);

export const STAFF_MANAGER_ROLES = Object.freeze(['administrator', 'office_admin']);

export const REPORTING_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'sales',
]);

export const USER_MANAGEMENT_ROLES = Object.freeze(['administrator', 'office_admin']);

export const INVENTORY_MANAGER_ROLES = Object.freeze(['administrator', 'office_admin']);

export const SUPPLIER_VIEW_ROLES = Object.freeze(['administrator', 'office_admin']);

export const BOOKING_MANAGER_ROLES = Object.freeze(['administrator', 'office_admin', 'sales']);

export const POS_MANAGER_ROLES = Object.freeze(['administrator', 'sales']);

export const SERVICE_CATALOG_ROLES = Object.freeze(['administrator', 'office_admin']);

export const SUPPLIER_MANAGER_ROLES = Object.freeze(['administrator']);

export const SERVICE_OPERATION_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'sales',
  'staff_quality_checker',
]);

export const SERVICE_STAFF_ROLES = Object.freeze(['staff_quality_checker']);

export const STAFF_ROLES = Object.freeze(['staff_quality_checker']);

export const CUSTOMER_ROLES = Object.freeze(['customer']);

export const NOTIFICATION_RECIPIENT_ROLES = Object.freeze([
  ...USER_ROLES,
  'admin_family',
  'all',
]);

export const USER_MANAGEMENT_SCOPE = Object.freeze({
  /** Full directory; API still blocks assigning `administrator` and hard-delete for non-bootstrap */
  administrator: Object.freeze([...USER_ROLES]),
  office_admin: Object.freeze([...USER_ROLES]),
  sales: Object.freeze([]),
  staff_quality_checker: Object.freeze([]),
  customer: Object.freeze([]),
});

const USER_ROLE_SET = new Set(USER_ROLES);
const ADMIN_DASHBOARD_ROLE_SET = new Set(ADMIN_DASHBOARD_ROLES);
const FULL_ADMIN_ROLE_SET = new Set(FULL_ADMIN_ROLES);
const SETTINGS_MANAGER_ROLE_SET = new Set(SETTINGS_MANAGER_ROLES);
const STAFF_MANAGER_ROLE_SET = new Set(STAFF_MANAGER_ROLES);
const REPORTING_ROLE_SET = new Set(REPORTING_ROLES);
const USER_MANAGEMENT_ROLE_SET = new Set(USER_MANAGEMENT_ROLES);
const INVENTORY_MANAGER_ROLE_SET = new Set(INVENTORY_MANAGER_ROLES);
const SUPPLIER_VIEW_ROLE_SET = new Set(SUPPLIER_VIEW_ROLES);
const BOOKING_MANAGER_ROLE_SET = new Set(BOOKING_MANAGER_ROLES);
const POS_MANAGER_ROLE_SET = new Set(POS_MANAGER_ROLES);
const SERVICE_CATALOG_ROLE_SET = new Set(SERVICE_CATALOG_ROLES);
const SERVICE_OPERATION_ROLE_SET = new Set(SERVICE_OPERATION_ROLES);
const SERVICE_STAFF_ROLE_SET = new Set(SERVICE_STAFF_ROLES);
const STAFF_ROLE_SET = new Set(STAFF_ROLES);
const NOTIFICATION_RECIPIENT_ROLE_SET = new Set(NOTIFICATION_RECIPIENT_ROLES);

/** Map deprecated DB / token roles to a current USER_ROLES value. */
export const normalizeToCanonical = (role) => {
  if (typeof role !== 'string') return role;
  const lowered = role.toLowerCase();
  return LEGACY_USER_ROLE_MAP[lowered] ?? lowered;
};

export const isValidUserRole = (role) =>
  typeof role === 'string' && USER_ROLE_SET.has(normalizeToCanonical(role));

export const isAdminDashboardRole = (role) =>
  typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(normalizeToCanonical(role));

export const isFullAdminRole = (role) =>
  typeof role === 'string' && FULL_ADMIN_ROLE_SET.has(normalizeToCanonical(role));

export const isSettingsManagerRole = (role) =>
  typeof role === 'string' && SETTINGS_MANAGER_ROLE_SET.has(normalizeToCanonical(role));

export const isStaffManagerRole = (role) =>
  typeof role === 'string' && STAFF_MANAGER_ROLE_SET.has(normalizeToCanonical(role));

export const isReportingRole = (role) =>
  typeof role === 'string' && REPORTING_ROLE_SET.has(normalizeToCanonical(role));

export const isUserManagementRole = (role) =>
  typeof role === 'string' && USER_MANAGEMENT_ROLE_SET.has(normalizeToCanonical(role));

export const isInventoryManagerRole = (role) =>
  typeof role === 'string' && INVENTORY_MANAGER_ROLE_SET.has(normalizeToCanonical(role));

export const isSupplierViewRole = (role) =>
  typeof role === 'string' && SUPPLIER_VIEW_ROLE_SET.has(normalizeToCanonical(role));

export const isBookingManagerRole = (role) =>
  typeof role === 'string' && BOOKING_MANAGER_ROLE_SET.has(normalizeToCanonical(role));

/** Front desk / sales may manage customer vehicle garage on behalf of customers (same gate as booking managers). */
export const canManageCustomerGarage = (role) => isBookingManagerRole(role);

export const isPosManagerRole = (role) =>
  typeof role === 'string' && POS_MANAGER_ROLE_SET.has(normalizeToCanonical(role));

export const isServiceCatalogRole = (role) =>
  typeof role === 'string' && SERVICE_CATALOG_ROLE_SET.has(normalizeToCanonical(role));

export const isServiceOperationRole = (role) =>
  typeof role === 'string' && SERVICE_OPERATION_ROLE_SET.has(normalizeToCanonical(role));

export const isServiceStaffRole = (role) =>
  typeof role === 'string' && SERVICE_STAFF_ROLE_SET.has(normalizeToCanonical(role));

export const isStaffRole = (role) =>
  typeof role === 'string' && STAFF_ROLE_SET.has(normalizeToCanonical(role));

export const isCustomerRole = (role) =>
  typeof role === 'string' && normalizeToCanonical(role) === 'customer';

export const isValidNotificationRecipientRole = (role) =>
  typeof role === 'string' && NOTIFICATION_RECIPIENT_ROLE_SET.has(normalizeToCanonical(role));

export const migrateLegacyUserRole = (role) => {
  if (typeof role !== 'string') return role;
  const lowered = role.toLowerCase();
  return LEGACY_USER_ROLE_MAP[lowered] || lowered;
};

export const getManageableUserRoles = (role) =>
  USER_MANAGEMENT_SCOPE[normalizeToCanonical(role)] || [];

export const canManageUserRole = (actorRole, targetRole) =>
  getManageableUserRoles(actorRole).includes(normalizeToCanonical(targetRole));

export const getInvalidUserRoleMessage = () =>
  `Invalid role. Allowed roles: ${USER_ROLES.join(', ')}`;

export const getNotificationAudiencesForRole = (role) => {
  const audiences = new Set(['all']);
  const canonical = normalizeToCanonical(role);

  if (USER_ROLE_SET.has(canonical)) {
    audiences.add(canonical);
  }

  if (ADMIN_DASHBOARD_ROLE_SET.has(canonical)) {
    audiences.add('admin_family');
  }

  return [...audiences];
};
