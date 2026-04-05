import ActivityLog from '../models/activityLog.model.js';

/**
 * Map legacy type to module/action/status
 */
const typeToModuleAction = (type) => {
  const mapping = {
    'completed_job':        { module: 'Booking',   action: 'Job Completed',       status: 'success' },
    'inventory_update':     { module: 'Inventory', action: 'Stock Updated',        status: 'success' },
    'low_stock':            { module: 'Inventory', action: 'Low Stock Alert',      status: 'warning' },
    'new_booking':          { module: 'Booking',   action: 'Booking Created',      status: 'success' },
    'started_job':          { module: 'Booking',   action: 'Job Started',          status: 'info'    },
    'generated_report':     { module: 'Report',    action: 'Report Generated',     status: 'success' },
    'status_change':        { module: 'Booking',   action: 'Status Changed',       status: 'info'    },
    'customer_status_change': { module: 'Booking', action: 'Customer Status Updated', status: 'info' },
    'payment_completed':    { module: 'POS',       action: 'Payment Completed',    status: 'success' },
    'inventory_deduction':  { module: 'Inventory', action: 'Stock Deducted',       status: 'warning' },
    'price_override':       { module: 'POS',       action: 'Price Override',       status: 'warning' },
    'pos_transaction':      { module: 'POS',       action: 'POS Transaction',      status: 'success' },
    'maintenance':          { module: 'System',    action: 'Maintenance Task',     status: 'info'    },
    'settings':             { module: 'Settings',  action: 'Settings Updated',     status: 'success' },
    'login':                { module: 'Auth',      action: 'User Login',           status: 'success' },
    'logout':               { module: 'Auth',      action: 'User Logout',          status: 'info'    },
    'booking_created':      { module: 'Booking',   action: 'Booking Created',      status: 'success' },
    'booking_updated':      { module: 'Booking',   action: 'Booking Updated',      status: 'info'    },
    'booking_cancelled':    { module: 'Booking',   action: 'Booking Cancelled',    status: 'warning' },
    'booking_completed':    { module: 'Booking',   action: 'Booking Completed',    status: 'success' },
    'user_created':         { module: 'User',      action: 'User Created',         status: 'success' },
    'user_edited':          { module: 'User',      action: 'User Edited',          status: 'info'    },
    'role_changed':         { module: 'User',      action: 'Role Changed',         status: 'warning' },
    'access_denied':        { module: 'System',    action: 'Access Denied',        status: 'error'   },
    'system_error':         { module: 'System',    action: 'System Error',         status: 'error'   },
  };
  return mapping[type] || { module: 'System', action: type, status: 'info' };
};

/**
 * Normalize a log entry to ensure all new fields are present
 */
const normalizeLog = (log) => {
  const obj = log.toObject ? log.toObject() : { ...log };
  const derived = typeToModuleAction(obj.type);
  return {
    ...obj,
    id: obj._id?.toString() || obj.id,
    module: obj.module || derived.module,
    action: obj.action || derived.action,
    status: obj.status || derived.status,
    userRole: obj.userRole || 'administrator',
  };
};

/**
 * Get recent activity logs with optional filters
 */
export const getActivityLogs = async (req, res, next) => {
  try {
    const {
      limit = 200,
      type,
      module,
      status,
      search,
      dateFrom,
      dateTo,
    } = req.query;

    const query = {};
    if (type) query.type = type;
    if (module) query.module = module;
    if (status) query.status = status;

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Search filter (on userName, title, description)
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
      ];
    }

    let logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const normalized = logs.map(normalizeLog);

    // If database is empty, return seeded sample data
    if (normalized.length === 0) {
      const seedData = generateSeedData();
      return res.json({
        success: true,
        data: seedData,
        seeded: true,
      });
    }

    res.json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new activity log entry
 */
export const createActivityLog = async (req, res, next) => {
  try {
    const { type, title, description, userId, userName, userRole, module, action, status, metadata } = req.body;

    const derived = typeToModuleAction(type);

    const log = new ActivityLog({
      type,
      title,
      description,
      userId: userId || undefined,
      userName: userName || 'System',
      userRole: userRole || req.user?.role || 'administrator',
      module: module || derived.module,
      action: action || derived.action,
      status: status || derived.status,
      metadata: metadata || {},
    });

    await log.save();

    res.status(201).json({
      success: true,
      message: 'Activity log created',
      data: normalizeLog(log),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get summary stats for today
 */
export const getActivityStats = async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [totalToday, completedJobs, inventoryAlerts, transactions] = await Promise.all([
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd }, type: { $in: ['completed_job', 'booking_completed'] } }),
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd }, type: { $in: ['low_stock', 'inventory_deduction'] } }),
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd }, type: { $in: ['payment_completed', 'pos_transaction'] } }),
    ]);

    res.json({
      success: true,
      data: { totalToday, completedJobs, inventoryAlerts, transactions },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Seed sample activity logs for demo/presentation
 */
export const seedActivityLogs = async (req, res, next) => {
  try {
    const count = await ActivityLog.countDocuments();
    if (count > 0) {
      return res.json({ success: true, message: `Database already has ${count} logs. Skipped seeding.`, skipped: true });
    }

    const seedLogs = generateSeedData(true);
    await ActivityLog.insertMany(seedLogs.map(l => ({
      type: l.type,
      title: l.title,
      description: l.description,
      userName: l.userName,
      userRole: l.userRole,
      module: l.module,
      action: l.action,
      status: l.status,
      metadata: l.metadata || {},
      createdAt: new Date(l.createdAt),
      updatedAt: new Date(l.createdAt),
    })));

    res.json({ success: true, message: `Seeded ${seedLogs.length} activity log entries.`, count: seedLogs.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete old activity logs (cleanup utility)
 */
export const cleanupOldLogs = async (req, res, next) => {
  try {
    const { days = 90 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old activity logs`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate realistic seed data for demo purposes
 */
function generateSeedData(forInsert = false) {
  const now = new Date();
  const entries = [];

  const users = [
    { name: 'Carl Reyes', role: 'administrator' },
    { name: 'Maria Santos', role: 'office_admin' },
    { name: 'Jake Torres', role: 'operation_manager' },
    { name: 'Ana Rivera', role: 'sales' },
    { name: 'System', role: 'system' },
    { name: 'Luis Garcia', role: 'inventory' },
    { name: 'Kevin Tan', role: 'service_staff' },
    { name: 'Sophia Cruz', role: 'customer' },
  ];

  const logs = [
    // Today
    { minsAgo: 5,    user: users[0], type: 'login',             title: 'Admin Login',           action: 'User Login',         module: 'Auth',      status: 'success', description: 'Carl Reyes logged into the admin dashboard.' },
    { minsAgo: 12,   user: users[6], type: 'booking_completed', title: 'Job Completed',         action: 'Booking Completed',  module: 'Booking',   status: 'success', description: 'Kevin Tan completed full detailing for APT-4821.' },
    { minsAgo: 18,   user: users[3], type: 'pos_transaction',   title: 'POS Sale',              action: 'POS Transaction',    module: 'POS',       status: 'success', description: 'Ana Rivera processed POS sale — ₱2,500.00 (Wax + Polish).' },
    { minsAgo: 25,   user: users[5], type: 'inventory_update',  title: 'Stock Restocked',       action: 'Stock Updated',      module: 'Inventory', status: 'success', description: 'Luis Garcia restocked Carnauba Wax: +50 units.' },
    { minsAgo: 33,   user: users[4], type: 'low_stock',         title: 'Low Stock Alert',       action: 'Low Stock Alert',    module: 'Inventory', status: 'warning', description: 'Auto-alert: Microfiber Cloth is below minimum level (3 remaining).' },
    { minsAgo: 47,   user: users[2], type: 'booking_created',   title: 'Booking Created',       action: 'Booking Created',    module: 'Booking',   status: 'success', description: 'Jake Torres created booking APT-4822 for Sophia Cruz — Full Interior.' },
    { minsAgo: 52,   user: users[1], type: 'user_created',      title: 'New User Added',        action: 'User Created',       module: 'User',      status: 'success', description: 'Maria Santos created account for Kevin Tan (Service Staff).' },
    { minsAgo: 68,   user: users[0], type: 'settings',          title: 'Settings Updated',      action: 'Settings Updated',   module: 'Settings',  status: 'success', description: 'Carl Reyes updated membership discount rate to 10%.' },
    { minsAgo: 75,   user: users[7], type: 'new_booking',       title: 'Online Booking Created', action: 'Booking Created',   module: 'Booking',   status: 'success', description: 'Sophia Cruz booked Full Exterior Detail via customer portal.' },
    { minsAgo: 90,   user: users[3], type: 'payment_completed', title: 'Payment Received',      action: 'Payment Completed',  module: 'POS',       status: 'success', description: 'Ana Rivera confirmed payment of ₱3,800.00 for APT-4815 (GCash).' },
    { minsAgo: 102,  user: users[4], type: 'access_denied',     title: 'Access Denied',         action: 'Access Denied',      module: 'System',    status: 'error',   description: 'Unauthorized access attempt on /api/settings from unknown source.' },
    { minsAgo: 118,  user: users[6], type: 'started_job',       title: 'Job Started',           action: 'Job Started',        module: 'Booking',   status: 'success', description: 'Kevin Tan started detailing APT-4820 — Full Package.' },
    { minsAgo: 130,  user: users[1], type: 'role_changed',      title: 'Role Updated',          action: 'Role Changed',       module: 'User',      status: 'warning', description: 'Maria Santos changed Luis Garcia\'s role from Inventory to Office Admin.' },
    { minsAgo: 145,  user: users[5], type: 'inventory_deduction', title: 'Inventory Used',     action: 'Stock Deducted',     module: 'Inventory', status: 'warning', description: 'Luis Garcia deducted 5 units of Carnauba Wax for job APT-4818.' },
    { minsAgo: 162,  user: users[2], type: 'booking_updated',   title: 'Booking Rescheduled',   action: 'Booking Updated',    module: 'Booking',   status: 'info',    description: 'Jake Torres updated booking APT-4817 — rescheduled to 2:00 PM.' },
    { minsAgo: 180,  user: users[0], type: 'login',             title: 'Admin Login',           action: 'User Login',         module: 'Auth',      status: 'success', description: 'Carl Reyes started morning session.' },
    // Yesterday
    { minsAgo: 1500, user: users[3], type: 'pos_transaction',   title: 'POS Sale',              action: 'POS Transaction',    module: 'POS',       status: 'success', description: 'Ana Rivera completed POS transaction — ₱1,200.00.' },
    { minsAgo: 1520, user: users[6], type: 'completed_job',     title: 'Job Completed',         action: 'Job Completed',      module: 'Booking',   status: 'success', description: 'Kevin Tan completed Premium Wash for APT-4810.' },
    { minsAgo: 1540, user: users[1], type: 'user_edited',       title: 'User Profile Updated',  action: 'User Edited',        module: 'User',      status: 'info',    description: 'Maria Santos updated contact details for Ana Rivera.' },
    { minsAgo: 1560, user: users[4], type: 'system_error',      title: 'System Error',          action: 'System Error',       module: 'System',    status: 'error',   description: 'Email notification failed: SMTP connection timeout. Retrying...' },
    { minsAgo: 1580, user: users[5], type: 'inventory_update',  title: 'Inventory Received',    action: 'Stock Updated',      module: 'Inventory', status: 'success', description: 'Luis Garcia received 100 units of Microfiber Cloth from supplier.' },
    { minsAgo: 1600, user: users[0], type: 'generated_report',  title: 'Report Exported',       action: 'Report Generated',   module: 'Report',    status: 'success', description: 'Carl Reyes generated daily revenue summary report.' },
    { minsAgo: 1620, user: users[2], type: 'booking_cancelled', title: 'Booking Cancelled',     action: 'Booking Cancelled',  module: 'Booking',   status: 'warning', description: 'Jake Torres cancelled APT-4808 — customer request (no-show).' },
    { minsAgo: 1800, user: users[0], type: 'logout',            title: 'Admin Logout',          action: 'User Logout',        module: 'Auth',      status: 'info',    description: 'Carl Reyes ended session.' },
    // 2 days ago
    { minsAgo: 2900, user: users[3], type: 'price_override',    title: 'Price Overridden',      action: 'Price Override',     module: 'POS',       status: 'warning', description: 'Ana Rivera applied manual discount — ₱500 off for loyal customer.' },
    { minsAgo: 2920, user: users[6], type: 'completed_job',     title: 'Job Completed',         action: 'Job Completed',      module: 'Booking',   status: 'success', description: 'Kevin Tan completed Engine Bay Clean for APT-4802.' },
    { minsAgo: 2940, user: users[1], type: 'user_created',      title: 'New User Added',        action: 'User Created',       module: 'User',      status: 'success', description: 'Maria Santos created account for new customer Lena Ramirez.' },
    { minsAgo: 2960, user: users[4], type: 'maintenance',       title: 'Database Backup',       action: 'Maintenance Task',   module: 'System',    status: 'success', description: 'Automated database backup completed successfully.' },
    { minsAgo: 2980, user: users[5], type: 'low_stock',         title: 'Critical Stock Alert',  action: 'Low Stock Alert',    module: 'Inventory', status: 'warning', description: 'Auto-alert: Glass Cleaner critically low — only 2 units left.' },
    { minsAgo: 3000, user: users[2], type: 'status_change',     title: 'Status Updated',        action: 'Status Changed',     module: 'Booking',   status: 'info',    description: 'Jake Torres updated APT-4799 status from Pending to Confirmed.' },
  ];

  for (const entry of logs) {
    const ts = new Date(now.getTime() - entry.minsAgo * 60 * 1000);
    const obj = {
      _id: undefined,
      id: `seed-${Math.random().toString(36).slice(2, 10)}`,
      type: entry.type,
      title: entry.title,
      description: entry.description,
      userName: entry.user.name,
      userRole: entry.user.role,
      module: entry.module,
      action: entry.action,
      status: entry.status,
      metadata: entry.metadata || {},
      createdAt: ts.toISOString(),
      updatedAt: ts.toISOString(),
    };
    if (forInsert) {
      delete obj._id;
      delete obj.id;
    }
    entries.push(obj);
  }

  return entries;
}
