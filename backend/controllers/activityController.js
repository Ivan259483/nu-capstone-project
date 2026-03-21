import ActivityLog from '../models/ActivityLog.js';

/**
 * Get recent activity logs
 */
export const getActivityLogs = async (req, res, next) => {
  try {
    const { limit = 50, type } = req.query;

    const query = {};
    if (type) query.type = type;

    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name email role');

    res.json({
      success: true,
      data: logs,
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
    const { type, title, description, userId, userName, metadata } = req.body;

    const log = new ActivityLog({
      type,
      title,
      description,
      userId,
      userName,
      metadata,
    });

    await log.save();

    res.status(201).json({
      success: true,
      message: 'Activity log created',
      data: log,
    });
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
