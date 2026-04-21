/**
 * AutoSPF+ — Frontend RBAC Permission System
 *
 * Maps each role to the modules and actions they are allowed to perform.
 * Role slugs match exactly what the backend JWT and roles.ts declare.
 *
 * NOTE: 'sales_cashier' in the user-facing spec maps to 'sales' in the codebase.
 *       'operations_manager' in the spec maps to 'operation_manager' in the codebase.
 *       All keys here use the actual codebase slugs.
 */

export type RoleSlug =
  | 'office_admin'
  | 'operation_manager'
  | 'quality_checker'       // maps to staff_quality_checker in legacy roles
  | 'staff_quality_checker' // alias — treated identically
  | 'hr'
  | 'inventory'
  | 'staff_inventory'       // alias — treated identically
  | 'sales'                 // "sales_cashier" in original spec
  | 'customer'
  | 'administrator';        // superuser — gets all permissions

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
  | 'customer_tracker'   // Customer Status Tracker — service progress visibility
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
  | 'request_create'; // HR-only: submit account creation request

type PermissionMap = Partial<Record<ModuleSlug, ActionSlug[]>>;

export const PERMISSIONS: Record<RoleSlug, PermissionMap> = {

  // ── System Authority ──────────────────────────────────────────────────────
  // administrator: full superuser — not assignable via UI
  administrator: {
    user_management:    ['create', 'read', 'update', 'delete', 'assign_role'],
    booking_management: ['create', 'read', 'update', 'delete', 'assign'],
    job_management:     ['create', 'read', 'update', 'delete', 'assign', 'approve'],
    quality_control:    ['create', 'read', 'verify'],
    inventory:          ['create', 'read', 'update', 'delete', 'approve'],
    pos_transactions:   ['create', 'read', 'execute_refund', 'approve'],
    hr_management:      ['create', 'read', 'update', 'delete'],
    reports:            ['read'],
    system_settings:    ['read', 'update'],
    service_catalog:    ['create', 'read', 'update', 'delete'],
    ai_ar_module:       ['read'],
    customer_tracker:   ['read'],
  },

  // ── System Authority — Office Administrator ───────────────────────────────
  // Modules: User Registration + User Management (accounts, roles, profiles)
  office_admin: {
    user_management:    ['create', 'read', 'update', 'delete', 'assign_role'],
    system_settings:    ['read', 'update'],
  },

  // ── Operational Authority — Operations Manager ────────────────────────────
  // Modules: Staff & Technician Dashboard + Customer Status Tracker
  operation_manager: {
    job_management:     ['read', 'update', 'assign', 'approve'], // staff/job queue
    booking_management: ['read', 'update'],                      // customer status tracker
    customer_tracker:   ['read'],
    reports:            ['read'],
    ai_ar_module:       ['read'],                                // shared AI module
  },

  // ── Domain Authority — Quality Checker ───────────────────────────────────
  // Modules: Staff Dashboard (review jobs, photos) + AI Damage Detection
  quality_checker: {
    job_management:   ['read'],          // review completed jobs, before/after photos
    quality_control:  ['create', 'read', 'verify'],
    ai_ar_module:     ['read'],          // verify AI analysis results
    reports:          ['read'],
  },

  staff_quality_checker: {
    job_management:   ['read'],
    quality_control:  ['create', 'read', 'verify'],
    ai_ar_module:     ['read'],
    reports:          ['read'],
  },

  // ── Domain Authority — Human Resource (HR) ───────────────────────────────
  // Modules: User Management (staff accounts + role assignments)
  // NOTE: Classmate spec grants HR role assignment authority for staff-level
  //       accounts. assign_role here is scoped to staff/domain roles only
  //       (enforced at query level by backend). Office Admin retains authority
  //       over admin-tier role assignments.
  hr: {
    user_management:  ['create', 'read', 'update', 'delete', 'assign_role'],
    hr_management:    ['create', 'read', 'update', 'delete'],
    reports:          ['read'],
  },

  // ── Domain Authority — Inventory Management Personnel ────────────────────
  // Modules: Inventory Management (stock, suppliers, alerts, voice logging)
  inventory: {
    inventory:        ['create', 'read', 'update', 'delete'],
    reports:          ['read'],
    ai_ar_module:     ['read'],   // voice assistant inventory logging support
  },

  staff_inventory: {
    inventory:        ['create', 'read', 'update', 'delete'],
    reports:          ['read'],
    ai_ar_module:     ['read'],
  },

  // ── Domain Authority — Sales / Cashier ───────────────────────────────────
  // Modules: POS System + customer account/service history review (read-only)
  sales: {
    pos_transactions: ['create', 'read', 'execute_refund'],
    user_management:  ['read'],   // customer history review only
    reports:          ['read'],
  },

  // ── External User — Customer ──────────────────────────────────────────────
  // Modules: Registration/Profile, Customer Status Tracker, AI Chatbot, Booking
  customer: {
    own_bookings:     ['create', 'read', 'update', 'delete'],
    own_profile:      ['read', 'update'],
    customer_tracker: ['read'],   // own service status only
    service_catalog:  ['read'],
    ai_ar_module:     ['read'],   // AI chatbot
  },
};

/**
 * Check if a given role has permission to perform an action on a module.
 *
 * @example
 *   hasPermission('office_admin', 'user_management', 'create') // → true
 *   hasPermission('sales', 'user_management', 'create')        // → false
 */
export function hasPermission(
  role: string | undefined | null,
  module: ModuleSlug,
  action: ActionSlug
): boolean {
  if (!role) return false;
  const rolePerms = PERMISSIONS[role as RoleSlug];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(action);
}

/**
 * Returns whether the given role is allowed to access a module at all
 * (i.e., has at least one permitted action on it).
 */
export function canAccessModule(
  role: string | undefined | null,
  module: ModuleSlug
): boolean {
  if (!role) return false;
  const rolePerms = PERMISSIONS[role as RoleSlug];
  if (!rolePerms) return false;
  return (rolePerms[module]?.length ?? 0) > 0;
}
