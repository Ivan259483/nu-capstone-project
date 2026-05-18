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
 * Download a GLB from a (potentially expiring) URL and re-upload it to Cloudinary
 * as a permanent `raw` resource. Returns a stable, non-expiring secure_url.
 *
 * This is the critical fix for Meshy's signed CDN URLs (assets.meshy.ai?X-Amz-Expires=3600)
 * which expire before model-viewer can load them, causing "Loading 3D model 0%".
 */
export const uploadGlbFromUrl = async (sourceGlbUrl, options = {}) => {
  if (!isCloudinaryConfigured()) {
    const error = new Error(
      `Cloudinary is not configured. ${getCloudinaryMissingConfigMessage()}`
    );
    error.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw error;
  }

  const config = getCloudinaryConfig();
  const folder = String(options.folder || config.uploadFolder || 'vehicle-models').trim();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = options.publicId || `glb_${timestamp}_${randomId(8)}`;

  // Cloudinary raw upload endpoint (for non-image binary files like .glb)
  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`;

  console.log(`[Cloudinary GLB] Downloading GLB from: ${sourceGlbUrl.slice(0, 80)}…`);
  const glbResponse = await axios.get(sourceGlbUrl, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    headers: {
      'User-Agent': 'AutoSPF-Backend/1.0',
      Accept: 'model/gltf-binary,application/octet-stream,*/*',
    },
  });

  const glbBuffer = Buffer.from(glbResponse.data);
  console.log(`[Cloudinary GLB] Downloaded ${(glbBuffer.length / 1024 / 1024).toFixed(2)} MB. Uploading to Cloudinary…`);

  const formData = new FormData();
  formData.append('file', glbBuffer, {
    filename: options.filename || `model_${publicId}.glb`,
    contentType: 'model/gltf-binary',
  });
  formData.append('folder', folder);
  // NOTE: resource_type is part of the URL path (/raw/upload), NOT a form field.
  // Including it in the body would cause a Cloudinary signature mismatch.

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
  } else if (hasUnsignedPreset(config)) {
    formData.append('upload_preset', config.uploadPreset);
  } else {
    const error = new Error('Cloudinary: neither signed credentials nor upload preset available.');
    error.code = 'CLOUDINARY_NO_AUTH';
    throw error;
  }

  const uploadResponse = await axios.post(endpoint, formData, {
    headers: formData.getHeaders(),
    timeout: 180_000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const secureUrl = uploadResponse.data?.secure_url;
  if (!secureUrl || typeof secureUrl !== 'string') {
    const error = new Error('Cloudinary GLB upload succeeded but no secure_url was returned.');
    error.code = 'CLOUDINARY_UPLOAD_INVALID_RESPONSE';
    throw error;
  }

  const meta = uploadResponse.data || {};
  const rt = meta.resource_type;
  const bytes = meta.bytes;
  const pid = meta.public_id;
  console.log(
    `[Cloudinary GLB] upload metadata: resource_type=${rt ?? '(missing)'} bytes=${bytes ?? '?'} public_id=${pid ?? '?'}`
  );
  if (rt !== 'raw') {
    console.warn(
      `[Cloudinary GLB] ⚠️  Expected resource_type "raw" but got "${rt}". GLB may be stored as image — check upload preset (must allow raw) and /raw/upload endpoint.`
    );
  }

  console.log(`[Cloudinary GLB] ✅ Permanent URL: ${secureUrl}`);
  return secureUrl;
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
