import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Exterior', 'Interior', 'Complete', 'Engine', 'Premium'],
      default: 'Exterior',
    },
    duration: String,
    basePrice: {
      type: Number,
      required: true,
    },
    memberPrice: {
      type: Number,
      default: null, // null = auto-compute (basePrice * 0.85)
    },
    recipe: {
      type: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
          },
          productName: String,
          quantity: {
            type: Number,
            required: true,
          },
          unit: String,
        }
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    bookingCount: {
      type: Number,
      default: 0,
    },
    lastUpdatedBy: {
      type: String,
      default: null,
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Service', serviceSchema);
