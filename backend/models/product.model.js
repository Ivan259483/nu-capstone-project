import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    inventory: {
      type: Number,
      default: 0,
    },
    reserved: {
      type: Number,
      default: 0,
      description: 'Units currently held for confirmed bookings (available = inventory - reserved)',
    },
    minLevel: {
      type: Number,
      default: 5,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
    },
    images: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ── Performance Index ─────────────────────────────────────────────────
productSchema.index({ isActive: 1, category: 1 });

export default mongoose.model('Product', productSchema);
