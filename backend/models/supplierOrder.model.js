import mongoose from 'mongoose';
import { operationalClassificationPlugin } from '../plugins/operationalClassification.plugin.js';

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

supplierOrderSchema.plugin(operationalClassificationPlugin, {
  collectionName: 'supplier_orders',
  label: (order) => `${order.status || 'Supplier order'} ${order.orderDate || order.createdAt || ''}`,
});

export default mongoose.model('SupplierOrder', supplierOrderSchema);
