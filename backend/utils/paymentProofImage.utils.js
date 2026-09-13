import sharp from 'sharp';
import { uploadBufferToCloudinary, isCloudinaryConfigured } from './cloudinaryStorage.utils.js';

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/**
 * Process a base64 GCash payment-proof data URL into a tiered {thumbnail, compressed,
 * original} Cloudinary asset set, mirroring the profile-photo sharp pipeline used in
 * user.controller.js. Never throws: any failure falls back to `null` so callers keep
 * using the raw validated value they already had (today's behavior, unchanged).
 *
 * @param {string} dataUrlString - a `data:image/...;base64,...` string.
 * @param {{ publicIdPrefix?: string }} [options]
 * @returns {Promise<{
 *   thumbnailUrl: string,
 *   compressedUrl: string,
 *   originalUrl: string,
 *   fileSize: number,
 *   mimeType: string,
 *   processedAt: Date,
 * } | null>}
 */
export const processPaymentProofImage = async (dataUrlString, options = {}) => {
  try {
    if (typeof dataUrlString !== 'string') return null;

    const match = dataUrlString.match(DATA_URL_PATTERN);
    if (!match) return null;

    const mimeType = match[1];
    const base64Payload = match[2];
    const buffer = Buffer.from(base64Payload, 'base64');

    if (!isCloudinaryConfigured()) return null;

    const thumbnailBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const compressedBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const publicIdPrefix = options.publicIdPrefix || `proof_${Date.now()}`;

    const [thumbnailUpload, compressedUpload, originalUpload] = await Promise.all([
      uploadBufferToCloudinary(thumbnailBuffer, {
        folder: 'payment-proofs',
        publicId: `${publicIdPrefix}_thumb`,
        contentType: 'image/jpeg',
        filename: `${publicIdPrefix}_thumb.jpg`,
      }),
      uploadBufferToCloudinary(compressedBuffer, {
        folder: 'payment-proofs',
        publicId: `${publicIdPrefix}_compressed`,
        contentType: 'image/jpeg',
        filename: `${publicIdPrefix}_compressed.jpg`,
      }),
      uploadBufferToCloudinary(buffer, {
        folder: 'payment-proofs',
        publicId: `${publicIdPrefix}_original`,
        contentType: mimeType,
        filename: `${publicIdPrefix}_original`,
      }),
    ]);

    return {
      thumbnailUrl: thumbnailUpload,
      compressedUrl: compressedUpload,
      originalUrl: originalUpload,
      fileSize: buffer.length,
      mimeType,
      processedAt: new Date(),
    };
  } catch (error) {
    console.warn('[paymentProofImage] processing failed, falling back to inline storage:', error.message);
    return null;
  }
};

export default processPaymentProofImage;
