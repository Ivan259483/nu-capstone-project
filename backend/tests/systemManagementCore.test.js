import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'system_management_core_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';

const { default: ActivityLog } = await import('../models/activityLog.model.js');
const { default: ManagedAsset } = await import('../models/managedAsset.model.js');
const { default: AccountSetupToken } = await import('../models/accountSetupToken.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: Product } = await import('../models/product.model.js');
const { default: SystemBackup } = await import('../models/systemBackup.model.js');
const { default: User } = await import('../models/user.model.js');
const {
  acknowledgeBackup,
  buildSafeExport,
  computeDataFingerprint,
  createEncryptedBackup,
  decryptBackupArchive,
  getVerifiedBackupForFingerprint,
} = await import('../services/systemBackup.service.js');
const {
  classifyNewOperationalRecord,
  DEMO_OPERATIONAL_ACTIVITY_TYPES,
  getClassificationSummary,
  updateClassifications,
} = await import('../services/systemClassification.service.js');
const {
  createCleanupPreview,
  executeCleanup,
  STAFF_SURVIVING_REFERENCE_MANIFEST,
} = await import('../services/systemCleanup.service.js');
const {
  createHandoverPreview,
  executeHandover,
  inviteHandoverCandidate,
} = await import('../services/systemLifecycle.service.js');
const { hashSetupToken } = await import('../services/chatRegistration.service.js');
const {
  processDueExternalCleanupJobs,
  reconcileExternalCleanupOperation,
} = await import('../services/systemExternalCleanup.service.js');
const {
  getPublicSystemStatus,
  getSystemCapabilities,
  initializeProtectedAdministrator,
} = await import('../services/systemState.service.js');
const systemRoutes = (await import('../routes/system.routes.js')).default;
const authRoutes = (await import('../routes/auth.routes.js')).default;
const { enforceSystemLifecycle } = await import('../middleware/systemLifecycle.middleware.js');

const ADMIN_EMAIL = 'ivantadena18@gmail.com';
const ADMIN_PASSWORD = 'System!Management123';

let replSet;
let admin;

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri('autospf-system-management-test'));
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  admin = await User.create({
    name: 'Protected Administrator',
    email: ADMIN_EMAIL,
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
  await replSet?.stop();
});

const actor = () => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role,
});

test('public status is minimal and protected capabilities are server-owned', async () => {
  const status = await getPublicSystemStatus();
  assert.deepEqual(Object.keys(status).sort(), [
    'bookingEnabled',
    'mode',
    'operationalDataEpoch',
    'phase',
    'registrationEnabled',
    'revision',
    'updatedAt',
  ]);
  assert.equal(status.mode, 'development');
  assert.equal(status.bookingEnabled, true);

  const protectedCapabilities = await getSystemCapabilities(actor());
  assert.equal(protectedCapabilities.protectedAdministrator, true);
  assert.equal(protectedCapabilities.clearDemoData, true);

  const officeCapabilities = await getSystemCapabilities({ id: new mongoose.Types.ObjectId(), role: 'office_admin' });
  assert.equal(officeCapabilities.viewOverview, true);
  assert.equal(officeCapabilities.exportData, true);
  assert.equal(officeCapabilities.clearDemoData, false);
});

test('classification is explicit and cleanup deletes only classified demo notifications', async () => {
  const unclassified = await Notification.create({
    title: 'Preserve me',
    message: 'This legacy row is not classified.',
    recipientRole: 'administrator',
  });
  const demo = await Notification.create({
    title: 'Delete me',
    message: 'This row is explicit demo data.',
    recipientRole: 'administrator',
  });
  await classifyNewOperationalRecord({
    collectionName: 'notifications',
    documentId: demo._id,
    label: demo.title,
  });

  // Force the first row back to the authoritative unclassified state; cleanup
  // must never infer from its title/message.
  const { default: SystemDataClassification } = await import('../models/systemDataClassification.model.js');
  await SystemDataClassification.deleteOne({ collectionName: 'notifications', documentId: unclassified._id });
  await Notification.collection.updateOne(
    { _id: unclassified._id },
    { $set: { dataEnvironment: 'unclassified', classificationMetadata: null } },
  );
  const { default: SystemState } = await import('../models/systemState.model.js');
  await SystemState.updateOne({}, { $set: { modeStartedAt: new Date(Date.now() + 60_000) } });

  const summary = await getClassificationSummary();
  assert.equal(summary.collections.notifications.demo, 1);
  assert.equal(summary.collections.notifications.unclassified, 1);

  await SystemState.updateOne({}, { $set: { mode: 'production' } });
  await assert.rejects(
    updateClassifications({
      items: [{
        collection: 'notifications',
        documentId: String(unclassified._id),
        dataEnvironment: 'demo',
      }],
      reviewed: true,
      actorId: admin._id,
    }),
    (error) => error.code === 'CLASSIFICATION_MODE_BLOCKED',
  );
  assert.equal(
    (await Notification.collection.findOne({ _id: unclassified._id })).dataEnvironment,
    'unclassified',
  );
  await SystemState.updateOne({}, { $set: { mode: 'development' } });

  const preview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['notifications'],
      selection: { notifications: [String(demo._id)] },
      skipBackup: true,
    },
  });
  assert.equal(preview.blockers.length, 0);
  assert.equal(preview.counts.notifications, 1);
  assert.equal(preview.requiresBackup, false);

  const completed = await executeCleanup({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      password: ADMIN_PASSWORD,
      phrase: 'CLEAR DEMO DATA',
      idempotencyKey: 'cleanup-notification-1',
    },
  });
  assert.ok(['completed', 'completed_with_warnings'].includes(completed.status));
  assert.equal(await Notification.exists({ _id: demo._id }), null);
  assert.ok(await Notification.exists({ _id: unclassified._id }));
});

test('customer cleanup closes targeted operational data while preserving authoritative audits', async () => {
  const customer = await User.create({
    name: 'Demo Customer',
    email: 'demo.customer@example.test',
    password: 'Demo!Customer123',
    role: 'customer',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const notification = await Notification.create({
    title: 'Demo booking update',
    message: 'Targeted customer operational data.',
    recipientRole: 'customer',
    recipientUserId: customer._id,
  });
  const operationalActivity = await ActivityLog.create({
    type: 'customer_booking',
    title: 'Demo booking activity',
    description: 'Operational customer activity.',
    userId: customer._id,
    userName: customer.name,
    userRole: 'customer',
    module: 'Customer',
  });
  const authoritativeAudit = await ActivityLog.create({
    type: 'failed_login',
    title: 'Security audit',
    description: 'Authoritative audit evidence.',
    userId: customer._id,
    userName: customer.name,
    userRole: 'customer',
    module: 'Auth',
    status: 'warning',
  });

  await Promise.all([
    classifyNewOperationalRecord({ collectionName: 'customers', documentId: customer._id, label: customer.name }),
    classifyNewOperationalRecord({ collectionName: 'notifications', documentId: notification._id, label: notification.title }),
    classifyNewOperationalRecord({ collectionName: 'activity', documentId: operationalActivity._id, label: operationalActivity.title }),
  ]);

  const rawCustomer = await User.collection.findOne({ _id: customer._id });
  assert.equal(rawCustomer.dataEnvironment, 'demo');
  assert.equal(rawCustomer.classificationMetadata?.source, 'mode_default');
  assert.equal(rawCustomer.classificationMetadata?.reviewed, true);

  const preview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['customers'],
      selection: { customers: [String(customer._id)] },
    },
  });

  assert.equal(preview.blockers.length, 0);
  assert.equal(preview.counts.customers, 1);
  assert.equal(preview.counts.notifications, 1);
  assert.equal(preview.counts.activity, 1);
  const storedPreview = await (await import('../models/systemOperation.model.js')).default.findById(preview.previewId).lean();
  assert.ok(storedPreview.plan.ids.notifications.includes(String(notification._id)));
  assert.ok(storedPreview.plan.ids.activity.includes(String(operationalActivity._id)));
  assert.ok(!storedPreview.plan.ids.activity.includes(String(authoritativeAudit._id)));
});

test('encrypted backup round-trips hashes, excludes transient tokens, and acknowledgement is checksum-bound', async () => {
  const { default: SystemMutationAdmission } = await import('../models/systemMutationAdmission.model.js');
  const { default: SystemState } = await import('../models/systemState.model.js');
  admin.expoPushTokens = ['ExponentPushToken[secret]'];
  await admin.save();
  await ManagedAsset.create({
    provider: 'cloudinary',
    accountIdentifier: 'another-cloud-account',
    publicId: 'legacy/unverified-avatar',
    secureUrl: 'https://res.cloudinary.com/another-cloud-account/image/upload/legacy/unverified-avatar.jpg',
    ownerCollection: 'User',
    ownerId: admin._id,
    fieldPath: 'avatar',
  });
  const fingerprintBeforeAdmission = await computeDataFingerprint();
  await SystemMutationAdmission.create({
    token: 'ephemeral-admission-token',
    owner: 'backup-test',
    kind: 'internal',
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(
    await computeDataFingerprint(),
    fingerprintBeforeAdmission,
    'ephemeral mutation admission tickets must not stale lifecycle fingerprints',
  );
  await SystemState.collection.updateOne(
    { key: 'primary' },
    {
      $set: {
        mutationLease: {
          operationId: new mongoose.Types.ObjectId(),
          fencingToken: 'restore-must-not-replay-this-fence',
          owner: 'expired-backup-test-lease',
          acquiredAt: new Date(Date.now() - 120_000),
          expiresAt: new Date(Date.now() - 60_000),
        },
        fencingToken: 'top-level-fuzz-fence',
      },
    },
  );
  assert.equal(
    await computeDataFingerprint(),
    fingerprintBeforeAdmission,
    'mutation leases and fencing tokens are control-plane state, not operational data',
  );
  const fingerprintBeforeDateChange = await computeDataFingerprint();
  const changedTimestamp = new Date(Date.now() + 60_000);
  await User.collection.updateOne({ _id: admin._id }, { $set: { updatedAt: changedTimestamp } });
  const fingerprintAfterDateChange = await computeDataFingerprint();
  assert.notEqual(
    fingerprintAfterDateChange,
    fingerprintBeforeDateChange,
    'date-only mutations must stale a backup or destructive preview fingerprint',
  );
  const { backup, artifact } = await createEncryptedBackup({
    actor: actor(),
    passphrase: 'Correct Horse Battery!Staple',
    includeAssets: false,
    purpose: 'general',
  });
  assert.ok(Buffer.isBuffer(artifact));
  assert.equal(backup.status, 'ready');
  assert.equal(backup.purpose, 'general');
  assert.equal(backup.lifecycleEligible, false);

  const storedRaw = await SystemBackup.collection.findOne({ _id: backup._id });
  assert.equal(Object.hasOwn(storedRaw, 'artifact'), false, 'large encrypted artifact must not be stored in Mongo');

  const { payload } = await decryptBackupArchive(artifact, 'Correct Horse Battery!Staple');
  const users = payload.collections.find((entry) => entry.name === User.collection.name)?.documents || [];
  const protectedUser = users.find((entry) => String(entry._id) === String(admin._id));
  assert.match(protectedUser.password, /^\$2[aby]\$/);
  assert.ok(protectedUser.createdAt instanceof Date);
  assert.ok(protectedUser.updatedAt instanceof Date);
  assert.equal(protectedUser.updatedAt.toISOString(), changedTimestamp.toISOString());
  assert.equal(Object.hasOwn(protectedUser, 'expoPushTokens'), false);
  assert.equal(
    payload.collections.some((entry) => entry.name === SystemMutationAdmission.collection.name),
    false,
  );
  const states = payload.collections.find((entry) => entry.name === SystemState.collection.name)?.documents || [];
  assert.ok(states.length > 0);
  assert.equal(Object.hasOwn(states[0], 'mutationLease'), false);
  assert.equal(Object.hasOwn(states[0], 'fencingToken'), false);
  assert.ok(payload.unresolvedAssets.some((entry) => (
    entry.publicId === 'legacy/unverified-avatar'
    && entry.reason === 'asset_download_skipped'
  )));

  await assert.rejects(
    acknowledgeBackup({ backupId: backup._id, checksum: 'short', actorId: admin._id }),
    (error) => error.code === 'BACKUP_CHECKSUM_MISMATCH',
  );
  const verified = await acknowledgeBackup({
    backupId: backup._id,
    checksum: backup.checksum,
    actorId: admin._id,
  });
  assert.equal(verified.status, 'verified');
  assert.equal(
    await getVerifiedBackupForFingerprint(backup._id, backup.dataFingerprint),
    null,
    'a verified general/assetless artifact must not satisfy lifecycle gates',
  );

  const safeExport = await buildSafeExport({ actor: actor() });
  assert.ok(mongoose.isValidObjectId(safeExport.exportId));
  const safeText = safeExport.bytes.toString('utf8');
  assert.doesNotMatch(safeText, /System!Management123/);
  assert.doesNotMatch(safeText, /"password"/);
  assert.doesNotMatch(safeText, /ExponentPushToken/);
});

test('lifecycle backup rejects skipped assets and binds complete managed coverage to the snapshot', async () => {
  const activeAsset = await ManagedAsset.create({
    provider: 'cloudinary',
    accountIdentifier: 'configured-cloud',
    publicId: 'managed/required-proof',
    secureUrl: 'https://res.cloudinary.com/configured-cloud/image/upload/managed/required-proof.jpg',
    ownerCollection: 'User',
    ownerId: admin._id,
    fieldPath: 'avatar',
  });

  await assert.rejects(
    createEncryptedBackup({
      actor: actor(),
      passphrase: 'Lifecycle Backup!Passphrase',
      includeAssets: false,
      purpose: 'lifecycle',
    }),
    (error) => error.code === 'LIFECYCLE_BACKUP_ASSETS_REQUIRED' && error.status === 409,
  );
  const failed = await SystemBackup.findOne({ createdBy: admin._id }).sort({ createdAt: -1 }).lean();
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureCode, 'LIFECYCLE_BACKUP_ASSETS_REQUIRED');

  await User.collection.updateOne(
    { _id: admin._id },
    { $set: { avatar: 'https://res.cloudinary.com/legacy-cloud/image/upload/unregistered/avatar.jpg?token=legacy' } },
  );
  const assetBytes = Buffer.from('managed-asset-snapshot-bytes');
  const originalFetch = globalThis.fetch;
  const originalCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  process.env.CLOUDINARY_CLOUD_NAME = 'configured-cloud';
  globalThis.fetch = async () => new Response(assetBytes, {
    status: 200,
    headers: {
      'content-length': String(assetBytes.length),
      'content-type': 'image/jpeg',
    },
  });
  let backup;
  let artifact;
  try {
    ({ backup, artifact } = await createEncryptedBackup({
      actor: actor(),
      passphrase: 'Lifecycle Backup!Passphrase',
      includeAssets: true,
      purpose: 'lifecycle',
    }));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = originalCloudName;
  }
  assert.equal(backup.status, 'ready');
  assert.equal(backup.purpose, 'lifecycle');
  assert.equal(backup.lifecycleEligible, true);
  assert.equal(backup.assetCoverage.complete, true);
  assert.equal(backup.assetCoverage.managed, 1);
  assert.equal(backup.assetCoverage.included, 1);
  assert.equal(backup.assetCoverage.managedUnresolved, 0);
  assert.ok(backup.assetCoverage.legacyUnresolved >= 1);
  assert.match(backup.snapshotCatalogHash, /^[a-f0-9]{64}$/);

  const { payload } = await decryptBackupArchive(artifact, 'Lifecycle Backup!Passphrase');
  assert.equal(payload.dataFingerprint, backup.dataFingerprint);
  assert.equal(payload.snapshotCatalogHash, backup.snapshotCatalogHash);
  assert.equal(payload.backupPurpose, 'lifecycle');
  assert.equal(payload.assetCoverage.complete, true);
  assert.equal(payload.assetManifest.length, 1);
  assert.equal(payload.assetManifest[0].assetId, String(activeAsset._id));
  assert.equal(Buffer.from(payload.assetManifest[0].data, 'base64').toString(), assetBytes.toString());
  assert.ok(payload.unresolvedAssets.some((entry) => entry.reason === 'legacy_asset_not_registered'));

  await acknowledgeBackup({ backupId: backup._id, checksum: backup.checksum, actorId: admin._id });
  assert.ok(await getVerifiedBackupForFingerprint(backup._id, backup.dataFingerprint));
  await SystemBackup.collection.updateOne(
    { _id: backup._id },
    { $set: { 'assetCoverage.managed': 1, 'assetCoverage.included': 0, 'assetCoverage.requested': false } },
  );
  assert.equal(
    await getVerifiedBackupForFingerprint(backup._id, backup.dataFingerprint),
    null,
    'persisted eligibility flags cannot override contradictory asset coverage counts',
  );
});

test('sanitized export uses explicit DTO allowlists and strips secret variants and URL credentials', async () => {
  const notification = await Notification.create({
    title: 'Credential hygiene',
    message: 'Open https://example.test/report?signature=url-secret#fragment, client_secret=text-secret',
    recipientRole: 'administrator',
    link: 'https://firebasestorage.googleapis.com/v0/b/example/o/proof.jpg?alt=media&token=firebase-download-token',
    action: {
      label: 'Review',
      link: 'https://example.test/action?access_token=action-secret',
    },
  });
  const product = await Product.create({
    name: 'Safe export product',
    price: 250,
    images: ['https://cdn.example.test/product.jpg?X-Amz-Signature=aws-secret&X-Amz-Credential=aws-credential-secret'],
  });
  await User.collection.updateOne(
    { _id: admin._id },
    {
      $set: {
        PasswordHash: 'fuzz-password-hash',
        api_KEY: 'fuzz-api-key',
        clientSecret: 'fuzz-client-secret',
        privateKey: 'fuzz-private-key',
        nestedCredentials: { refreshToken: 'fuzz-refresh-token' },
      },
    },
  );
  await Notification.collection.updateOne(
    { _id: notification._id },
    { $set: { 'action.apiKey': 'nested-action-secret', authorizationToken: 'top-level-auth-secret' } },
  );
  await mongoose.connection.db.collection('unsafeexportfixtures').insertOne({
    password: 'unallowlisted-collection-secret',
    url: 'https://example.test/?token=unallowlisted-url-secret',
  });

  const exported = await buildSafeExport({ actor: actor() });
  const text = exported.bytes.toString('utf8');
  const payload = JSON.parse(text);
  const collectionNames = payload.collections.map((entry) => entry.name);
  assert.ok(!collectionNames.includes('unsafeexportfixtures'));
  for (const secret of [
    'fuzz-password-hash',
    'fuzz-api-key',
    'fuzz-client-secret',
    'fuzz-private-key',
    'fuzz-refresh-token',
    'nested-action-secret',
    'top-level-auth-secret',
    'url-secret',
    'text-secret',
    'firebase-download-token',
    'action-secret',
    'aws-secret',
    'aws-credential-secret',
    'unallowlisted-collection-secret',
    'unallowlisted-url-secret',
  ]) assert.doesNotMatch(text, new RegExp(secret, 'i'));

  const notifications = payload.collections.find((entry) => entry.name === 'notifications')?.documents || [];
  const exportedNotification = notifications.find((entry) => entry._id?.$oid === String(notification._id));
  assert.equal(exportedNotification.link, 'https://firebasestorage.googleapis.com/v0/b/example/o/proof.jpg');
  assert.equal(exportedNotification.action.link, 'https://example.test/action');
  assert.match(exportedNotification.message, /client_secret=\[redacted\]/i);
  const products = payload.collections.find((entry) => entry.name === 'products')?.documents || [];
  const exportedProduct = products.find((entry) => entry._id?.$oid === String(product._id));
  assert.deepEqual(exportedProduct.images, ['https://cdn.example.test/product.jpg']);

  const { default: SystemOperation } = await import('../models/systemOperation.model.js');
  const audit = await SystemOperation.findById(exported.exportId).lean();
  assert.equal(audit.receipt.contract, 'explicit_allowlist_v1');
  assert.ok(audit.receipt.collections.some((entry) => entry.name === 'notifications'));
});

test('handover requires durable password-OTP evidence and transfers protection atomically', async () => {
  const targetWithoutOtp = await User.create({
    name: 'Pending Client Admin',
    email: 'pending.client@example.test',
    password: 'Pending!Client123',
    role: 'office_admin',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const blocked = await createHandoverPreview({
    actor: actor(),
    targetUserId: targetWithoutOtp._id,
  });
  assert.ok(blocked.blockers.some((entry) => entry.code === 'HANDOVER_TARGET_NOT_READY'));

  targetWithoutOtp.lastPasswordOtpSignInAt = new Date();
  await targetWithoutOtp.save({ validateBeforeSave: false });
  const preview = await createHandoverPreview({
    actor: actor(),
    targetUserId: targetWithoutOtp._id,
  });
  assert.equal(preview.blockers.length, 0);
  const completed = await executeHandover({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      password: ADMIN_PASSWORD,
      phrase: 'TRANSFER AUTOSPF ADMIN',
      idempotencyKey: 'handover-client-admin-1',
    },
  });
  assert.equal(completed.status, 'completed');

  const { default: SystemState } = await import('../models/systemState.model.js');
  const [state, outgoing, target] = await Promise.all([
    SystemState.findOne({}).lean(),
    User.findById(admin._id).lean(),
    User.findById(targetWithoutOtp._id).lean(),
  ]);
  assert.equal(String(state.protectedAdministratorId), String(targetWithoutOtp._id));
  assert.equal(outgoing.isActive, false);
  assert.equal(outgoing.status, 'suspended');
  assert.equal(target.role, 'administrator');
});

test('password mutations invalidate prior OTP evidence before handover', async () => {
  const target = await User.create({
    name: 'Credential Rotation Target',
    email: 'credential.rotation@example.test',
    password: 'Before!Rotation123',
    role: 'office_admin',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  target.lastPasswordOtpSignInAt = new Date();
  await target.save({ validateBeforeSave: false });

  const ready = await createHandoverPreview({ actor: actor(), targetUserId: target._id });
  assert.equal(ready.blockers.length, 0);

  target.password = 'After!Rotation123';
  await target.save();
  let rotated = await User.findById(target._id).select('+lastPasswordOtpSignInAt');
  assert.equal(rotated.lastPasswordOtpSignInAt, null);
  const blocked = await createHandoverPreview({ actor: actor(), targetUserId: target._id });
  assert.ok(blocked.blockers.some((entry) => entry.code === 'HANDOVER_TARGET_NOT_READY'));

  await User.updateOne(
    { _id: target._id },
    { $set: { lastPasswordOtpSignInAt: new Date() } },
  );
  rotated = await User.findById(target._id).select('+lastPasswordOtpSignInAt');
  await User.findByIdAndUpdate(
    target._id,
    { $set: { password: rotated.password } },
  );
  const adminMutated = await User.findById(target._id).select('+lastPasswordOtpSignInAt');
  assert.equal(adminMutated.lastPasswordOtpSignInAt, null);
});

test('protected invitation creates a passwordless Office Admin and setup requires a later OTP sign-in', async () => {
  assert.equal(
    DEMO_OPERATIONAL_ACTIVITY_TYPES.includes('client_administrator_setup_completed'),
    false,
    'client administrator setup audit evidence must not be demo-cleanable',
  );
  await assert.rejects(
    inviteHandoverCandidate({
      actor: { id: new mongoose.Types.ObjectId(), role: 'administrator' },
      body: { name: 'Client Owner', email: 'client.owner@example.test' },
    }),
    (error) => error.code === 'PROTECTED_ADMIN_REQUIRED',
  );

  const invitation = await inviteHandoverCandidate({
    actor: actor(),
    body: { name: 'Client Owner', email: 'CLIENT.OWNER@example.test' },
    requestMetadata: { ip: '127.0.0.1', userAgent: 'system-test' },
  });
  assert.equal(invitation.accountCreated, true);
  assert.equal(invitation.setupEmailSent, true);
  assert.equal(invitation.target.email, 'client.owner@example.test');

  let invited = await User.findById(invitation.target.id)
    .select('+lastPasswordOtpSignInAt')
    .lean();
  assert.equal(invited.role, 'office_admin');
  assert.equal(invited.status, 'pending');
  assert.equal(invited.isVerified, false);
  assert.equal(invited.password, undefined);
  assert.equal(invited.lastPasswordOtpSignInAt, null);
  assert.equal(
    await AccountSetupToken.countDocuments({ userId: invited._id, usedAt: null }),
    1,
  );

  const rawToken = 'test-client-administrator-setup-token';
  await AccountSetupToken.updateMany(
    { userId: invited._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  await AccountSetupToken.create({
    userId: invited._id,
    email: invited.email,
    tokenHash: hashSetupToken(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    lastSentAt: new Date(),
  });

  const { default: SystemState } = await import('../models/systemState.model.js');
  await SystemState.updateOne({}, { $set: { registrationEnabled: false } });

  const app = express();
  app.use(express.json());
  app.use('/api', enforceSystemLifecycle);
  app.use('/api/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/password-setup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        newPassword: 'Client!Owner123',
        confirmPassword: 'Client!Owner123',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.requiresSignIn, true);
    assert.equal(body.data.token, null, 'password setup must not mint a staff JWT');

    const pendingCustomer = await User.create({
      name: 'Pending Customer',
      email: 'pending.customer@example.test',
      role: 'customer',
      isVerified: false,
      isActive: true,
      status: 'pending',
    });
    const customerToken = 'customer-setup-disabled-registration';
    await AccountSetupToken.create({
      userId: pendingCustomer._id,
      email: pendingCustomer.email,
      tokenHash: hashSetupToken(customerToken),
      expiresAt: new Date(Date.now() + 60_000),
      lastSentAt: new Date(),
    });
    const customerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/password-setup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customerToken,
        newPassword: 'Customer!Owner123',
        confirmPassword: 'Customer!Owner123',
      }),
    });
    const customerBody = await customerResponse.json();
    assert.equal(customerResponse.status, 403);
    assert.equal(customerBody.code, 'REGISTRATION_DISABLED');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  invited = await User.findById(invited._id)
    .select('+lastPasswordOtpSignInAt')
    .lean();
  assert.equal(invited.status, 'active');
  assert.equal(invited.isVerified, true);
  assert.match(invited.password, /^\$2[aby]\$/);
  assert.equal(invited.lastPasswordOtpSignInAt, null);

  const blocked = await createHandoverPreview({
    actor: actor(),
    targetUserId: invited._id,
  });
  assert.ok(blocked.blockers.some((entry) => entry.code === 'HANDOVER_TARGET_NOT_READY'));

  await assert.rejects(
    inviteHandoverCandidate({
      actor: actor(),
      body: { name: 'Client Owner', email: invited.email },
    }),
    (error) => error.code === 'HANDOVER_INVITATION_ACCOUNT_CONFLICT',
  );
});

test('durable external cleanup jobs retain failures and reconcile source operation status', async () => {
  const { default: ExternalCleanupJob } = await import('../models/externalCleanupJob.model.js');
  const { default: SystemOperation } = await import('../models/systemOperation.model.js');
  const source = await SystemOperation.create({
    kind: 'cleanup',
    action: 'clear_demo_data',
    status: 'completed_with_warnings',
    actor: actor(),
    planHash: 'external-cleanup-test-plan',
    warnings: ['1 external cleanup jobs are pending.'],
    completedAt: new Date(),
    receipt: { immutable: true },
  });
  const job = await ExternalCleanupJob.create({
    operationId: source._id,
    provider: 'firebase_auth',
    action: 'delete_identity',
    target: { uid: 'test-firebase-uid' },
    targetHash: 'firebase-test-target',
  });
  const pass = await processDueExternalCleanupJobs({ operationId: source._id });
  assert.equal(pass.processed, 1);
  const failed = await ExternalCleanupJob.findById(job._id).lean();
  assert.equal(failed.status, 'failed');
  const warningSource = await SystemOperation.findById(source._id).lean();
  assert.equal(warningSource.status, 'completed_with_warnings');
  assert.equal(warningSource.externalCleanup.failed, 1);
  assert.deepEqual(warningSource.receipt, { immutable: true });

  await ExternalCleanupJob.updateOne({ _id: job._id }, { $set: { status: 'completed', completedAt: new Date() } });
  await reconcileExternalCleanupOperation(source._id);
  const reconciled = await SystemOperation.findById(source._id).lean();
  assert.equal(reconciled.status, 'completed');
  assert.equal(reconciled.externalCleanup.remaining, 0);
  assert.deepEqual(reconciled.receipt, { immutable: true });
  await assert.rejects(
    SystemOperation.updateOne({ _id: source._id }, { $set: { receipt: { tampered: true } } }),
    (error) => error.code === 'SYSTEM_OPERATION_RECEIPT_IMMUTABLE',
  );
});

test('legacy reset is permanently gone and public status remains reachable', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/system', systemRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    const reset = await fetch(`http://127.0.0.1:${port}/api/system/reset`, { method: 'POST' });
    assert.equal(reset.status, 410);
    const resetBody = await reset.json();
    assert.equal(resetBody.code, 'LEGACY_SYSTEM_ENDPOINT_REMOVED');

    const status = await fetch(`http://127.0.0.1:${port}/api/system/status`);
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.equal(body.data.mode, 'development');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('staff hard delete uses the exhaustive surviving-reference manifest and requires archive fallback', async () => {
  const [
    { default: Billing },
    { default: ChatConversation },
    { default: ChatMessage },
    { default: InvoiceRecord },
    { default: NotificationUserState },
    { default: Order },
    { default: Payment },
    { default: Service },
    { default: Store },
    { default: SystemDataClassification },
    { default: SystemOperation },
  ] = await Promise.all([
    import('../models/billing.model.js'),
    import('../models/chatConversation.model.js'),
    import('../models/chatMessage.model.js'),
    import('../models/invoiceRecord.model.js'),
    import('../models/notificationUserState.model.js'),
    import('../models/order.model.js'),
    import('../models/payment.model.js'),
    import('../models/service.model.js'),
    import('../models/store.model.js'),
    import('../models/systemDataClassification.model.js'),
    import('../models/systemOperation.model.js'),
  ]);
  const staff = await User.create({
    name: 'Referenced Demo Sales',
    email: 'referenced.demo.sales@example.test',
    password: 'Referenced!Sales123',
    role: 'sales',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const old = new Date(0);
  const orderId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  const manifestByKey = Object.fromEntries(
    STAFF_SURVIVING_REFERENCE_MANIFEST.map((entry) => [entry.key, entry]),
  );
  assert.ok(manifestByKey.chatConversations.fields.includes('assignedSalesId'));
  assert.ok(manifestByKey.chatConversations.fields.includes('resolvedBy'));
  assert.ok(manifestByKey.chatConversations.fields.includes('internalNotes.authorId'));
  assert.deepEqual(manifestByKey.chatMessages.fields, ['senderId', 'userId']);
  assert.ok(manifestByKey.payments.fields.includes('statusHistory.changedBy'));
  assert.deepEqual(manifestByKey.billings.fields, ['lastEditedBy', 'events.userId']);
  assert.deepEqual(manifestByKey.systemBackups.fields, ['createdBy', 'verifiedBy']);

  await Promise.all([
    Order.collection.insertOne({
      _id: orderId,
      orderNumber: 'STAFF-REF-ORDER',
      customer: admin._id,
      assignedDetailer: staff._id,
      createdAt: old,
      updatedAt: old,
    }),
    Payment.collection.insertOne({
      invoiceId: 'STAFF-REF-PAYMENT',
      order: orderId,
      amount: 100,
      statusHistory: [{ changedBy: staff._id }],
      createdAt: old,
      updatedAt: old,
    }),
    ActivityLog.collection.insertOne({
      type: 'failed_login',
      title: 'Preserved staff audit',
      description: 'Authoritative evidence.',
      userId: staff._id,
      userName: staff.name,
      module: 'Auth',
      createdAt: old,
      updatedAt: old,
    }),
    Notification.collection.insertOne({
      _id: notificationId,
      title: 'Preserved staff notification',
      message: 'Reference fixture.',
      recipientUserId: staff._id,
      createdAt: old,
      updatedAt: old,
    }),
    NotificationUserState.collection.insertOne({
      notificationId,
      userId: staff._id,
      createdAt: old,
      updatedAt: old,
    }),
    ChatConversation.collection.insertMany([
      { conversationId: 'staff-ref-assigned', assignedSalesId: staff._id, createdAt: old, updatedAt: old },
      { conversationId: 'staff-ref-resolved', resolvedBy: staff._id, createdAt: old, updatedAt: old },
      {
        conversationId: 'staff-ref-note',
        internalNotes: [{ authorId: staff._id, text: 'Preserved note' }],
        createdAt: old,
        updatedAt: old,
      },
    ]),
    ChatMessage.collection.insertMany([
      { sessionId: 'staff-ref-sender', sender: 'sales', senderId: staff._id, message: 'Sender ref', createdAt: old, updatedAt: old },
      { sessionId: 'staff-ref-user', sender: 'user', userId: staff._id, message: 'User ref', createdAt: old, updatedAt: old },
    ]),
    Billing.collection.insertMany([
      { order: orderId, lastEditedBy: staff._id, createdAt: old, updatedAt: old },
      { order: new mongoose.Types.ObjectId(), events: [{ userId: staff._id, action: 'edited' }], createdAt: old, updatedAt: old },
    ]),
    InvoiceRecord.collection.insertOne({
      invoiceNumber: 'STAFF-REF-INVOICE',
      order: orderId,
      snapshot: {},
      createdBy: staff._id,
      createdAt: old,
      updatedAt: old,
    }),
    Service.collection.insertOne({ name: 'Staff-ref service', lastUpdatedBy: String(staff._id), createdAt: old, updatedAt: old }),
    Store.collection.insertOne({ name: 'Staff-ref store', manager: staff._id, createdAt: old, updatedAt: old }),
    SystemOperation.collection.insertOne({
      kind: 'cleanup',
      action: 'historical_staff_reference',
      status: 'completed',
      actor: { id: staff._id },
      planHash: 'historical-staff-reference',
      createdAt: old,
      updatedAt: old,
    }),
    SystemBackup.collection.insertMany([
      {
        formatVersion: 1,
        status: 'ready',
        createdBy: staff._id,
        dataFingerprint: 'staff-created-backup',
        createdAt: old,
        updatedAt: old,
      },
      {
        formatVersion: 1,
        status: 'verified',
        createdBy: admin._id,
        verifiedBy: staff._id,
        dataFingerprint: 'staff-verified-backup',
        createdAt: old,
        updatedAt: old,
      },
    ]),
    SystemDataClassification.create({
      collectionName: 'orders',
      documentId: new mongoose.Types.ObjectId(),
      dataEnvironment: 'production',
      classifiedAt: new Date(),
      classifiedBy: staff._id,
      source: 'manual',
      reviewed: true,
    }),
  ]);

  const blockedPreview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['staff'],
      selection: { staff: [String(staff._id)] },
    },
  });
  const blocker = blockedPreview.blockers.find((entry) => entry.code === 'STAFF_ARCHIVE_REQUIRED');
  assert.ok(blocker);
  const expectedReferences = {
    orders: 1,
    payments: 1,
    activity: 1,
    notifications: 1,
    notificationStates: 1,
    chatConversations: 3,
    chatMessages: 2,
    billings: 2,
    invoices: 1,
    services: 1,
    stores: 1,
    systemOperations: 1,
    systemBackups: 2,
    classifications: 1,
  };
  for (const [key, count] of Object.entries(expectedReferences)) {
    assert.equal(blocker.references[key], count, `unexpected ${key} reference count`);
  }
  assert.equal(blocker.referenceCount, 19);

  const archivePreview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['staff'],
      selection: { staff: [String(staff._id)] },
      staffFallback: 'archive',
    },
  });
  assert.equal(archivePreview.blockers.length, 0);
  assert.equal(archivePreview.counts.staffDelete, 0);
  assert.equal(archivePreview.counts.staffArchive, 1);

  const deletableStaff = await User.create({
    name: 'Planned-only Demo Sales',
    email: 'planned.only.demo.sales@example.test',
    password: 'Planned!Only123',
    role: 'sales',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const plannedOrder = await Order.create({
    orderNumber: 'PLANNED-STAFF-ORDER',
    customer: admin._id,
    assignedDetailer: deletableStaff._id,
  });
  const plannedPreview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['staff', 'orders'],
      selection: {
        staff: [String(deletableStaff._id)],
        orders: [String(plannedOrder._id)],
      },
    },
  });
  assert.equal(plannedPreview.blockers.length, 0);
  assert.equal(plannedPreview.counts.staffDelete, 1);
  assert.equal(plannedPreview.counts.staffArchive, 0);
});

test('customer and vehicle cleanup closes payment, chat, and demo activity aliases without dangling records', async () => {
  const [
    { default: ChatConversation },
    { default: ChatMessage },
    { default: Order },
    { default: Payment },
    { default: SystemOperation },
    { default: Vehicle },
  ] = await Promise.all([
    import('../models/chatConversation.model.js'),
    import('../models/chatMessage.model.js'),
    import('../models/order.model.js'),
    import('../models/payment.model.js'),
    import('../models/systemOperation.model.js'),
    import('../models/vehicle.model.js'),
  ]);
  const customer = await User.create({
    name: 'Closure Demo Customer',
    email: 'closure.demo.customer@example.test',
    password: 'Closure!Customer123',
    role: 'customer',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const vehicle = await Vehicle.create({
    customer: customer._id,
    make: 'Toyota',
    model: 'Vios',
    color: 'White',
    plateNumber: 'CLOSURE1',
  });
  const customerPaymentOrder = await Order.create({
    orderNumber: 'PAYMENT-CUSTOMER-CLOSURE',
    bookingReference: 'BOOKING-CUSTOMER-CLOSURE',
    customer: admin._id,
  });
  const vehiclePaymentOrder = await Order.create({
    orderNumber: 'PAYMENT-VEHICLE-CLOSURE',
    bookingReference: 'BOOKING-VEHICLE-CLOSURE',
    customer: admin._id,
  });
  const [customerPayment, vehiclePayment] = await Promise.all([
    Payment.create({
      invoiceId: 'PAYMENT-CUSTOMER-CLOSURE',
      order: customerPaymentOrder._id,
      customer: customer._id,
      amount: 500,
    }),
    Payment.create({
      invoiceId: 'PAYMENT-VEHICLE-CLOSURE',
      order: vehiclePaymentOrder._id,
      customer: admin._id,
      vehicle: vehicle._id,
      amount: 750,
    }),
  ]);
  const vehicleConversation = await ChatConversation.create({
    conversationId: 'vehicle-closure-conversation',
    userId: admin._id,
    vehicleId: vehicle._id,
  });
  const [directCustomerMessage, linkedConversationMessage] = await Promise.all([
    ChatMessage.create({
      sessionId: 'direct-customer-closure',
      userId: customer._id,
      sender: 'user',
      message: 'Delete through ChatMessage.userId.',
    }),
    ChatMessage.create({
      sessionId: 'vehicle-conversation-closure',
      conversationId: vehicleConversation.conversationId,
      sender: 'assistant',
      message: 'Delete through the vehicle conversation.',
    }),
  ]);
  const referenceActivityId = new mongoose.Types.ObjectId();
  await ActivityLog.collection.insertOne({
    _id: referenceActivityId,
    type: 'booking_updated',
    title: 'Order reference cleanup',
    description: 'Legacy top-level reference ID.',
    userName: admin.name,
    module: 'Booking',
    referenceId: String(customerPaymentOrder._id),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const aliasActivity = await ActivityLog.create({
    type: 'status_change',
    title: 'Booking alias cleanup',
    description: 'Booking reference alias.',
    userName: admin.name,
    module: 'Booking',
    metadata: { bookingRef: vehiclePaymentOrder.bookingReference },
  });
  const authoritativeAudit = await ActivityLog.create({
    type: 'access_denied',
    title: 'Preserved order security audit',
    description: 'Authoritative audit must survive even with an order alias.',
    userId: admin._id,
    userName: admin.name,
    module: 'System',
    metadata: { orderId: String(customerPaymentOrder._id) },
  });

  await Promise.all([
    classifyNewOperationalRecord({ collectionName: 'customers', documentId: customer._id, label: customer.name }),
    classifyNewOperationalRecord({ collectionName: 'vehicles', documentId: vehicle._id, label: vehicle.plateNumber }),
    classifyNewOperationalRecord({ collectionName: 'orders', documentId: customerPaymentOrder._id, label: customerPaymentOrder.orderNumber }),
    classifyNewOperationalRecord({ collectionName: 'orders', documentId: vehiclePaymentOrder._id, label: vehiclePaymentOrder.orderNumber }),
    classifyNewOperationalRecord({
      collectionName: 'chat_conversations',
      documentId: vehicleConversation._id,
      label: vehicleConversation.conversationId,
    }),
    classifyNewOperationalRecord({ collectionName: 'activity', documentId: referenceActivityId, label: 'Order reference cleanup' }),
    classifyNewOperationalRecord({ collectionName: 'activity', documentId: aliasActivity._id, label: aliasActivity.title }),
  ]);

  const { backup, artifact } = await createEncryptedBackup({
    actor: actor(),
    passphrase: 'Dependency Closure!Backup123',
    includeAssets: false,
  });
  await acknowledgeBackup({
    backupId: backup._id,
    checksum: backup.checksum,
    actorId: admin._id,
  });
  assert.ok(artifact.length > 0);

  const preview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'clear_demo_data',
      categories: ['customers'],
      selection: { customers: [String(customer._id)] },
    },
  });
  assert.equal(preview.blockers.length, 0);
  assert.equal(preview.counts.orders, 2);
  assert.equal(preview.counts.payments, 2);
  assert.equal(preview.counts.chat_conversations, 1);
  assert.equal(preview.counts.chatMessages, 2);
  assert.equal(preview.counts.activity, 2);
  const storedPreview = await SystemOperation.findById(preview.previewId).lean();
  assert.ok(storedPreview.plan.ids.orders.includes(String(customerPaymentOrder._id)));
  assert.ok(storedPreview.plan.ids.orders.includes(String(vehiclePaymentOrder._id)));
  assert.ok(storedPreview.plan.ids.chatMessages.includes(String(directCustomerMessage._id)));
  assert.ok(storedPreview.plan.ids.chatMessages.includes(String(linkedConversationMessage._id)));
  assert.ok(storedPreview.plan.ids.activity.includes(String(referenceActivityId)));
  assert.ok(storedPreview.plan.ids.activity.includes(String(aliasActivity._id)));
  assert.ok(!storedPreview.plan.ids.activity.includes(String(authoritativeAudit._id)));

  const completed = await executeCleanup({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      backupId: backup._id,
      password: ADMIN_PASSWORD,
      phrase: 'CLEAR DEMO DATA',
      idempotencyKey: 'dependency-closure-cleanup-1',
    },
  });
  assert.ok(['completed', 'completed_with_warnings'].includes(completed.status));
  assert.equal(await User.exists({ _id: customer._id }), null);
  assert.equal(await Vehicle.exists({ _id: vehicle._id }), null);
  assert.equal(await Order.countDocuments({
    _id: { $in: [customerPaymentOrder._id, vehiclePaymentOrder._id] },
  }), 0);
  assert.equal(await Payment.countDocuments({
    $or: [
      { _id: { $in: [customerPayment._id, vehiclePayment._id] } },
      { customer: customer._id },
      { vehicle: vehicle._id },
      { order: { $in: [customerPaymentOrder._id, vehiclePaymentOrder._id] } },
    ],
  }), 0);
  assert.equal(await ChatConversation.exists({ _id: vehicleConversation._id }), null);
  assert.equal(await ChatMessage.countDocuments({
    _id: { $in: [directCustomerMessage._id, linkedConversationMessage._id] },
  }), 0);
  assert.equal(await ActivityLog.countDocuments({
    _id: { $in: [referenceActivityId, aliasActivity._id] },
  }), 0);
  assert.ok(await ActivityLog.exists({ _id: authoritativeAudit._id }));
});
