import mongoose from 'mongoose';
import { DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES } from '../utils/customerNotificationPreferences.utils.js';

const customerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    vehicles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
      },
    ],
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
      },
    ],
    preferredStore: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
    },
    notificationPreferences: {
      pushEnabled: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.pushEnabled },
      emailEnabled: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.emailEnabled },
      bookingConfirmation: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.bookingConfirmation },
      jobStatusUpdates: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.jobStatusUpdates },
      paymentReminders: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.paymentReminders },
      vehicleReminders: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.vehicleReminders },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
