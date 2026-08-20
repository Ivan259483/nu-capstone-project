import test from 'node:test';
import assert from 'node:assert/strict';
import { getCloudinarySafeErrorDetails } from '../utils/cloudinaryStorage.utils.js';

test('extracts safe Cloudinary upload diagnostics and identifies the failed field', () => {
  const originalPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  process.env.CLOUDINARY_UPLOAD_PRESET = 'private-test-preset';

  try {
    const error = new Error('Request failed with status code 400');
    error.code = 'ERR_BAD_REQUEST';
    error.response = {
      status: 400,
      data: { error: { message: 'Upload preset private-test-preset not found' } },
    };
    error.cloudinaryUploadContext = { uploadedCount: 0 };

    assert.deepEqual(getCloudinarySafeErrorDetails(error), {
      provider: 'cloudinary',
      uploadMode: 'none',
      httpStatus: 400,
      errorCode: 'ERR_BAD_REQUEST',
      message: 'Upload preset [redacted] not found',
      failedField: 'upload_preset',
      uploadedCount: 0,
    });
  } finally {
    if (originalPreset === undefined) delete process.env.CLOUDINARY_UPLOAD_PRESET;
    else process.env.CLOUDINARY_UPLOAD_PRESET = originalPreset;
  }
});

test('redacts generated signatures from Cloudinary authentication errors', () => {
  const error = new Error('Request failed with status code 401');
  error.code = 'ERR_BAD_REQUEST';
  error.response = {
    status: 401,
    data: { error: { message: 'Invalid Signature abcdef1234567890. String to sign is safe.' } },
  };

  const details = getCloudinarySafeErrorDetails(error);
  assert.equal(details.message, 'Invalid Signature [redacted]. String to sign is safe.');
  assert.equal(details.failedField, 'signature');
});
