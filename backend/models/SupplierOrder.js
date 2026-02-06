import mongoose from 'mongoose';

const supplierOrderSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    amount: {
      type: Number,
      default: 0,
    },
    items: [String], // List of products ordered
  },
  { timestamps: true }
);

export default mongoose.model('SupplierOrder', supplierOrderSchema);
