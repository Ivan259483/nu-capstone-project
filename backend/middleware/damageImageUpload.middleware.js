import multer from 'multer';

const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

const damageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_IMAGE_COUNT,
    fileSize: MAX_IMAGE_BYTES,
    fields: 8,
    fieldSize: 16 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_TYPES.has(String(file?.mimetype || '').toLowerCase())) {
      const error = new Error('Only JPEG, PNG, WebP, HEIC, HEIF, or AVIF vehicle images are supported.');
      error.code = 'UNSUPPORTED_IMAGE_TYPE';
      callback(error);
      return;
    }
    callback(null, true);
  },
});

const uploadImages = damageImageUpload.array('images', MAX_IMAGE_COUNT);

/** Multipart upload boundary for the mobile DETECT stage. */
export const handleDamageImageUpload = (req, res, next) => {
  uploadImages(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Each vehicle image must be 10 MB or smaller.'
        : error.code === 'LIMIT_FILE_COUNT'
          ? `Upload no more than ${MAX_IMAGE_COUNT} vehicle images.`
          : 'The vehicle image upload is invalid.';
      return res.status(400).json({ success: false, code: error.code, message });
    }

    return res.status(415).json({
      success: false,
      code: error.code || 'INVALID_IMAGE_UPLOAD',
      message: error.message || 'The vehicle image upload is invalid.',
    });
  });
};

export default handleDamageImageUpload;
