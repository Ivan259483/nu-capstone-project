import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  getCloudinaryRuntimeDiagnostics,
  getCloudinarySafeErrorDetails,
  uploadBufferToCloudinary,
} from '../utils/cloudinaryStorage.utils.js';

const withCloudinaryEnv = async (values, callback) => {
  const keys = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_UPLOAD_PRESET',
  ];
  const originals = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    return await callback();
  } finally {
    for (const key of keys) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  }
};

test('signed credentials select signed fields and never send upload_preset', async () => {
  await withCloudinaryEnv({
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'server-secret',
    CLOUDINARY_UPLOAD_PRESET: 'legacy-preset',
  }, () => {
    const diagnostics = getCloudinaryRuntimeDiagnostics();
    assert.equal(diagnostics.uploadMode, 'signed');
    assert.deepEqual(diagnostics.authFieldNames, [
      'api_key',
      'timestamp',
      'public_id',
      'signature',
    ]);
    assert.equal(diagnostics.authFieldNames.includes('upload_preset'), false);
  });
});

test('unsigned configuration sends exactly the Cloudinary upload_preset auth field', async () => {
  await withCloudinaryEnv({
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
    CLOUDINARY_UPLOAD_PRESET: ' unsigned-profile-preset ',
  }, () => {
    const diagnostics = getCloudinaryRuntimeDiagnostics();
    assert.equal(diagnostics.uploadMode, 'unsigned');
    assert.deepEqual(diagnostics.authFieldNames, ['upload_preset']);
    assert.equal(diagnostics.uploadPresetLength, 23);
    assert.equal(diagnostics.uploadPresetTrimChanged, true);
  });
});

test('signed buffer upload sends the actual signed multipart fields and returns Cloudinary metadata', async () => {
  await withCloudinaryEnv({
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'server-secret',
    CLOUDINARY_UPLOAD_PRESET: undefined,
  }, async () => {
    const originalPost = axios.post;
    axios.post = async (endpoint, formData) => {
      const body = formData.getBuffer().toString('latin1');
      assert.equal(endpoint, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
      for (const field of ['file', 'folder', 'api_key', 'timestamp', 'public_id', 'signature']) {
        assert.match(body, new RegExp(`name="${field}"`));
      }
      assert.doesNotMatch(body, /name="upload_preset"/);
      return {
        data: {
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/profile-photos/user_1.jpg',
          public_id: 'profile-photos/user_1',
          resource_type: 'image',
          bytes: 4,
        },
      };
    };

    try {
      const result = await uploadBufferToCloudinary(Buffer.from('test'), {
        folder: 'profile-photos',
        publicId: 'user_1',
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
        uploadType: 'profile_photo',
        returnMetadata: true,
      });
      assert.deepEqual(result, {
        secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/profile-photos/user_1.jpg',
        publicId: 'profile-photos/user_1',
        resourceType: 'image',
        bytes: 4,
      });
    } finally {
      axios.post = originalPost;
    }
  });
});

test('unsigned buffer upload sends upload_preset and no signed authentication fields', async () => {
  await withCloudinaryEnv({
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
    CLOUDINARY_UPLOAD_PRESET: 'profile-preset',
  }, async () => {
    const originalPost = axios.post;
    axios.post = async (_endpoint, formData) => {
      const body = formData.getBuffer().toString('latin1');
      assert.match(body, /name="file"/);
      assert.match(body, /name="folder"/);
      assert.match(body, /name="upload_preset"/);
      for (const field of ['api_key', 'timestamp', 'public_id', 'signature']) {
        assert.doesNotMatch(body, new RegExp(`name="${field}"`));
      }
      return {
        data: {
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/profile.jpg',
          public_id: 'profile',
        },
      };
    };

    try {
      const result = await uploadBufferToCloudinary(Buffer.from('test'));
      assert.equal(result, 'https://res.cloudinary.com/test-cloud/image/upload/profile.jpg');
    } finally {
      axios.post = originalPost;
    }
  });
});

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
