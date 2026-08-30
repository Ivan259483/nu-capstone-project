import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import Customer from '../models/customer.model.js';
import User from '../models/user.model.js';
import { getIO } from '../utils/socket.utils.js';
import {
  getInvalidExpoPushTokensFromReceipts,
  sendExpoPushNotification,
} from '../utils/push.utils.js';
import {
  customerNotificationAllowsExternalDelivery,
  resolveCustomerNotificationPreferenceField,
} from '../utils/customerNotificationPreferences.utils.js';

const CUSTOMER_CATEGORIES = new Set(['important', 'service', 'promotion', 'system']);
const EXPO_RECEIPT_DELAY_MS = 15 * 60 * 1000;
let customerPushSender = sendExpoPushNotification;

export function setCustomerPushSenderForTests(sender) {
  customerPushSender = sender || sendExpoPushNotification;
}

const idOf = (value) =>
  value?._id?.toString?.() || value?.toString?.() || String(value || '');

function requiredText(value, field, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required.`);
  return text.slice(0, maxLength);
}

function deliveryFingerprint(input = {}) {
  const metadata = input.metadata || {};
  return JSON.stringify({
    title: input.title,
    message: input.message,
    type: input.type,
    event: input.event,
    category: input.category,
    link: input.link,
    actionType: input.actionType,
    actionId: input.actionId,
    mediaCount: metadata.mediaCount,
    progress: metadata.progress,
    latestStage: metadata.latestStage,
    latestStatus: metadata.latestStatus,
    paymentStatus: metadata.paymentStatus,
    balanceDue: metadata.balanceDue,
  });
}

function notificationPayload(notification) {
  const raw = notification?.toObject ? notification.toObject() : notification;
  if (!raw) return null;
  return {
    id: idOf(raw._id || raw.id),
    _id: idOf(raw._id || raw.id),
    title: raw.title,
    message: raw.message,
    type: raw.type,
    event: raw.event || raw.type,
    category: raw.category,
    priority: raw.priority,
    isRead: Boolean(raw.isRead),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    link: raw.link,
    action: raw.action,
    actionType: raw.actionType,
    actionId: raw.actionId,
    data: raw.metadata || {},
    metadata: raw.metadata || {},
  };
}

async function emitRealtime(userId, notification) {
  const payload = notificationPayload(notification);
  if (!payload) return;
  try {
    const room = `user:${idOf(userId)}`;
    const io = getIO();
    io.to(room).emit('notification:new', payload);
    // Backwards compatibility for already deployed clients.
    io.to(room).emit('notification:customer', payload);
  } catch (_) {
    // Socket.IO is optional in tests and during short startup windows.
  }
}

async function sendPush(userId, notification) {
  try {
    const [user, customer] = await Promise.all([
      User.findById(userId).select('expoPushTokens').lean(),
      Customer.findOne({ user: userId }).select('notificationPreferences').lean(),
    ]);
    const tokens = Array.isArray(user?.expoPushTokens) ? user.expoPushTokens.filter(Boolean) : [];
    if (
      !tokens.length
      || !customerNotificationAllowsExternalDelivery(
        customer?.notificationPreferences,
        notification,
        'push'
      )
    ) return;

    const payload = notificationPayload(notification);
    const result = await customerPushSender(tokens, notification.title, notification.message, {
      notificationId: payload.id,
      type: payload.type,
      event: payload.event,
      category: payload.category,
      actionType: payload.actionType,
      actionId: payload.actionId,
      orderId: payload.metadata?.orderId || payload.actionId,
      link: payload.link,
    });

    if (result?.invalidTokens?.length) {
      await User.updateOne(
        { _id: userId },
        { $pull: { expoPushTokens: { $in: result.invalidTokens } } }
      );
    }
    if (Object.keys(result?.receiptTokens || {}).length) {
      const receiptTimer = setTimeout(async () => {
        try {
          const { runTrackedSystemMutation } = await import('../middleware/systemLifecycle.middleware.js');
          await runTrackedSystemMutation(async () => {
            const expiredTokens = await getInvalidExpoPushTokensFromReceipts(result.receiptTokens);
            if (expiredTokens.length) {
              await User.updateOne(
                { _id: userId },
                { $pull: { expoPushTokens: { $in: expiredTokens } } }
              );
            }
          });
        } catch (error) {
          console.warn('[customerNotifications] Push receipt check failed:', error.message);
        }
      }, EXPO_RECEIPT_DELAY_MS);
      receiptTimer.unref?.();
    }
  } catch (error) {
    console.warn('[customerNotifications] Push delivery failed:', error.message);
  }
}

async function deliver(userId, notification) {
  await Promise.all([
    emitRealtime(userId, notification),
    sendPush(userId, notification),
  ]);
}

/**
 * Persist, deduplicate, emit, and push one customer notification.
 * `eventKey` is scoped to the authenticated customer by the model's unique index.
 */
export async function createCustomerNotification(input, options = {}) {
  const userId = idOf(input?.userId);
  if (!mongoose.isValidObjectId(userId)) throw new Error('A valid customer userId is required.');

  const event = requiredText(input.event || input.type || 'system', 'event', 100);
  const type = requiredText(input.type || event, 'type', 100);
  const category = CUSTOMER_CATEGORIES.has(input.category) ? input.category : 'important';
  const title = requiredText(input.title, 'title', 180);
  const message = requiredText(input.message, 'message', 2000);
  const eventKey = String(input.eventKey || input.metadata?.idempotencyKey || '').trim();
  const now = new Date();
  const actionId = input.actionId == null ? undefined : idOf(input.actionId).slice(0, 200);
  const action = input.actionLabel || input.link
    ? {
        ...(input.actionLabel ? { label: String(input.actionLabel).slice(0, 80) } : {}),
        ...(input.link ? { link: String(input.link).slice(0, 1000) } : {}),
      }
    : undefined;
  const metadata = {
    ...(input.metadata || {}),
    customerId: userId,
    ...(eventKey ? { idempotencyKey: eventKey } : {}),
  };
  const notificationPreferenceField = resolveCustomerNotificationPreferenceField({
    ...input,
    metadata,
  });
  if (notificationPreferenceField) {
    metadata.notificationPreferenceField = notificationPreferenceField;
  }
  const insertMetadata = input.insertMetadata || {};
  const document = {
    title,
    message,
    type,
    event,
    category,
    source: input.source || 'Customer Notifications',
    severity: input.severity || (input.priority === 'high' ? 'warning' : 'info'),
    priority: input.priority || 'normal',
    recipientRole: 'customer',
    recipientUserId: new mongoose.Types.ObjectId(userId),
    isRead: false,
    readAt: null,
    link: input.link,
    action,
    actionType: input.actionType,
    actionId,
    metadata: { ...insertMetadata, ...metadata },
    firstOccurredAt: now,
    lastOccurredAt: now,
  };

  let notification;
  let shouldDeliver = false;

  if (!eventKey) {
    notification = await Notification.create(document);
    shouldDeliver = true;
  } else {
    const filter = {
      recipientUserId: document.recipientUserId,
      'metadata.idempotencyKey': eventKey,
    };
    const existing = await Notification.findOne(filter);

    if (!existing) {
      try {
        notification = await Notification.create(document);
        shouldDeliver = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        notification = await Notification.findOne(filter);
      }
    } else {
      const before = deliveryFingerprint(existing.toObject());
      const after = deliveryFingerprint(document);
      const meaningfulChange = before !== after;
      const update = {
        title,
        message,
        type,
        event,
        category,
        priority: document.priority,
        link: document.link,
        action: document.action,
        actionType: document.actionType,
        actionId: document.actionId,
        updatedAt: now,
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
      };
      if (options.reactivateUnread && meaningfulChange) {
        update.isRead = false;
        update.readAt = null;
        update.lastOccurredAt = now;
        shouldDeliver = true;
      }
      notification = await Notification.findOneAndUpdate(filter, { $set: update }, { new: true });
    }
  }

  if (!notification) throw new Error('Notification persistence failed.');

  if (typeof options.afterPersist === 'function') {
    try {
      notification = (await options.afterPersist(notification)) || notification;
    } catch (error) {
      // Email or other secondary delivery must not hide an already-persisted
      // in-app notification or prevent socket/push delivery.
      console.warn('[customerNotifications] Post-persist delivery failed:', error.message);
    }
  }
  if (shouldDeliver) await deliver(userId, notification);
  return notification;
}

export { notificationPayload };
