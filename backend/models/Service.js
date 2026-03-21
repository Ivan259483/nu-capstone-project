import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: String,
    duration: String,
    basePrice: {
      type: Number,
      required: true,
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
  },
  { timestamps: true }
);

export default mongoose.model('Service', serviceSchema);
