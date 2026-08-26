import mongoose from 'mongoose';
import { NOTIFICATION_RECIPIENT_ROLES } from '../constants/roles.js';

export const ADMIN_NOTIFICATION_CATEGORIES = Object.freeze([
  'appointments',
  'live_tracking',
  'payments',
  'inventory',
  'security',
  'system',
]);

export const CUSTOMER_NOTIFICATION_CATEGORIES = Object.freeze([
  'important',
  'service',
  'promotion',
]);

export const NOTIFICATION_CATEGORIES = Object.freeze([
  ...ADMIN_NOTIFICATION_CATEGORIES,
  ...CUSTOMER_NOTIFICATION_CATEGORIES,
]);

export const NOTIFICATION_SEVERITIES = Object.freeze([
  'critical',
  'warning',
  'info',
  'success',
]);

const notificationActionSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 80 },
    link: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },

    // `type` is intentionally open-ended for legacy presentation types such as
    // booking, warning, and chat.
    type: { type: String, trim: true, maxlength: 100, default: 'info' },
    // Stable operational name used for precise filters while `type` remains a
    // backwards-compatible presentation hint for existing clients.
    event: { type: String, trim: true, maxlength: 100, default: undefined },
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      default: undefined,
    },
    severity: {
      type: String,
      enum: NOTIFICATION_SEVERITIES,
      default: undefined,
    },
    source: { type: String, trim: true, maxlength: 120, default: undefined },
    actionRequired: { type: Boolean, default: false },

    // Kept for targeted-notification backwards compatibility. Role broadcasts
    // use NotificationUserState so read state is never shared between admins.
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    recipientRole: {
      type: String,
      enum: NOTIFICATION_RECIPIENT_ROLES,
      default: 'admin_family',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    // Per-user targeting: when set, only this specific user sees the notification.
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    link: { type: String, trim: true, maxlength: 1000 },
    action: { type: notificationActionSchema, default: undefined },
    actionType: { type: String, trim: true, maxlength: 100, default: undefined },
    actionId: { type: String, trim: true, maxlength: 200, default: undefined },
    metadata: mongoose.Schema.Types.Mixed,

    // Stable idempotency key for domain conditions that must exist at most once
    // per recipient (for example EVIDENCE_REQUIRED for one order/stage). This is
    // intentionally separate from groupingKey: grouping records activity in a
    // time window, while dedupeKey models one durable condition lifecycle.
    dedupeKey: { type: String, trim: true, maxlength: 240, default: undefined },
    resolvedAt: { type: Date, default: null },
    resolutionReason: { type: String, trim: true, maxlength: 500, default: undefined },
    resolvedByEvent: { type: String, trim: true, maxlength: 100, default: undefined },

    // Repeated operational events may update a recent group instead of creating
    // a noisy activity-feed row. The service owns the grouping time window.
    groupingKey: { type: String, trim: true, maxlength: 240, default: undefined },
    // Deterministic window bucket used with groupingKey to make the first
    // grouped insert race-safe under concurrent event producers.
    groupingBucket: { type: String, trim: true, maxlength: 100, default: undefined },
    groupCount: { type: Number, min: 1, default: 1 },
    firstOccurredAt: { type: Date, default: Date.now },
    lastOccurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Per-user targeted notifications, sorted by recency
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, lastOccurredAt: -1, _id: -1 });
// Role-based broadcast notifications (recipientUserId is null for broadcasts)
notificationSchema.index({ recipientRole: 1, recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, recipientUserId: 1, lastOccurredAt: -1, _id: -1 });
notificationSchema.index({ recipientRole: 1, category: 1, severity: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, category: 1, event: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, recipientUserId: 1, groupingKey: 1, lastOccurredAt: -1 });
notificationSchema.index({ recipientUserId: 1, 'metadata.orderId': 1, 'metadata.kind': 1, 'metadata.stage': 1 });
notificationSchema.index({ recipientRole: 1, recipientUserId: 1, resolvedAt: 1, lastOccurredAt: -1 });
notificationSchema.index({ 'metadata.channel': 1, recipientRole: 1, recipientUserId: 1, lastOccurredAt: -1 });
notificationSchema.index({
  'metadata.channel': 1,
  'metadata.orderId': 1,
  'metadata.notificationType': 1,
  'metadata.stage': 1,
  resolvedAt: 1,
});
notificationSchema.index(
  { recipientRole: 1, recipientUserId: 1, groupingKey: 1, groupingBucket: 1 },
  {
    unique: true,
    partialFilterExpression: {
      groupingKey: { $type: 'string' },
      groupingBucket: { $type: 'string' },
    },
  }
);
// Customer notification idempotency guard. Only documents with a real idempotency key participate.
notificationSchema.index(
  { recipientUserId: 1, 'metadata.idempotencyKey': 1 },
  {
    unique: true,
    partialFilterExpression: {
      recipientUserId: { $type: 'objectId' },
      'metadata.idempotencyKey': { $type: 'string' },
    },
  }
);
// Race-safe idempotency for staff/domain notifications. Null/missing recipient
// IDs are deliberate role broadcasts and therefore share one key per role.
notificationSchema.index(
  { recipientRole: 1, recipientUserId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: 'string' },
    },
  }
);

export default mongoose.model('Notification', notificationSchema);
