import Notification from '../models/notification.model.js';
import { getNotificationAudiencesForRole } from '../constants/roles.js';

/**
 * Get notifications for the current user's role
 */
export const getNotifications = async (req, res, next) => {
  try {
    const role = req.user.role;
    const recipientRoles = getNotificationAudiencesForRole(role);
    const notifications = await Notification.find({
      recipientRole: { $in: recipientRoles }
    }).sort({ createdAt: -1 }).limit(50);

    const unreadCount = await Notification.countDocuments({
      recipientRole: { $in: recipientRoles },
      isRead: false
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
    const recipientRoles = getNotificationAudiencesForRole(role);
    await Notification.updateMany(
      { recipientRole: { $in: recipientRoles }, isRead: false },
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
