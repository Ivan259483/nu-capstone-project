import mongoose from 'mongoose';

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
      pushEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      bookingConfirmation: { type: Boolean, default: true },
      jobStatusUpdates: { type: Boolean, default: true },
      paymentReminders: { type: Boolean, default: true },
      promotionalOffers: { type: Boolean, default: true },
      chatMessages: { type: Boolean, default: true },
      vehicleReminders: { type: Boolean, default: true },
      loyaltyRewards: { type: Boolean, default: true },
      newsletter: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
