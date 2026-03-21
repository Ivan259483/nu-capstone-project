import mongoose from 'mongoose';

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
    enum: ['admin', 'detailer', 'customer', 'all'], 
    default: 'admin' 
  },
  link: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
