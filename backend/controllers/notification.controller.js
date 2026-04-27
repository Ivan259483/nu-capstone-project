import Notification from '../models/notification.model.js';
import { getNotificationAudiencesForRole } from '../constants/roles.js';

/**
 * Get notifications for the current user's role (+ per-user targeting)
 *
 * - Admin/staff roles see role-based broadcasts (recipientUserId is null)
 * - Customer-targeted notifications ALWAYS require recipientUserId match
 *   (prevents old broadcast-style customer notifs from leaking to all accounts)
 */
export const getNotifications = async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user._id || req.user.id;
    const recipientRoles = getNotificationAudiencesForRole(role);

    // Filter out 'customer' from broadcast audiences — those must be per-user
    const broadcastRoles = recipientRoles.filter(r => r !== 'customer');

    const query = {
      $or: [
        // 1. Role-based broadcasts (admin_family, all, etc.) — never 'customer'
        ...(broadcastRoles.length > 0
          ? [{
              recipientRole: { $in: broadcastRoles },
              $or: [
                { recipientUserId: null },
                { recipientUserId: { $exists: false } },
              ],
            }]
          : []),
        // 2. Notifications specifically targeted to this user
        {
          recipientUserId: userId,
        },
      ],
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      ...query,
      isRead: false,
    });

    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user._id || req.user.id;
    const recipientRoles = getNotificationAudiencesForRole(role);
    const broadcastRoles = recipientRoles.filter(r => r !== 'customer');

    await Notification.updateMany(
      {
        $or: [
          ...(broadcastRoles.length > 0
            ? [{
                recipientRole: { $in: broadcastRoles },
                $or: [
                  { recipientUserId: null },
                  { recipientUserId: { $exists: false } },
                ],
              }]
            : []),
          { recipientUserId: userId },
        ],
        isRead: false,
      },
      { isRead: true }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new notification (Internal utility)
 */
export const createNotification = async (data) => {
  try {
    return await Notification.create(data);
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
};
