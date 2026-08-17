import mongoose from 'mongoose';

/**
 * Per-user state for a notification.
 *
 * Notification documents can be broadcast to a role. Storing read/archive state
 * on the broadcast itself would let one administrator change every other
 * administrator's inbox, so those mutable fields live in this receipt record.
 */
const notificationUserStateSchema = new mongoose.Schema(
  {
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    readAt: { type: Date, default: null },
    // Distinguishes an explicit "mark unread" (readAt=null) from a receipt that
    // exists only because the user archived the notification.
    readStateChangedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    // Clear is deliberately a per-user soft removal. Broadcast source data is
    // retained for other recipients and for operational auditability.
    clearedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationUserStateSchema.index(
  { notificationId: 1, userId: 1 },
  { unique: true }
);
notificationUserStateSchema.index({ userId: 1, readAt: 1 });
notificationUserStateSchema.index({ userId: 1, archivedAt: 1, clearedAt: 1 });

export default mongoose.model('NotificationUserState', notificationUserStateSchema);
