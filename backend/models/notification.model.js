import mongoose from 'mongoose';
import { NOTIFICATION_RECIPIENT_ROLES } from '../constants/roles.js';

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['info', 'success', 'warning', 'error', 'booking', 'inventory', 'chat'], 
    default: 'info' 
  },
  isRead: { type: Boolean, default: false },
  recipientRole: { 
    type: String, 
    enum: NOTIFICATION_RECIPIENT_ROLES, 
    default: 'admin_family' 
  },
  // Per-user targeting: when set, only this specific user sees the notification
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  link: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Per-user targeted notifications, sorted by recency
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
// Role-based broadcast notifications (recipientUserId is null for broadcasts)
notificationSchema.index({ recipientRole: 1, recipientUserId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
