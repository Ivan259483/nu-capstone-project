import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.utils.js';

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
    customerPhone: String,
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
    downPaymentAmount: { type: Number, default: 0 },
    finalPaymentAmount: { type: Number, default: 0 },
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
      // ⚠️ Bug #4 fix: Removed all capitalized/duplicate enum values.
      // Only lowercase values are accepted. The normalizeCustomerStatus() helper
      // in order.controller.js enforces this on all writes.
      enum: ['received', 'washing', 'detailing', 'queued', 'in-progress', 'finishing', 'ready', 'completed'],
      default: 'received',
    },
    customerStatusUpdatedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'assigned', 'received', 'in_progress', 'completed', 'paid', 'released', 'cancelled'],
      default: 'pending',
    },
    legalCompliance: {
      waiverSignature: String,
      waiverSignedAt: Date,
      waiverPdf: String,
      qcPdf: String,
      preServicePhotos: {
        type: [String],
        default: [],
      },
      damageNotes: String,
      releaseSignature: String,
      releaseSignedAt: Date,
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
    bookingReference: {
      type: String,
      unique: true,
      sparse: true,
    },
    downpaymentProof: String,
    inventoryReservation: {
      items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: String,
        quantity: Number,
        reservedAt: Date,
      }],
      status: { type: String, enum: [null, 'reserved', 'committed', 'released'], default: null },
      reservedAt: Date,
      committedAt: Date,
    },
    bookingDate: String,
    bookingTime: String,
    notes: String,
    staffNotes: [
      {
        content: String,
        detailerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        detailerName: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
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
    operationsChecklist: {
      ingress: [
        {
          name: String,
          isMustExplain: { type: Boolean, default: false },
          isRequired: { type: Boolean, default: true },
          completed: { type: Boolean, default: false },
          completedAt: Date
        }
      ],
      egress: [
        {
          name: String,
          isMustExplain: { type: Boolean, default: false },
          isRequired: { type: Boolean, default: true },
          completed: { type: Boolean, default: false },
          completedAt: Date
        }
      ]
    },
    warrantyAndReceipt: {
      certificateNumber: String,
      warrantyType: String,
      warrantyPeriod: String,
      customerSignature: String,
      warrantyPdf: String,
      amountPaid: Number,
      paymentMethod: { type: String, enum: ['cash', 'others'] },
      paymentExtent: { type: String, enum: ['partial', 'full'] },
      checkerName: String,
      installationDate: Date,
      existingFwsAndShade: String,
      reasonForChanging: String,
      signedAt: Date
    },
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

    // ═══════ WORKFLOW PIPELINE ═══════
    // ⚠️ Workflow unification fix: Removed legacy workflowStep / workflowCompletedSteps
    // fields that were only used by the web dashboard. The `workflow` sub-document
    // is now the single canonical source of truth for both web and mobile clients.
    // Any code referencing order.workflowStep should be updated to order.workflow.currentStep.
    workflow: {
      currentStep: { type: Number, default: 1 },
      completedSteps: { type: [Number], default: [] },
      status: { type: String, default: 'pending' },
    },

    // Step 1 — Job Order
    jobOrder: {
      contactNumber: String,
      ingressDateTime: Date,
      targetReleaseDate: Date,
      estimatedDays: Number,
      serviceCategory: String,
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // Step 2 — Ingress Checklist
    ingressChecklist: {
      items: [{
        category: String,
        name: String,
        checked: { type: Boolean, default: false },
        note: String,
      }],
      beforeServiceNotes: String,
      preExistingConditions: String,
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // Step 3 — Damage Annotations
    damageAnnotations: [{
      x: Number,
      y: Number,
      view: { type: String, enum: ['top', 'left', 'right'], default: 'top' },
      panel: String,
      type: { type: String, enum: ['scratch', 'dent', 'chip', 'repaint', 'cracked_light', 'swirl_mark', 'curb_rash', 'swirl', 'crack', 'stain'] },
      severity: String,
      note: String,
      images: [String],
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt: { type: Date, default: Date.now },
    }],
    damagePhotos: { type: [String], default: [] },
    damageCompletedAt: Date,

    // Step 4 — Customer Waiver
    customerWaiver: {
      termsAccepted: [{ label: String, accepted: { type: Boolean, default: false } }],
      customerFullName: String,
      digitalSignature: String,
      dateSigned: Date,
      completedAt: Date,
    },

    // Step 5 — Service Proper
    serviceProper: {
      checklist: [{
        name: String,
        status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
        completedAt: Date,
      }],
      materialsUsed: [{
        productId: String,
        productName: String,
        quantity: Number,
        unit: String,
      }],
      technicianNotes: String,
      progressPercentage: { type: Number, default: 0 },
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // Step 6 — QC Checklist
    qcChecklist: [{
      item: String,
      passed: { type: Boolean, default: false },
      note: String,
      checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      checkedAt: Date,
    }],
    qcCompletedAt: Date,

    // Step 7 — Egress / Release
    egressData: {
      aftercareChecklist: [{
        item: String,
        checked: { type: Boolean, default: false },
      }],
      paymentConfirmed: { type: Boolean, default: false },
      customerSignature: String,
      detailerName: String,
      releaseTimestamp: Date,
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true }
);

// Virtual alias: plateNumber ↔ vehiclePlate (read/write convenience accessor)
orderSchema.virtual('plateNumber')
  .get(function () {
    return this.vehiclePlate;
  })
  .set(function (value) {
    this.vehiclePlate = value;
  });

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
  if (this.isModified('legalCompliance.waiverSignature') && this.legalCompliance?.waiverSignature) {
    this.legalCompliance.waiverSignature = encrypt(this.legalCompliance.waiverSignature);
  }
  if (this.isModified('legalCompliance.damageNotes') && this.legalCompliance?.damageNotes) {
    this.legalCompliance.damageNotes = encrypt(this.legalCompliance.damageNotes);
  }
  if (this.isModified('warrantyAndReceipt.customerSignature') && this.warrantyAndReceipt?.customerSignature) {
    this.warrantyAndReceipt.customerSignature = encrypt(this.warrantyAndReceipt.customerSignature);
  }
  next();
});

// Decrypt after loading
orderSchema.post('init', function (doc) {
  if (doc.vehiclePlate) doc.vehiclePlate = decrypt(doc.vehiclePlate);
  if (doc.shippingAddress) doc.shippingAddress = decrypt(doc.shippingAddress);
  if (doc.notes) doc.notes = decrypt(doc.notes);
  if (doc.legalCompliance?.waiverSignature) {
    doc.legalCompliance.waiverSignature = decrypt(doc.legalCompliance.waiverSignature);
  }
  if (doc.legalCompliance?.damageNotes) {
    doc.legalCompliance.damageNotes = decrypt(doc.legalCompliance.damageNotes);
  }
  if (doc.warrantyAndReceipt?.customerSignature) {
    doc.warrantyAndReceipt.customerSignature = decrypt(doc.warrantyAndReceipt.customerSignature);
  }
});

// ── Performance Indexes ──────────────────────────────────────────────
// These compound indexes cover the most common query patterns and
// eliminate full collection scans on the orders collection.
orderSchema.index({ customer: 1, archived: 1, createdAt: -1 });       // Customer bookings (getAllOrders for customers)
orderSchema.index({ assignedDetailer: 1, status: 1 });                // Detailer queue & active jobs
orderSchema.index({ status: 1, archived: 1 });                        // Admin status filtering
orderSchema.index({ bookingDate: 1, bookingTime: 1, status: 1 });     // Available slots lookup
orderSchema.index({ archived: 1, createdAt: -1 });                    // Archived orders listing
orderSchema.index({ bookingReference: 1 }, { unique: true, sparse: true }); // Booking ref lookup

export default mongoose.model('Order', orderSchema);
