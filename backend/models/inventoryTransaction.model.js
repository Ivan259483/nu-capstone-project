import mongoose from 'mongoose';

const inventoryTransactionSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    type: {
      type: String,
      enum: ['in', 'out', 'adjustment'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      description: 'The absolute quantity changed',
    },
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      description: 'ID of the related Order, SupplierOrder, or user who adjusted',
    },
    referenceModel: {
      type: String,
      enum: ['Order', 'SupplierOrder', 'User', 'System'],
      description: 'Which collection the referenceId points to',
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model('InventoryTransaction', inventoryTransactionSchema);
