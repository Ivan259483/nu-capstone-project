import mongoose from 'mongoose';

const managedAssetSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['cloudinary', 'firebase_storage'], required: true, index: true },
    // Non-secret provider account identity (Cloudinary cloud name or Firebase
    // storage bucket). Cleanup is refused unless it matches live configuration.
    accountIdentifier: { type: String, default: null, index: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'image' },
    secureUrl: { type: String, default: null },
    ownerCollection: { type: String, required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fieldPath: { type: String, required: true },
    checksum: { type: String, default: null },
    byteSize: { type: Number, default: null, min: 0 },
    status: { type: String, enum: ['active', 'pending_delete', 'deleted', 'unresolved'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

managedAssetSchema.index(
  { provider: 1, publicId: 1 },
  { unique: true, name: 'one_managed_asset_per_provider_identifier' },
);
managedAssetSchema.index({ provider: 1, accountIdentifier: 1, publicId: 1 });
managedAssetSchema.index({ ownerCollection: 1, ownerId: 1, status: 1 });

export default mongoose.model('ManagedAsset', managedAssetSchema);
