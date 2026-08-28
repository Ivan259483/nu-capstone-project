import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'user_management_protected_admin_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';

const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL } = await import('../constants/roles.js');
const { default: User } = await import('../models/user.model.js');
const { getSystemOverview } = await import('../services/systemOverview.service.js');
const { initializeProtectedAdministrator } = await import('../services/systemState.service.js');
const userRoutes = (await import('../routes/users.routes.js')).default;

let mongo;
let server;
let baseUrl;
let protectedAdministrator;
let manageableUsers;

const tokenFor = (user) => jwt.sign({
  id: String(user._id),
  email: user.email,
  role: user.role,
  authLevel: STAFF_2FA_AUTH_LEVEL,
  authVersion: Number(user.authVersion || 0),
  globalSessionEpoch: 0,
}, config.jwtSecret, { expiresIn: '1h' });

const requestJson = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const seedUser = (role, suffix, overrides = {}) => User.create({
  name: `${role} ${suffix}`,
  email: `${role}.${suffix}@example.test`,
  password: 'Manageable!User123',
  role,
  isVerified: true,
  isActive: true,
  status: 'active',
  isFirstLogin: false,
  ...overrides,
});

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-user-management-protected-admin-test'));

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
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  protectedAdministrator = await User.create({
    name: 'Ivan Tadena',
    email: 'ivantadena18@gmail.com',
    password: 'Protected!Administrator123',
    role: 'administrator',
    isVerified: true,
    isActive: true,
    status: 'active',
    isFirstLogin: false,
  });
  manageableUsers = await Promise.all([
    seedUser('sales', 'directory'),
    seedUser('staff_quality_checker', 'directory'),
    seedUser('customer', 'directory'),
  ]);
  await initializeProtectedAdministrator();
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await mongoose.disconnect();
  await mongo?.stop();
});

test('ordinary user directory excludes the stored protected administrator from rows and totals', async () => {
  const result = await requestJson('/api/users?scope=manageable', {
    token: tokenFor(protectedAdministrator),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.scope, 'manageable_users');
  assert.equal(result.body.data.length, 3);
  assert.deepEqual(
    new Set(result.body.data.map((user) => String(user._id))),
    new Set(manageableUsers.map((user) => String(user._id))),
  );
  assert.equal(
    result.body.data.some((user) => String(user._id) === String(protectedAdministrator._id)),
    false,
  );
});

test('ordinary direct view and mutation routes reject the protected administrator by stored ID', async () => {
  const before = await User.findById(protectedAdministrator._id).lean();
  const token = tokenFor(protectedAdministrator);
  const attempts = [
    requestJson(`/api/users/${protectedAdministrator._id}`, { token }),
    requestJson(`/api/users/${protectedAdministrator._id}`, {
      method: 'PUT', token, body: JSON.stringify({ name: 'Changed Name' }),
    }),
    requestJson(`/api/users/${protectedAdministrator._id}/archive`, { method: 'PATCH', token }),
    requestJson(`/api/users/${protectedAdministrator._id}/activate`, { method: 'PATCH', token }),
    requestJson(`/api/users/${protectedAdministrator._id}`, { method: 'DELETE', token }),
  ];

  for (const result of await Promise.all(attempts)) {
    assert.equal(result.response.status, 403);
    assert.equal(result.body.code, 'PROTECTED_ADMINISTRATOR_SYSTEM_MANAGED');
  }

  const after = await User.findById(protectedAdministrator._id).lean();
  assert.equal(after.name, before.name);
  assert.equal(after.email, before.email);
  assert.equal(after.role, 'administrator');
  assert.equal(after.status, 'active');
  assert.equal(after.isActive, true);
  assert.equal(after.isDeleted, false);
});

test('System Management overview still exposes the protected ownership summary', async () => {
  const overview = await getSystemOverview({
    id: String(protectedAdministrator._id),
    role: protectedAdministrator.role,
  });

  assert.equal(overview.capabilities.protectedAdministrator, true);
  assert.deepEqual(overview.state.protectedAdministrator, {
    id: String(protectedAdministrator._id),
    name: 'Ivan Tadena',
    email: 'ivantadena18@gmail.com',
    role: 'administrator',
    status: 'active',
    isActive: true,
    isVerified: true,
  });
});

