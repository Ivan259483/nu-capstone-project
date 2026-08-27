import mongoose from 'mongoose';

export const SYSTEM_OPERATION_KINDS = Object.freeze([
  'cleanup',
  'demo_reset',
  'turnover',
  'backup',
  'export',
  'handover',
  'lifecycle',
  'external_cleanup_retry',
]);

export const SYSTEM_OPERATION_STATUSES = Object.freeze([
  'preview',
  'running',
  'completed',
  'completed_with_warnings',
  'failed',
  'stale',
  'expired',
]);

const actorSnapshotSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    role: { type: String, default: '' },
  },
  { _id: false },
);

const systemOperationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: SYSTEM_OPERATION_KINDS, required: true, index: true },
    action: { type: String, required: true, maxlength: 80, index: true },
    status: {
      type: String,
      enum: SYSTEM_OPERATION_STATUSES,
      default: 'preview',
      required: true,
      index: true,
    },
    actor: { type: actorSnapshotSchema, required: true },
    categories: { type: [String], default: [] },
    resolvedCategories: { type: [String], default: [] },
    selection: { type: mongoose.Schema.Types.Mixed, default: {} },
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    preserved: { type: mongoose.Schema.Types.Mixed, default: {} },
    dependencies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    blockers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    warnings: { type: [String], default: [] },
    plan: { type: mongoose.Schema.Types.Mixed, default: {} },
    planHash: { type: String, required: true, index: true },
    dataFingerprint: { type: String, default: null, index: true },
    stateRevision: { type: Number, default: 0 },
    requiresBackup: { type: Boolean, default: false },
    backupId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemBackup', default: null },
    previewExpiresAt: { type: Date, default: null, index: true },
    consumedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    idempotencyKey: { type: String, default: null, maxlength: 180 },
    receipt: { type: mongoose.Schema.Types.Mixed, default: null },
    externalCleanup: {
      total: { type: Number, default: 0, min: 0 },
      completed: { type: Number, default: 0, min: 0 },
      remaining: { type: Number, default: 0, min: 0 },
      failed: { type: Number, default: 0, min: 0 },
      reconciledAt: { type: Date, default: null },
    },
    requestMetadata: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
      requestId: { type: String, default: '' },
    },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
    },
  },
  { timestamps: true, minimize: false },
);

systemOperationSchema.index({ 'actor.id': 1, createdAt: -1 });
systemOperationSchema.index(
  { 'actor.id': 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    name: 'one_system_operation_per_actor_idempotency_key',
  },
);

const updateTouchesReceipt = (update = {}) => (
  Object.prototype.hasOwnProperty.call(update, 'receipt')
  || Object.prototype.hasOwnProperty.call(update.$set || {}, 'receipt')
  || Object.prototype.hasOwnProperty.call(update.$unset || {}, 'receipt')
);

async function preventReceiptRewrite(next) {
  try {
    const update = this.getUpdate() || {};
    const replacement = ['replaceOne', 'findOneAndReplace'].includes(this.op);
    if (!replacement && !updateTouchesReceipt(update)) return next();
    const options = this.getOptions?.() || {};
    const current = await this.model.collection.findOne(
      this.getFilter(),
      {
        projection: { receipt: 1 },
        ...(options.session ? { session: options.session } : {}),
      },
    );
    if (current?.receipt != null) {
      const error = new Error('System operation receipts are immutable once committed.');
      error.code = 'SYSTEM_OPERATION_RECEIPT_IMMUTABLE';
      error.statusCode = 409;
      return next(error);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

systemOperationSchema.pre('updateOne', preventReceiptRewrite);
systemOperationSchema.pre('findOneAndUpdate', preventReceiptRewrite);
systemOperationSchema.pre('replaceOne', preventReceiptRewrite);
systemOperationSchema.pre('findOneAndReplace', preventReceiptRewrite);
systemOperationSchema.pre('save', async function preventDocumentReceiptRewrite(next) {
  if (this.isNew || !this.isModified('receipt')) return next();
  try {
    const current = await this.constructor.collection.findOne(
      { _id: this._id },
      {
        projection: { receipt: 1 },
        ...(this.$session() ? { session: this.$session() } : {}),
      },
    );
    if (current?.receipt != null) {
      const error = new Error('System operation receipts are immutable once committed.');
      error.code = 'SYSTEM_OPERATION_RECEIPT_IMMUTABLE';
      error.statusCode = 409;
      return next(error);
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

export default mongoose.model('SystemOperation', systemOperationSchema);
