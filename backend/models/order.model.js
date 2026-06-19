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
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
    },
    customerName: String,
    customerPhone: String,
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    serviceType: String,
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        name: String,
        quantity: Number,
        price: Number,
      },
    ],
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxVatAmount: { type: Number, default: 0 },
    additionalFees: { type: Number, default: 0 },
    serviceTotal: { type: Number, default: 0 },
    amountCollected: { type: Number, default: 0 },
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
    posQueueStatus: {
      type: String,
      enum: [null, 'balance_pickup_queue'],
      default: null,
    },
    readyForPickupEvidenceComplete: {
      type: Boolean,
      default: false,
    },
    readyForPaymentAt: Date,
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
      enum: [
        'pending_confirmation', // Customer submitted + uploaded GCash proof — awaiting sales review
        'approved',             // Sales approved — booking enters service queue
        'rejected',             // Sales rejected the payment proof
        'pending',              // Legacy / walk-in (kept for backward compat)
        'confirmed',
        'assigned',
        'queued',
        'received',
        'in_progress',
        'ready_for_payment', // Pickup photos complete; balance due at POS
        'completed',
        'paid',
        'released',
        'cancelled',
      ],
      default: 'pending_confirmation',
    },
    paymentProofUrl: {
      type: String,          // GCash screenshot URL / file path
      default: null,
    },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
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

    // ═══════ LIVE SERVICE TRACKING (QC-controlled) ═══════
    // Fine-grained stage controlled by QC Checker via Live Tracker.
    // This drives the customer's 5-step live tracking display.
    serviceTrackingStage: {
      type: String,
      enum: [null, 'confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup', 'completed', 'released'],
      default: null,
    },
    serviceTrackingUpdatedAt: Date,
    serviceTrackingUpdatedBy: String,

    // Named staff assigned to the job (displayed on customer tracker)
    serviceStaffAssignments: [{
      slot: { type: String, enum: ['staff1', 'staff2', 'staff3', 'staff4'] },
      name: String,
      role: String,
      assignedAt: { type: Date, default: Date.now },
      assignedBy: String,
    }],

    /** Per live-tracker stage + angle slot: staff photo + optional note (customer-facing). */
    trackerStageMedia: [{
      stage: {
        type: String,
        enum: ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup'],
        required: true,
      },
      /** Gate stages: five angles; preassessment_form on received (QC); qc_form on quality_check (single checklist photo). */
      slot: {
        type: String,
        enum: ['front', 'rear', 'left', 'right', 'close_up', 'preassessment_form', 'qc_form'],
        required: false,
      },
      photoUrl: { type: String, default: '' },
      description: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: String,
    }],

    /** QC live tracker — editable vehicle / tint handoff (paper QC form mirror). */
    qcHandoffSheet: {
      clientName: { type: String, default: '', trim: true },
      serviceDate: { type: String, default: '', trim: true },
      makeModel: { type: String, default: '', trim: true },
      plateNo: { type: String, default: '', trim: true },
      tintShadeInstalled: { type: String, default: '', trim: true },
      installer: { type: String, default: '', trim: true },
      updatedAt: Date,
      updatedBy: String,
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
orderSchema.index({ customer: 1, createdAt: -1 });                    // Customer booking history
orderSchema.index({ assignedDetailer: 1, status: 1 });                // Detailer queue & active jobs
orderSchema.index({ status: 1 });                                     // QC/admin status filters
orderSchema.index({ createdAt: -1 });                                 // Recent-first queues
orderSchema.index({ paymentStatus: 1, createdAt: -1 });               // POS unpaid/paid queues
orderSchema.index({ posQueueStatus: 1, readyForPaymentAt: -1 });       // POS Balance / Pickup queue
orderSchema.index({ serviceId: 1 });                                  // Service-specific booking filters
orderSchema.index({ serviceId: 1, createdAt: -1 });                   // Service-specific booking history
orderSchema.index({ qcCompletedAt: -1 });                             // QC review/report lookups
orderSchema.index({ status: 1, createdAt: -1 });                      // QC jobs by status + recency
orderSchema.index({ qcCompletedAt: 1, assignedDetailer: 1 });          // QC status + assigned technician lookups
orderSchema.index({ serviceTrackingStage: 1, status: 1 });             // Live tracker gate + order status lookups
orderSchema.index({ archived: 1, status: 1, createdAt: -1 });          // Active QC jobs by archive flag + recency
orderSchema.index({ status: 1, archived: 1, createdAt: -1 });         // Admin status + recency (getAllOrders)
orderSchema.index({ bookingDate: 1, bookingTime: 1, status: 1 });     // Available slots lookup
// Slot service filters { status: $in, bookingDate: $in } — prefix { bookingDate: 1 } is used; kept explicit for Atlas/SRV planners
orderSchema.index({ bookingDate: 1, status: 1 });
orderSchema.index({ archived: 1, createdAt: -1 });                    // Archived orders listing
orderSchema.index({ archived: 1, createdAt: -1, _id: -1 });            // Active order list by recency + stable pagination
orderSchema.index({ archived: 1, updatedAt: -1, _id: -1 });            // Active order list by latest update + stable pagination
orderSchema.index({ bookingReference: 1 }, { unique: true, sparse: true }); // Booking ref lookup

export default mongoose.model('Order', orderSchema);
