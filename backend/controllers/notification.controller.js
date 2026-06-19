import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import {
  getNotificationAudiencesForRole,
  isCustomerRole,
  normalizeToCanonical,
} from '../constants/roles.js';
import {
  getSalesBookingApprovalNotificationQuery,
  syncMissingSalesBalancePickupNotifications,
} from '../utils/bookingManagerNotifications.utils.js';
import { syncMissingCustomerStageNotifications } from '../utils/customerStageNotifications.utils.js';
import { syncMissingCustomerReceiptNotifications } from '../utils/customerReceiptNotification.utils.js';

function buildNotificationsQuery(role, userId) {
  if (normalizeToCanonical(role) === 'sales') {
    return getSalesBookingApprovalNotificationQuery();
  }

  const recipientRoles = getNotificationAudiencesForRole(role);
  const broadcastRoles = recipientRoles.filter((r) => r !== 'customer');

  return {
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
  };
}

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
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);

    if (isCustomerRole(role)) {
      try {
        await syncMissingCustomerStageNotifications(userId);
      } catch (syncErr) {
        console.warn('[notifications] Stage sync failed:', syncErr.message);
      }
      try {
        await syncMissingCustomerReceiptNotifications(userId);
      } catch (syncErr) {
        console.warn('[notifications] Receipt sync failed:', syncErr.message);
      }
    }

    if (normalizeToCanonical(role) === 'sales') {
      try {
        await syncMissingSalesBalancePickupNotifications();
      } catch (syncErr) {
        console.warn('[notifications] Balance pickup sync failed:', syncErr.message);
      }
    }

    const query = buildNotificationsQuery(role, userId);

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
    const role = req.user.role;
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const query = buildNotificationsQuery(role, userId);

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...query },
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
    const userId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const query = buildNotificationsQuery(role, userId);

    await Notification.updateMany(
      { ...query, isRead: false },
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
