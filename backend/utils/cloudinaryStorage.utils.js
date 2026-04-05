import axios from 'axios';
import FormData from 'form-data';
import { createHash } from 'crypto';

const getCloudinaryConfig = () => ({
  cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
  apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  uploadPreset: (process.env.CLOUDINARY_UPLOAD_PRESET || '').trim(),
  uploadFolder: (process.env.CLOUDINARY_UPLOAD_FOLDER || 'vehicle-scans').trim(),
});

const hasSignedCredentials = (config) =>
  Boolean(config.cloudName && config.apiKey && config.apiSecret);

const hasUnsignedPreset = (config) =>
  Boolean(config.cloudName && config.uploadPreset);

export const isCloudinaryConfigured = () => {
  const config = getCloudinaryConfig();
  return hasSignedCredentials(config) || hasUnsignedPreset(config);
};

export const getCloudinaryMissingConfigMessage = () => {
  const config = getCloudinaryConfig();

  if (!config.cloudName) {
    return 'CLOUDINARY_CLOUD_NAME is missing.';
  }

  if (hasSignedCredentials(config) || hasUnsignedPreset(config)) {
    return '';
  }

  return 'Provide either CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET, or CLOUDINARY_UPLOAD_PRESET.';
};

const buildCloudinarySignature = (params) => {
  const config = getCloudinaryConfig();
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return createHash('sha1')
    .update(`${serialized}${config.apiSecret}`)
    .digest('hex');
};

const createUploadEndpoint = () =>
  `https://api.cloudinary.com/v1_1/${getCloudinaryConfig().cloudName}/image/upload`;

const randomId = (length = 8) =>
  Math.random()
    .toString(36)
    .slice(2, 2 + length);

export const uploadVehicleScanImages = async (files, options = {}) => {
  if (!isCloudinaryConfigured()) {
    const error = new Error(
      `Cloudinary is not configured. ${getCloudinaryMissingConfigMessage()}`
    );
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }

  const config = getCloudinaryConfig();
  const folder = String(options.folder || config.uploadFolder || 'vehicle-scans').trim();
  const endpoint = createUploadEndpoint();
  const uploadedUrls = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId = `vehicle_scan_${timestamp}_${index + 1}_${randomId(6)}`;
    const formData = new FormData();

    formData.append('file', file.buffer, {
      filename: file.originalname || `vehicle_${index + 1}.jpg`,
      contentType: file.mimetype || 'image/jpeg',
    });
    formData.append('folder', folder);

    if (hasSignedCredentials(config)) {
      const signature = buildCloudinarySignature({
        folder,
        public_id: publicId,
        timestamp,
      });

      formData.append('api_key', config.apiKey);
      formData.append('timestamp', timestamp);
      formData.append('public_id', publicId);
      formData.append('signature', signature);
    } else {
      formData.append('upload_preset', config.uploadPreset);
    }

    const response = await axios.post(endpoint, formData, {
      headers: formData.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const secureUrl = response.data?.secure_url;
    if (!secureUrl || typeof secureUrl !== 'string') {
      const error = new Error('Cloudinary upload succeeded but no secure_url was returned.');
      error.code = 'CLOUDINARY_UPLOAD_INVALID_RESPONSE';
      throw error;
    }

    uploadedUrls.push(secureUrl);
  }

  return uploadedUrls;
};

/**
 * Upload a raw Buffer (e.g. mask PNG) to Cloudinary and return the secure_url.
 */
export const uploadBufferToCloudinary = async (buffer, options = {}) => {
  if (!isCloudinaryConfigured()) {
    const error = new Error(
      `Cloudinary is not configured. ${getCloudinaryMissingConfigMessage()}`
    );
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }

  const config = getCloudinaryConfig();
  const folder = String(options.folder || config.uploadFolder || 'vehicle-scans').trim();
  const endpoint = createUploadEndpoint();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = options.publicId || `mask_${timestamp}_${randomId(6)}`;
  const formData = new FormData();

  formData.append('file', buffer, {
    filename: options.filename || 'mask.png',
    contentType: options.contentType || 'image/png',
  });
  formData.append('folder', folder);

  if (hasSignedCredentials(config)) {
    const signature = buildCloudinarySignature({
      folder,
      public_id: publicId,
      timestamp,
    });
    formData.append('api_key', config.apiKey);
    formData.append('timestamp', timestamp);
    formData.append('public_id', publicId);
    formData.append('signature', signature);
  } else {
    formData.append('upload_preset', config.uploadPreset);
  }

  const response = await axios.post(endpoint, formData, {
    headers: formData.getHeaders(),
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const secureUrl = response.data?.secure_url;
  if (!secureUrl || typeof secureUrl !== 'string') {
    const error = new Error('Cloudinary upload succeeded but no secure_url was returned.');
    error.code = 'CLOUDINARY_UPLOAD_INVALID_RESPONSE';
    throw error;
  }

  return secureUrl;
};
