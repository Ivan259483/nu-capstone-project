import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'profile_photo_upload_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'profile-test-cloud';
process.env.CLOUDINARY_API_KEY = '123456';
process.env.CLOUDINARY_API_SECRET = 'profile-test-secret';
delete process.env.CLOUDINARY_UPLOAD_PRESET;

const { config } = await import('../config/environment.js');
const { default: User } = await import('../models/user.model.js');
const userRoutes = (await import('../routes/users.routes.js')).default;

const originalAxiosPost = axios.post;
let mongo;
let server;
let baseUrl;
let cloudinaryShouldFail = false;
let observedCloudinaryBody = '';

const seedCustomer = (overrides = {}) => User.create({
  name: 'Profile Upload Customer',
  email: `profile-${Math.random().toString(16).slice(2)}@example.test`,
  role: 'customer',
  isActive: true,
  isVerified: true,
  status: 'active',
  ...overrides,
});

const mobileTokenFor = (user) => jwt.sign({
  id: user._id.toString(),
  role: 'customer',
  clientType: 'mobile',
  otpVerified: true,
}, config.jwtSecret, { expiresIn: '5m' });

const createImage = (format) => {
  const pipeline = sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 30, g: 120, b: 220 },
    },
  });
  return format === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg().toBuffer();
};

const patchProfilePhoto = async (user, format) => {
  const image = await createImage(format);
  const form = new FormData();
  form.append('photo', new Blob([image], {
    type: format === 'png' ? 'image/png' : 'image/jpeg',
  }), `profile.${format === 'png' ? 'png' : 'jpg'}`);

  const response = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${mobileTokenFor(user)}`,
      'X-Client-Type': 'mobile',
      'X-Request-ID': `profile-upload-${format}-request`,
    },
    body: form,
  });
  const body = await response.json();
  return { response, body };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-profile-photo-upload-test'));
  await User.init();

  axios.post = async (_endpoint, formData) => {
    observedCloudinaryBody = formData.getBuffer().toString('latin1');
    if (cloudinaryShouldFail) {
      const error = new Error('Request failed with status code 400');
      error.code = 'ERR_BAD_REQUEST';
      error.response = {
        status: 400,
        headers: { 'x-cld-error': 'Upload preset invalid-test-value not found' },
        data: { error: { message: 'Upload preset invalid-test-value not found' } },
      };
      throw error;
    }

    const isPng = observedCloudinaryBody.includes('Content-Type: image/png');
    return {
      data: {
        secure_url: `https://res.cloudinary.com/profile-test-cloud/image/upload/profile-photos/customer.${isPng ? 'png' : 'jpg'}`,
        public_id: `profile-photos/customer-${isPng ? 'png' : 'jpg'}`,
        resource_type: 'image',
        bytes: 128,
      },
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  cloudinaryShouldFail = false;
  observedCloudinaryBody = '';
});

after(async () => {
  axios.post = originalAxiosPost;
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

for (const format of ['jpeg', 'png']) {
  test(`authenticated profile ${format.toUpperCase()} upload returns 200 and persists URL plus public ID`, async () => {
    const customer = await seedCustomer();
    const { response, body } = await patchProfilePhoto(customer, format);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(body.data?.avatar, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal('avatarPublicId' in body.data, false);

    const persisted = await User.findById(customer._id).select('+avatarPublicId').lean();
    assert.equal(persisted.avatar, body.data.avatar);
    assert.equal(persisted.avatarPublicId, `profile-photos/customer-${format === 'png' ? 'png' : 'jpg'}`);

    for (const field of ['file', 'folder', 'api_key', 'timestamp', 'public_id', 'signature']) {
      assert.match(observedCloudinaryBody, new RegExp(`name="${field}"`));
    }
    assert.doesNotMatch(observedCloudinaryBody, /name="upload_preset"/);
  });
}

test('Cloudinary failure returns a safe 502 and preserves the previous profile image atomically', async () => {
  const customer = await seedCustomer({
    avatar: 'https://res.cloudinary.com/profile-test-cloud/image/upload/profile-photos/original.jpg',
    avatarPublicId: 'profile-photos/original',
  });
  cloudinaryShouldFail = true;

  const { response, body } = await patchProfilePhoto(customer, 'jpeg');
  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.message, 'Profile photo upload failed. Please try again.');
  assert.equal(JSON.stringify(body).includes('invalid-test-value'), false);

  const persisted = await User.findById(customer._id).select('+avatarPublicId').lean();
  assert.equal(
    persisted.avatar,
    'https://res.cloudinary.com/profile-test-cloud/image/upload/profile-photos/original.jpg'
  );
  assert.equal(persisted.avatarPublicId, 'profile-photos/original');
});
