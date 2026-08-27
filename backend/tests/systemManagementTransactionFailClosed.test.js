import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'system_management_transaction_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const { default: Notification } = await import('../models/notification.model.js');
const { default: User } = await import('../models/user.model.js');
const { classifyNewOperationalRecord } = await import('../services/systemClassification.service.js');
const { createEncryptedBackup } = await import('../services/systemBackup.service.js');
const { updateClassifications } = await import('../services/systemClassification.service.js');
const { createCleanupPreview, executeCleanup } = await import('../services/systemCleanup.service.js');
const { createDemoResetPreview, executeDemoReset } = await import('../services/systemDemoReset.service.js');
const { initializeProtectedAdministrator } = await import('../services/systemState.service.js');

const ADMIN_PASSWORD = 'Standalone!Admin123';
let mongo;
let admin;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-system-standalone-test'));
  admin = await User.create({
    name: 'Protected Administrator',
    email: 'ivantadena18@gmail.com',
    password: ADMIN_PASSWORD,
    role: 'administrator',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  await initializeProtectedAdministrator();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('destructive execution fails closed when replica-set transactions are unavailable', async () => {
  const notification = await Notification.create({
    title: 'Must survive',
    message: 'Standalone Mongo may never use a non-transactional fallback.',
    recipientRole: 'administrator',
  });
  await classifyNewOperationalRecord({
    collectionName: 'notifications',
    documentId: notification._id,
    label: notification.title,
  });
  const actor = {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
  const preview = await createCleanupPreview({
    actor,
    body: {
      categories: ['notifications'],
      selection: { notifications: [String(notification._id)] },
      skipBackup: true,
    },
  });

  await assert.rejects(
    executeCleanup({
      actor,
      body: {
        previewId: preview.previewId,
        planHash: preview.planHash,
        password: ADMIN_PASSWORD,
        phrase: 'CLEAR DEMO DATA',
        idempotencyKey: 'standalone-cleanup-must-fail',
      },
    }),
    (error) => error.code === 'TRANSACTIONS_REQUIRED' && error.status === 503,
  );
  assert.ok(await Notification.exists({ _id: notification._id }));
});

test('demo environment reset also fails closed without replica-set transactions', async () => {
  const customer = await User.create({
    name: 'Must Survive Customer',
    email: 'must.survive.reset@example.test',
    password: 'Standalone!Customer123',
    role: 'customer',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const actor = {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
  const preview = await createDemoResetPreview({ actor });
  await assert.rejects(
    executeDemoReset({
      actor,
      body: {
        previewId: preview.previewId,
        planHash: preview.planHash,
        password: ADMIN_PASSWORD,
        phrase: 'RESET DEMO ENVIRONMENT',
        idempotencyKey: 'standalone-demo-reset-must-fail',
      },
    }),
    (error) => error.code === 'TRANSACTIONS_REQUIRED' && error.status === 503,
  );
  assert.ok(await User.exists({ _id: customer._id }));
  assert.ok(await User.exists({ _id: admin._id }));
});

test('encrypted backup fails closed without snapshot transaction support', async () => {
  const actor = {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
  await assert.rejects(
    createEncryptedBackup({
      actor,
      passphrase: 'Standalone Snapshot!Backup',
      purpose: 'lifecycle',
      includeAssets: true,
    }),
    (error) => error.code === 'TRANSACTIONS_REQUIRED' && error.status === 503,
  );
});

test('classification registry and root updates fail closed without transactions', async () => {
  const notification = await Notification.create({
    title: 'Atomic classification',
    message: 'Registry and root record must never diverge.',
    recipientRole: 'administrator',
  });
  await assert.rejects(
    updateClassifications({
      items: [{
        collection: 'notifications',
        documentId: String(notification._id),
        dataEnvironment: 'production',
      }],
      reviewed: true,
      actorId: admin._id,
    }),
    (error) => error.code === 'TRANSACTIONS_REQUIRED' && error.status === 503,
  );
  const unchanged = await Notification.collection.findOne({ _id: notification._id });
  assert.notEqual(unchanged.dataEnvironment, 'production');
});
