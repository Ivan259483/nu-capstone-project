import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'profile_photo_upload_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
delete process.env.PUBLIC_API_ORIGIN;
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.CLOUDINARY_UPLOAD_PRESET = '';

const { config } = await import('../config/environment.js');
const { default: User } = await import('../models/user.model.js');
const userRoutes = (await import('../routes/users.routes.js')).default;
const {
  PROFILE_PHOTO_BUCKET_NAME,
  uploadProfilePhotoBuffer,
} = await import('../utils/profilePhotoGridFs.utils.js');
const { GridFSBucket } = mongoose.mongo;

let mongo;
let server;
let baseUrl;

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

const createImage = (format, color = { r: 30, g: 120, b: 220 }) => {
  const pipeline = sharp({
    create: {
      width: 20,
      height: 16,
      channels: 3,
      background: color,
    },
  });
  return format === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg().toBuffer();
};

const patchMultipart = async ({
  user,
  fieldName = 'photo',
  bytes,
  mimeType = 'image/jpeg',
  fileName = 'profile.jpg',
  includeAuth = true,
}) => {
  const form = new FormData();
  form.append(fieldName, new Blob([bytes], { type: mimeType }), fileName);
  const headers = { 'X-Client-Type': 'mobile' };
  if (includeAuth) headers.Authorization = `Bearer ${mobileTokenFor(user)}`;
  const response = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PATCH',
    headers,
    body: form,
  });
  return { response, body: await response.json() };
};

const patchProfilePhoto = async (user, format, color) => patchMultipart({
  user,
  bytes: await createImage(format, color),
  mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
  fileName: `profile.${format === 'png' ? 'png' : 'jpg'}`,
});

const getStoredUser = (id) => User.findById(id)
  .select('+profilePhotoFileId +avatarPublicId')
  .lean();

const filesCollection = () => mongoose.connection.db.collection(`${PROFILE_PHOTO_BUCKET_NAME}.files`);
const chunksCollection = () => mongoose.connection.db.collection(`${PROFILE_PHOTO_BUCKET_NAME}.chunks`);

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-profile-photo-upload-test'));
  await User.init();

  const app = express();
  app.set('trust proxy', 1);
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
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

for (const format of ['jpeg', 'png']) {
  test(`authenticated ${format.toUpperCase()} upload creates GridFS data, persists the reference, and streams the image`, async () => {
    const customer = await seedCustomer();
    const { response, body } = await patchProfilePhoto(customer, format);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(body.data?.avatar, /^\/api\/users\/profile\/photo\/[a-f0-9]{24}$/);
    assert.equal('profilePhotoFileId' in body.data, false);
    assert.equal('avatarPublicId' in body.data, false);

    const persisted = await getStoredUser(customer._id);
    assert.ok(persisted.profilePhotoFileId);
    assert.equal(persisted.avatar, body.data.avatar);
    assert.ok(persisted.profilePhotoUpdatedAt instanceof Date);
    assert.equal(persisted.avatarPublicId, undefined);

    const file = await filesCollection().findOne({ _id: persisted.profilePhotoFileId });
    assert.equal(file.metadata.kind, 'customer_profile_photo');
    assert.equal(String(file.metadata.ownerId), String(customer._id));
    assert.equal(file.metadata.contentType, format === 'png' ? 'image/png' : 'image/jpeg');
    assert.ok(await chunksCollection().countDocuments({ files_id: persisted.profilePhotoFileId }) > 0);

    const imageResponse = await fetch(`${baseUrl}${body.data.avatar}`);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), format === 'png' ? 'image/png' : 'image/jpeg');
    assert.match(imageResponse.headers.get('cache-control'), /immutable/);
    assert.ok(imageResponse.headers.get('etag'));
    const streamedBytes = Buffer.from(await imageResponse.arrayBuffer());
    const streamedMetadata = await sharp(streamedBytes).metadata();
    assert.equal(streamedMetadata.format, format);

    const cachedResponse = await fetch(`${baseUrl}${body.data.avatar}`, {
      headers: { 'If-None-Match': imageResponse.headers.get('etag') },
    });
    assert.equal(cachedResponse.status, 304);
  });
}

test('a second upload commits the new reference before removing the previous GridFS file', async () => {
  const customer = await seedCustomer();
  const first = await patchProfilePhoto(customer, 'jpeg', { r: 10, g: 20, b: 30 });
  assert.equal(first.response.status, 200);
  const firstUser = await getStoredUser(customer._id);
  const firstFileId = firstUser.profilePhotoFileId;

  const second = await patchProfilePhoto(customer, 'jpeg', { r: 220, g: 80, b: 20 });
  assert.equal(second.response.status, 200);
  const secondUser = await getStoredUser(customer._id);

  assert.notEqual(String(secondUser.profilePhotoFileId), String(firstFileId));
  assert.equal(secondUser.avatar, second.body.data.avatar);
  assert.equal(await filesCollection().findOne({ _id: firstFileId }), null);
  assert.equal(await chunksCollection().countDocuments({ files_id: firstFileId }), 0);
  assert.ok(await filesCollection().findOne({ _id: secondUser.profilePhotoFileId }));
});

test('GridFS storage failure preserves the previous avatar and file reference', async () => {
  const customer = await seedCustomer();
  const first = await patchProfilePhoto(customer, 'jpeg');
  assert.equal(first.response.status, 200);
  const before = await getStoredUser(customer._id);

  const originalOpenUploadStream = GridFSBucket.prototype.openUploadStream;
  GridFSBucket.prototype.openUploadStream = function failProfilePhotoStorage() {
    throw new Error('forced GridFS storage failure');
  };
  try {
    const failed = await patchProfilePhoto(customer, 'jpeg', { r: 1, g: 2, b: 3 });
    assert.equal(failed.response.status, 503);
    assert.equal(failed.body.code, 'PROFILE_PHOTO_STORAGE_FAILED');
  } finally {
    GridFSBucket.prototype.openUploadStream = originalOpenUploadStream;
  }

  const afterFailure = await getStoredUser(customer._id);
  assert.equal(afterFailure.avatar, before.avatar);
  assert.equal(String(afterFailure.profilePhotoFileId), String(before.profilePhotoFileId));
  assert.ok(await filesCollection().findOne({ _id: before.profilePhotoFileId }));
});

test('user update failure removes the newly uploaded GridFS file without leaving an orphan', async () => {
  const customer = await seedCustomer();
  const first = await patchProfilePhoto(customer, 'jpeg');
  assert.equal(first.response.status, 200);
  const before = await getStoredUser(customer._id);
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  User.findOneAndUpdate = function failProfilePhotoUserUpdate() {
    throw new Error('forced user update failure');
  };
  try {
    const failed = await patchProfilePhoto(customer, 'jpeg');
    assert.equal(failed.response.status, 500);
    assert.equal(failed.body.success, false);
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }

  const persisted = await getStoredUser(customer._id);
  assert.equal(persisted.avatar, before.avatar);
  assert.equal(String(persisted.profilePhotoFileId), String(before.profilePhotoFileId));
  assert.equal(await filesCollection().countDocuments({}), 1);
  assert.ok(await filesCollection().findOne({ _id: before.profilePhotoFileId }));
  assert.ok(await chunksCollection().countDocuments({ files_id: before.profilePhotoFileId }) > 0);
});

test('the read endpoint rejects unreferenced files from the dedicated bucket', async () => {
  const customer = await seedCustomer();
  const orphan = await uploadProfilePhotoBuffer({
    buffer: await createImage('jpeg'),
    filename: 'unreferenced.jpg',
    contentType: 'image/jpeg',
    ownerId: customer._id,
  });

  const response = await fetch(`${baseUrl}/api/users/profile/photo/${orphan.fileId}`);
  assert.equal(response.status, 404);
});

test('unauthenticated uploads are rejected before GridFS storage', async () => {
  const customer = await seedCustomer();
  const result = await patchMultipart({
    user: customer,
    bytes: await createImage('jpeg'),
    includeAuth: false,
  });

  assert.equal(result.response.status, 401);
  assert.equal(await filesCollection().countDocuments({}), 0);
});

test('invalid image bytes return a classified error without creating GridFS data', async () => {
  const customer = await seedCustomer();
  const { response, body } = await patchMultipart({
    user: customer,
    bytes: Buffer.from('not-an-image'),
  });

  assert.equal(response.status, 400);
  assert.equal(body.code, 'PROFILE_PHOTO_UNSUPPORTED');
  assert.equal(await filesCollection().countDocuments({}), 0);
});

test('wrong multipart field returns the expected field name clearly', async () => {
  const customer = await seedCustomer();
  const { response, body } = await patchMultipart({
    user: customer,
    fieldName: 'avatar',
    bytes: await createImage('jpeg'),
  });

  assert.equal(response.status, 400);
  assert.equal(body.code, 'PROFILE_PHOTO_FIELD_MISMATCH');
});

test('files over 2 MB return 413 before GridFS storage', async () => {
  const customer = await seedCustomer();
  const { response, body } = await patchMultipart({
    user: customer,
    bytes: Buffer.alloc((2 * 1024 * 1024) + 1, 1),
    fileName: 'oversized.jpg',
  });

  assert.equal(response.status, 413);
  assert.equal(body.code, 'PROFILE_PHOTO_TOO_LARGE');
  assert.equal(await filesCollection().countDocuments({}), 0);
});
