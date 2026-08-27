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

export const getCloudinaryUploadMode = () => {
  const config = getCloudinaryConfig();
  if (hasSignedCredentials(config)) return 'signed';
  if (hasUnsignedPreset(config)) return 'unsigned';
  return 'none';
};

/**
 * Secret-safe runtime diagnostics for startup checks and structured errors.
 * authFieldNames is derived from the same mode selection used by every upload.
 */
export const getCloudinaryRuntimeDiagnostics = () => {
  const rawApiKey = String(process.env.CLOUDINARY_API_KEY || '');
  const rawApiSecret = String(process.env.CLOUDINARY_API_SECRET || '');
  const rawUploadPreset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
  const config = getCloudinaryConfig();
  const uploadMode = getCloudinaryUploadMode();

  return {
    cloudName: config.cloudName || null,
    uploadMode,
    apiKeyPresent: Boolean(config.apiKey),
    apiSecretPresent: Boolean(config.apiSecret),
    uploadPresetPresent: Boolean(config.uploadPreset),
    uploadPresetLength: config.uploadPreset.length,
    uploadPresetTrimChanged: rawUploadPreset !== rawUploadPreset.trim(),
    apiKeyTrimChanged: rawApiKey !== rawApiKey.trim(),
    apiSecretTrimChanged: rawApiSecret !== rawApiSecret.trim(),
    authFieldNames: uploadMode === 'signed'
      ? ['api_key', 'timestamp', 'public_id', 'signature']
      : uploadMode === 'unsigned'
        ? ['upload_preset']
        : [],
  };
};

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

const redactCloudinarySecrets = (value) => {
  const config = getCloudinaryConfig();
  const secrets = [config.apiSecret, config.apiKey, config.uploadPreset]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  const redactedConfiguredValues = secrets.reduce(
    (message, secret) => message.split(secret).join('[redacted]'),
    String(value || '').slice(0, 500)
  );

  // Cloudinary can include a generated request signature in authentication
  // errors. It is not the API secret, but it is still credential-like data and
  // should not be retained in logs or scan documents.
  return redactedConfiguredValues
    .replace(/(invalid signature)\s+[a-f0-9]+/gi, '$1 [redacted]')
    .replace(/([?&]signature=)[^&\s"']+/gi, '$1[redacted]');
};

const inferFailedField = (error, message) => {
  const explicitField = error?.response?.data?.error?.field
    || error?.response?.data?.field;
  if (explicitField) return String(explicitField).slice(0, 80);

  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('upload preset')) return 'upload_preset';
  if (normalized.includes('signature')) return 'signature';
  if (normalized.includes('api key')) return 'api_key';
  if (normalized.includes('timestamp')) return 'timestamp';
  if (normalized.includes('public id')) return 'public_id';
  if (normalized.includes('folder')) return 'folder';
  if (normalized.includes('file')) return 'file';
  if (normalized.includes('cloud name')) return 'cloud_name';
  return 'unknown';
};

/** Return only operational Cloudinary error metadata that is safe to log/store. */
export const getCloudinarySafeErrorDetails = (error) => {
  const upstreamMessage = error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.response?.headers?.['x-cld-error']
    || error?.message
    || 'Cloudinary upload failed.';
  const message = redactCloudinarySecrets(upstreamMessage);
  const httpStatus = Number(error?.response?.status) || null;
  const uploadedCount = Number(error?.cloudinaryUploadContext?.uploadedCount) || 0;

  return {
    provider: 'cloudinary',
    uploadMode: getCloudinaryUploadMode(),
    httpStatus,
    errorCode: redactCloudinarySecrets(
      error?.response?.data?.error?.code || error?.code || 'CLOUDINARY_UPLOAD_FAILED'
    ),
    message,
    failedField: inferFailedField(error, message),
    uploadedCount,
  };
};

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
  const uploadedAssets = [];

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

    let response;
    try {
      response = await axios.post(endpoint, formData, {
        headers: formData.getHeaders(),
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (error) {
      // Preserve partial success for multi-image scans without attaching request
      // bodies, credentials, signatures, or other sensitive Axios metadata.
      error.cloudinaryUploadContext = {
        failedFileIndex: index,
        uploadedCount: uploadedUrls.length,
        uploadedUrls: [...uploadedUrls],
        uploadedAssets: [...uploadedAssets],
      };
      throw error;
    }

    const secureUrl = response.data?.secure_url;
    const returnedPublicId = response.data?.public_id;
    if (
      !secureUrl
      || typeof secureUrl !== 'string'
      || (options.returnMetadata && (!returnedPublicId || typeof returnedPublicId !== 'string'))
    ) {
      const error = new Error('Cloudinary upload succeeded but required secure_url/public_id metadata was not returned.');
      error.code = 'CLOUDINARY_UPLOAD_INVALID_RESPONSE';
      throw error;
    }

    uploadedUrls.push(secureUrl);
    uploadedAssets.push({
      secureUrl,
      publicId: returnedPublicId || `${folder}/${publicId}`,
      resourceType: response.data?.resource_type || 'image',
      bytes: Number(response.data?.bytes) || Number(file.size) || Number(file.buffer?.length) || null,
    });
  }

  return options.returnMetadata ? uploadedAssets : uploadedUrls;
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

  let safeLogUrl = '[invalid-url]';
  try {
    const parsed = new URL(secureUrl);
    safeLogUrl = `${parsed.origin}${parsed.pathname}`;
  } catch { /* keep redacted fallback */ }
  console.log(`[Cloudinary GLB] ✅ Permanent URL: ${safeLogUrl}`);
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

  let response;
  try {
    response = await axios.post(endpoint, formData, {
      headers: formData.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    // Keep only non-sensitive operational context. Never attach FormData,
    // request headers, credentials, signatures, or the image buffer.
    error.cloudinaryUploadContext = {
      uploadType: String(options.uploadType || 'buffer').slice(0, 40),
      uploadedCount: 0,
    };
    throw error;
  }

  const secureUrl = response.data?.secure_url;
  const returnedPublicId = response.data?.public_id;
  if (
    !secureUrl
    || typeof secureUrl !== 'string'
    || (options.returnMetadata && (!returnedPublicId || typeof returnedPublicId !== 'string'))
  ) {
    const error = new Error(
      'Cloudinary upload succeeded but required secure_url/public_id metadata was not returned.'
    );
    error.code = 'CLOUDINARY_UPLOAD_INVALID_RESPONSE';
    throw error;
  }

  if (options.returnMetadata) {
    return {
      secureUrl,
      publicId: returnedPublicId,
      resourceType: response.data?.resource_type || 'image',
      bytes: Number(response.data?.bytes) || buffer.length,
    };
  }

  return secureUrl;
};
