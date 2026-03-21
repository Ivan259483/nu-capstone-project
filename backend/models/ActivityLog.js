import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'completed_job',
      'inventory_update',
      'low_stock',
      'new_booking',
      'started_job',
      'generated_report',
      'status_change',
      'customer_status_change'
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
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster queries
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ type: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
