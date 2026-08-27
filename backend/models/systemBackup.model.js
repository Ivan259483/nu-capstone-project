import mongoose from 'mongoose';

export const SYSTEM_BACKUP_PURPOSES = Object.freeze(['general', 'lifecycle']);

const systemBackupSchema = new mongoose.Schema(
  {
    formatVersion: { type: Number, default: 1, required: true, immutable: true },
    // `lifecycle` is a deliberately stronger class of restore artifact. Legacy
    // and general-purpose backups never become eligible for destructive
    // cleanup/lifecycle gates merely because their checksum was acknowledged.
    purpose: {
      type: String,
      enum: SYSTEM_BACKUP_PURPOSES,
      default: 'general',
      required: true,
      immutable: true,
      index: true,
    },
    includeAssetsRequested: { type: Boolean, default: false, immutable: true },
    lifecycleEligible: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ['creating', 'ready', 'verified', 'failed'],
      default: 'creating',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dataFingerprint: { type: String, required: true, index: true },
    checksum: { type: String, default: null, index: true },
    artifactSize: { type: Number, default: 0, min: 0 },
    downloadVerifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assetCoverage: {
      requested: { type: Boolean, default: false },
      managed: { type: Number, default: 0, min: 0 },
      included: { type: Number, default: 0, min: 0 },
      managedUnresolved: { type: Number, default: 0, min: 0 },
      legacyUnresolved: { type: Number, default: 0, min: 0 },
      unresolved: { type: Number, default: 0, min: 0 },
      complete: { type: Boolean, default: false },
      snapshotManifestHash: { type: String, default: null },
    },
    snapshotCatalogHash: { type: String, default: null },
    snapshotCompletedAt: { type: Date, default: null },
    collectionCount: { type: Number, default: 0, min: 0 },
    documentCount: { type: Number, default: 0, min: 0 },
    failureCode: { type: String, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

systemBackupSchema.index({ createdAt: -1 });

systemBackupSchema.pre('validate', function validateLifecycleCoverage(next) {
  if (!this.lifecycleEligible) return next();
  const coverage = this.assetCoverage || {};
  const managed = Number(coverage.managed);
  const included = Number(coverage.included);
  const managedUnresolved = Number(coverage.managedUnresolved);
  const valid = this.purpose === 'lifecycle'
    && coverage.complete === true
    && Number.isInteger(managed)
    && managed >= 0
    && included === managed
    && managedUnresolved === 0
    && (managed === 0 || coverage.requested === true)
    && /^[a-f0-9]{64}$/.test(String(coverage.snapshotManifestHash || ''));
  if (valid) return next();
  this.invalidate(
    'lifecycleEligible',
    'Lifecycle eligibility requires complete, internally consistent managed-asset coverage.',
  );
  return next();
});

export default mongoose.model('SystemBackup', systemBackupSchema);
