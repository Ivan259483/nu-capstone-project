import mongoose from 'mongoose';

/**
 * Immutable snapshot at checkout for print/PDF/audit.
 */
const invoiceRecordSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    billingVersion: { type: Number, default: 1 },
    /** Full payload: lineItems, charges, computed, customer, vehicle, company block */
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    pdfUrl: { type: String, default: null },
    signatures: {
      clientName: { type: String, default: '' },
      clientSignedAt: { type: Date, default: null },
      salesName: { type: String, default: '' },
      salesSignedAt: { type: Date, default: null },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

invoiceRecordSchema.index({ order: 1, createdAt: -1 });

export default mongoose.model('InvoiceRecord', invoiceRecordSchema);
