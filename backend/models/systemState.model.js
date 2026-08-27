import mongoose from 'mongoose';

export const SYSTEM_STATE_KEY = 'primary';
export const SYSTEM_MODES = Object.freeze(['development', 'demo', 'production', 'archived']);
export const DECOMMISSIONING_PHASES = Object.freeze(['none', 'draining', 'ready_to_archive']);

const mutationLeaseSchema = new mongoose.Schema(
  {
    operationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemOperation', default: null },
    fencingToken: { type: String, default: null, maxlength: 80 },
    owner: { type: String, default: null, maxlength: 160 },
    acquiredAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  { _id: false },
);

const inventoryBaselineProductSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    openingQuantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const inventoryBaselineSchema = new mongoose.Schema(
  {
    turnoverOperationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemOperation',
      required: true,
    },
    productSetHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
    },
    productCount: { type: Number, required: true, min: 0 },
    products: { type: [inventoryBaselineProductSchema], default: [] },
    capturedAt: { type: Date, required: true },
    invalidatedAt: { type: Date, default: null },
    invalidationReason: {
      type: String,
      enum: ['active_product_catalog_changed', null],
      default: null,
    },
  },
  { _id: false },
);

const systemStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: [SYSTEM_STATE_KEY],
      default: SYSTEM_STATE_KEY,
      unique: true,
      immutable: true,
    },
    mode: {
      type: String,
      enum: SYSTEM_MODES,
      default: () => (process.env.NODE_ENV === 'production' ? 'demo' : 'development'),
      required: true,
    },
    previousMode: {
      type: String,
      enum: ['development', 'demo', 'production', null],
      default: null,
    },
    modeStartedAt: { type: Date, default: Date.now, required: true },
    decommissioningPhase: {
      type: String,
      enum: DECOMMISSIONING_PHASES,
      default: 'none',
      required: true,
    },
    registrationEnabled: { type: Boolean, default: true, required: true },
    bookingsEnabled: { type: Boolean, default: true, required: true },
    revision: { type: Number, default: 0, min: 0, required: true },
    operationalDataEpoch: { type: Number, default: 0, min: 0, required: true },
    globalSessionEpoch: { type: Number, default: 0, min: 0, required: true },
    protectedAdministratorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    turnoverCompletedAt: { type: Date, default: null },
    inventoryBaselineVerifiedAt: { type: Date, default: null },
    inventoryBaseline: { type: inventoryBaselineSchema, default: null },
    productionEnteredAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    mutationLease: { type: mutationLeaseSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export default mongoose.model('SystemState', systemStateSchema);
