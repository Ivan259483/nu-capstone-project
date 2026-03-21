import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customerName: String,
    serviceType: String,
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        quantity: Number,
        price: Number,
      },
    ],
    totalAmount: Number,
    totalPrice: Number,
    invoiceId: String,
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'failed', 'refunded'],
      default: 'unpaid',
    },
    paymentMethod: String,
    paymentProvider: String,
    paidAt: Date,
    inventoryDeductedAt: Date,
    customerStatus: {
      type: String,
      enum: ['received', 'washing', 'detailing', 'ready', 'queued', 'in-progress', 'finishing'],
      default: 'received',
    },
    customerStatusUpdatedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'assigned', 'processing', 'completed', 'cancelled', 'in-progress'],
      default: 'pending',
    },
    legalCompliance: {
      waiverSignature: String,
      waiverSignedAt: Date,
      waiverPdf: String,
      preServicePhotos: {
        type: [String],
        default: [],
      },
      damageNotes: String,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: Date,
    archivedReason: String,
    shippingAddress: String,
    vehicleYear: String,
    vehicleMake: String,
    vehicleModel: String,
    vehicleColor: String,
    vehiclePlate: String,
    bookingDate: String,
    bookingTime: String,
    notes: String,
    assignedDetailer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    serviceSteps: [
      {
        name: String,
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed'],
          default: 'pending',
        },
        completedAt: Date,
      },
    ],
    currentStepIndex: {
      type: Number,
      default: 0,
    },
    photos: {
      before: [String],
      after: [String],
    },
    rating: {
      score: { type: Number, min: 1, max: 5 },
      comment: String,
      ratedAt: Date,
    },
  },
  { timestamps: true }
);

// Encrypt before saving
orderSchema.pre('save', function (next) {
  if (this.isModified('vehiclePlate') && this.vehiclePlate) {
    this.vehiclePlate = encrypt(this.vehiclePlate);
  }
  if (this.isModified('shippingAddress') && this.shippingAddress) {
    this.shippingAddress = encrypt(this.shippingAddress);
  }
  if (this.isModified('notes') && this.notes) {
    this.notes = encrypt(this.notes);
  }
  next();
});

// Decrypt after loading
orderSchema.post('init', function (doc) {
  if (doc.vehiclePlate) doc.vehiclePlate = decrypt(doc.vehiclePlate);
  if (doc.shippingAddress) doc.shippingAddress = decrypt(doc.shippingAddress);
  if (doc.notes) doc.notes = decrypt(doc.notes);
});

export default mongoose.model('Order', orderSchema);
