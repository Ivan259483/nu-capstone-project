import mongoose from 'mongoose';
import { DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES } from '../utils/customerNotificationPreferences.utils.js';
import { CUSTOMER_REGIONAL_OPTIONS } from '../utils/customerRegionalPreferences.utils.js';

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
    garageOnboardingSeen: {
      type: Boolean,
      default: false,
    },
    notificationPreferences: {
      pushEnabled: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.pushEnabled },
      emailEnabled: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.emailEnabled },
      bookingConfirmation: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.bookingConfirmation },
      jobStatusUpdates: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.jobStatusUpdates },
      paymentReminders: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.paymentReminders },
      vehicleReminders: { type: Boolean, default: DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES.vehicleReminders },
    },
    regionalPreferences: Object.fromEntries(
      Object.entries(CUSTOMER_REGIONAL_OPTIONS).map(([key, options]) => [
        key, { type: String, enum: [...options, null], default: null },
      ])
    ),
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
