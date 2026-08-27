import mongoose from 'mongoose';
import ManagedAsset from '../models/managedAsset.model.js';
import { SystemManagementError } from './systemState.service.js';

const cloudinaryAccountFromUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return null;
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
  } catch {
    return null;
  }
};

export async function registerCloudinaryManagedAsset({
  publicId,
  secureUrl,
  resourceType = 'image',
  ownerCollection,
  ownerId,
  fieldPath,
  checksum = null,
  byteSize = null,
  session = null,
} = {}) {
  const configuredCloud = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const normalizedPublicId = String(publicId || '').trim();
  const normalizedOwnerCollection = String(ownerCollection || '').trim();
  const normalizedFieldPath = String(fieldPath || '').trim();
  if (
    !configuredCloud
    || cloudinaryAccountFromUrl(secureUrl) !== configuredCloud
    || !normalizedPublicId
    || !normalizedOwnerCollection
    || !normalizedFieldPath
    || !mongoose.isValidObjectId(ownerId)
  ) {
    throw new SystemManagementError(
      'Cloudinary upload metadata could not be bound to a managed application record.',
      'MANAGED_ASSET_BINDING_INVALID',
      409,
    );
  }

  const update = {
    $set: {
      accountIdentifier: configuredCloud,
      secureUrl: String(secureUrl),
      resourceType: ['image', 'video', 'raw'].includes(resourceType) ? resourceType : 'image',
      ownerCollection: normalizedOwnerCollection,
      ownerId,
      fieldPath: normalizedFieldPath,
      checksum: checksum || null,
      byteSize: Number.isFinite(Number(byteSize)) && Number(byteSize) >= 0 ? Number(byteSize) : null,
      status: 'active',
      deletedAt: null,
    },
    $setOnInsert: {
      provider: 'cloudinary',
      publicId: normalizedPublicId,
    },
  };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true };
  if (session) options.session = session;
  return ManagedAsset.findOneAndUpdate(
    { provider: 'cloudinary', publicId: normalizedPublicId },
    update,
    options,
  );
}

export default { registerCloudinaryManagedAsset };
