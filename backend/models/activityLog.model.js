import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      // ── Authentication ──
      'login',
      'logout',
      'failed_login',
      'password_reset',
      'account_lock',
      'session_restore',

      // ── User Management ──
      'user_created',
      'user_edited',
      'role_changed',
      'user_deactivated',
      'user_deleted',

      // ── Bookings ──
      'booking_created',
      'booking_updated',
      'booking_cancelled',
      'booking_completed',
      'booking_assigned',
      'booking_started',
      'new_booking',
      'status_change',

      // ── POS / Sales ──
      'payment_success',
      'payment_failed',
      'payment_completed',
      'invoice_generated',
      'refund_processed',
      'pos_transaction',
      'price_override',

      // ── Inventory ──
      'stock_in',
      'stock_out',
      'low_stock',
      'inventory_edit',
      'inventory_update',
      'inventory_deduction',

      // ── Service Staff ──
      'service_started',
      'service_progress',
      'service_completed',
      'started_job',
      'completed_job',

      // ── Customer ──
      'customer_registered',
      'customer_booking',
      'customer_payment',
      'customer_status_change',

      // ── System ──
      'access_denied',
      'system_error',
      'api_error',
      'sync_failed',
      'database_issue',
      'maintenance',
      'settings',
      'generated_report',
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  userName: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    default: 'system'
  },
  module: {
    type: String,
    enum: ['Auth', 'Booking', 'User', 'POS', 'Inventory', 'System', 'Settings', 'Report', 'Service', 'Customer'],
    default: 'System'
  },
  action: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['success', 'warning', 'error', 'info'],
    default: 'success'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for faster queries
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ type: 1 });
activityLogSchema.index({ module: 1 });
activityLogSchema.index({ status: 1 });
activityLogSchema.index({ userName: 1 });
activityLogSchema.index({ userId: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
