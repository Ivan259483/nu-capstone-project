import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    contactPerson: String,
    email: {
      type: String,
      unique: true,
      sparse: true,
    },
    phone: String,
    products: [String],
    lastOrder: Date,
    totalSpent: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
