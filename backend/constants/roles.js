export const USER_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
  'service_staff',
  'staff_quality_checker',
  'staff_inventory',
  'technician',
  'customer',
]);

export const LEGACY_USER_ROLE_MAP = Object.freeze({
  admin: 'administrator',
  detailer: 'service_staff',
});

export const ADMIN_DASHBOARD_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
  'inventory',
  'sales',
]);

export const FULL_ADMIN_ROLES = Object.freeze([
  'administrator',
]);

export const SETTINGS_MANAGER_ROLES = Object.freeze([
  'administrator',
  'office_admin',
]);

export const STAFF_MANAGER_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
]);

export const REPORTING_ROLES = Object.freeze([
  'administrator',
  'operation_manager',
  'sales',
  'hr',   // HR monitors staff activity logs per capstone spec
]);

export const USER_MANAGEMENT_ROLES = Object.freeze([
  'administrator',
  'office_admin',
  'operation_manager',
  'hr',
]);

export const INVENTORY_MANAGER_ROLES = Object.freeze([
  'administrator',
  'operation_manager',
  'inventory',
]);

export const SUPPLIER_VIEW_ROLES = Object.freeze([
  'administrator',
  'inventory',
]);

export const BOOKING_MANAGER_ROLES = Object.freeze([
  'administrator',
  'operation_manager',
]);

export const POS_MANAGER_ROLES = Object.freeze([
  'administrator',
  'sales',
]);

export const SERVICE_CATALOG_ROLES = Object.freeze([
  'administrator',
]);

export const SUPPLIER_MANAGER_ROLES = Object.freeze([
  'administrator',
]);

export const SERVICE_OPERATION_ROLES = Object.freeze([
  'administrator',
  'service_staff',
  'staff_quality_checker',
  'staff_inventory',
  'technician',
]);

export const SERVICE_STAFF_ROLES = Object.freeze([
  'service_staff',
]);

export const STAFF_ROLES = Object.freeze([
  'service_staff',
  'staff_quality_checker',
  'staff_inventory',
  'technician',
]);

export const CUSTOMER_ROLES = Object.freeze([
  'customer',
]);

export const NOTIFICATION_RECIPIENT_ROLES = Object.freeze([
  ...USER_ROLES,
  'admin_family',
  'all',
]);

export const USER_MANAGEMENT_SCOPE = Object.freeze({
  administrator: Object.freeze([...USER_ROLES]),
  office_admin: Object.freeze(USER_ROLES.filter((role) => role !== 'administrator')),
  // Operations Manager can manage staff & technician accounts per capstone spec
  operation_manager: Object.freeze(['service_staff', 'staff_quality_checker', 'staff_inventory', 'technician']),
  hr: Object.freeze(['service_staff', 'staff_quality_checker', 'staff_inventory', 'technician', 'inventory', 'sales']),
  inventory: Object.freeze([]),
  sales: Object.freeze([]),
  service_staff: Object.freeze([]),
  staff_quality_checker: Object.freeze([]),
  staff_inventory: Object.freeze([]),
  technician: Object.freeze([]),
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

export const isValidUserRole = (role) => typeof role === 'string' && USER_ROLE_SET.has(role.toLowerCase());

export const isAdminDashboardRole = (role) => typeof role === 'string' && ADMIN_DASHBOARD_ROLE_SET.has(role.toLowerCase());

export const isFullAdminRole = (role) => typeof role === 'string' && FULL_ADMIN_ROLE_SET.has(role.toLowerCase());

export const isSettingsManagerRole = (role) => typeof role === 'string' && SETTINGS_MANAGER_ROLE_SET.has(role.toLowerCase());

export const isStaffManagerRole = (role) => typeof role === 'string' && STAFF_MANAGER_ROLE_SET.has(role.toLowerCase());

export const isReportingRole = (role) => typeof role === 'string' && REPORTING_ROLE_SET.has(role.toLowerCase());

export const isUserManagementRole = (role) => typeof role === 'string' && USER_MANAGEMENT_ROLE_SET.has(role.toLowerCase());

export const isInventoryManagerRole = (role) => typeof role === 'string' && INVENTORY_MANAGER_ROLE_SET.has(role.toLowerCase());

export const isSupplierViewRole = (role) => typeof role === 'string' && SUPPLIER_VIEW_ROLE_SET.has(role.toLowerCase());

export const isBookingManagerRole = (role) => typeof role === 'string' && BOOKING_MANAGER_ROLE_SET.has(role.toLowerCase());

export const isPosManagerRole = (role) => typeof role === 'string' && POS_MANAGER_ROLE_SET.has(role.toLowerCase());

export const isServiceCatalogRole = (role) => typeof role === 'string' && SERVICE_CATALOG_ROLE_SET.has(role.toLowerCase());

export const isServiceOperationRole = (role) => typeof role === 'string' && SERVICE_OPERATION_ROLE_SET.has(role.toLowerCase());

export const isServiceStaffRole = (role) => typeof role === 'string' && SERVICE_STAFF_ROLE_SET.has(role.toLowerCase());

export const isStaffRole = (role) => typeof role === 'string' && STAFF_ROLE_SET.has(role.toLowerCase());

export const isCustomerRole = (role) => typeof role === 'string' && role.toLowerCase() === 'customer';

export const isValidNotificationRecipientRole = (role) =>
  typeof role === 'string' && NOTIFICATION_RECIPIENT_ROLE_SET.has(role.toLowerCase());

export const migrateLegacyUserRole = (role) => {
  if (typeof role !== 'string') return role;
  const canonical = role.toLowerCase();
  return LEGACY_USER_ROLE_MAP[canonical] || canonical;
};

export const getManageableUserRoles = (role) => USER_MANAGEMENT_SCOPE[role] || [];

export const canManageUserRole = (actorRole, targetRole) =>
  getManageableUserRoles(actorRole).includes(targetRole);

export const getInvalidUserRoleMessage = () =>
  `Invalid role. Allowed roles: ${USER_ROLES.join(', ')}`;

export const getNotificationAudiencesForRole = (role) => {
  const audiences = new Set(['all']);

  if (isValidUserRole(role)) {
    audiences.add(role);
  }

  if (isAdminDashboardRole(role)) {
    audiences.add('admin_family');
  }

  return [...audiences];
};
