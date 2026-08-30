import mongoose from 'mongoose';

// Use Mongoose's bundled MongoDB driver. The repository also has a direct
// `mongodb` dependency at a different major version; mixing their BSON ObjectId
// implementations with mongoose.connection.db raises BSONVersionError.
const { GridFSBucket, ObjectId } = mongoose.mongo;

export const PROFILE_PHOTO_BUCKET_NAME = 'profilePhotos';

const getDatabase = () => {
  const database = mongoose.connection.db;
  if (!database) {
    const error = new Error('MongoDB is not connected for profile photo storage.');
    error.code = 'PROFILE_PHOTO_STORAGE_UNAVAILABLE';
    throw error;
  }
  return database;
};

const getBucket = () => new GridFSBucket(getDatabase(), {
  bucketName: PROFILE_PHOTO_BUCKET_NAME,
});

export const toProfilePhotoObjectId = (value) => {
  if (value instanceof ObjectId) return value;
  if (!ObjectId.isValid(String(value || ''))) return null;
  return new ObjectId(String(value));
};

export const uploadProfilePhotoBuffer = ({ buffer, filename, contentType, ownerId }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
    const error = new Error('Profile photo bytes are empty.');
    error.code = 'PROFILE_PHOTO_STORAGE_FAILED';
    throw error;
  }

  const ownerObjectId = toProfilePhotoObjectId(ownerId);
  if (!ownerObjectId) {
    const error = new Error('Profile photo owner is invalid.');
    error.code = 'PROFILE_PHOTO_STORAGE_FAILED';
    throw error;
  }

  return new Promise((resolve, reject) => {
    const uploadStream = getBucket().openUploadStream(filename || 'profile.jpg', {
      metadata: {
        kind: 'customer_profile_photo',
        ownerId: ownerObjectId,
        contentType: contentType || 'image/jpeg',
      },
    });

    uploadStream.once('error', (error) => {
      error.code ||= 'PROFILE_PHOTO_STORAGE_FAILED';
      reject(error);
    });
    uploadStream.once('finish', () => {
      resolve({
        fileId: uploadStream.id,
        filename: filename || 'profile.jpg',
        contentType: contentType || 'image/jpeg',
        length: buffer.length,
      });
    });
    uploadStream.end(buffer);
  });
};

export const findProfilePhotoFile = async (fileId) => {
  const objectId = toProfilePhotoObjectId(fileId);
  if (!objectId) return null;
  return getDatabase().collection(`${PROFILE_PHOTO_BUCKET_NAME}.files`).findOne({
    _id: objectId,
    'metadata.kind': 'customer_profile_photo',
  });
};

export const openProfilePhotoDownloadStream = (fileId) => {
  const objectId = toProfilePhotoObjectId(fileId);
  if (!objectId) {
    const error = new Error('Profile photo does not exist.');
    error.code = 'PROFILE_PHOTO_NOT_FOUND';
    throw error;
  }
  return getBucket().openDownloadStream(objectId);
};

export const deleteProfilePhotoFile = async (fileId) => {
  const objectId = toProfilePhotoObjectId(fileId);
  if (!objectId) return false;
  try {
    await getBucket().delete(objectId);
    return true;
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound' || /file not found/i.test(String(error?.message || ''))) {
      return false;
    }
    throw error;
  }
};
