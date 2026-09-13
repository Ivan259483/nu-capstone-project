/**
 * Upload ledger for live-tracker gate evidence (one document per upload attempt).
 *
 * `order.trackerStageMedia` stays the customer/QC-facing projection (one URL per stage + slot).
 * This collection records how each photo got there: signed Cloudinary attempt, upload status,
 * who uploaded it, and why an attempt failed — so the QC panel can recover per-photo state after
 * a remount and a single failed photo can be retried without restarting the batch.
 */
import mongoose from 'mongoose';

export const STAGE_EVIDENCE_STATUSES = Object.freeze(['PENDING', 'UPLOADING', 'SUCCESS', 'FAILED', 'RETRY']);

/** Mirrors `trackerStageMedia.stage` / `trackerStageMedia.slot` enums on the Order model. */
export const STAGE_EVIDENCE_STAGES = Object.freeze(['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup']);
export const STAGE_EVIDENCE_SLOTS = Object.freeze(['front', 'rear', 'left', 'right', 'close_up', 'preassessment_form', 'qc_form']);

const stageEvidencePhotoSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    stage: { type: String, enum: STAGE_EVIDENCE_STAGES, required: true },
    slot: { type: String, enum: STAGE_EVIDENCE_SLOTS, required: true },
    status: { type: String, enum: STAGE_EVIDENCE_STATUSES, default: 'PENDING', required: true },
    attemptId: { type: String, required: true },
    attempts: { type: Number, default: 1 },
    cloudinaryPublicId: { type: String, default: undefined },
    cloudinaryVersion: { type: String, default: '' },
    cloudinaryUrl: { type: String, default: '' },
    bytes: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    format: { type: String, default: '' },
    originalBytes: { type: Number, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
    storage: { type: String, enum: ['direct', 'proxy', 'migration'], default: 'direct' },
    lastError: {
      code: { type: String, default: '' },
      message: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'stage_evidence_photos' }
);

stageEvidencePhotoSchema.index({ orderId: 1, stage: 1, slot: 1, createdAt: -1 });
stageEvidencePhotoSchema.index({ status: 1, updatedAt: 1 });
stageEvidencePhotoSchema.index({ attemptId: 1 }, { unique: true });
stageEvidencePhotoSchema.index(
  { cloudinaryPublicId: 1 },
  { unique: true, partialFilterExpression: { cloudinaryPublicId: { $type: 'string' } } }
);

export default mongoose.models.StageEvidencePhoto
  || mongoose.model('StageEvidencePhoto', stageEvidencePhotoSchema);
