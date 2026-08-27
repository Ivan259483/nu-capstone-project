import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'system_lifecycle_inventory_firebase_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';

const { default: ActivityLog } = await import('../models/activityLog.model.js');
const { default: ExternalCleanupJob } = await import('../models/externalCleanupJob.model.js');
const { default: Product } = await import('../models/product.model.js');
const { default: SystemBackup } = await import('../models/systemBackup.model.js');
const { default: SystemOperation } = await import('../models/systemOperation.model.js');
const { default: SystemState } = await import('../models/systemState.model.js');
const { default: User } = await import('../models/user.model.js');
const {
  consumeInventory,
  createProduct,
  deleteProduct,
  updateProduct,
} = await import('../controllers/product.controller.js');
const {
  createCleanupPreview,
  executeCleanup,
} = await import('../services/systemCleanup.service.js');
const {
  buildLifecyclePlan,
  createHandoverPreview,
  enqueueFirebaseSessionRevocations,
  executeHandover,
} = await import('../services/systemLifecycle.service.js');
const {
  processDueExternalCleanupJobs,
  processExternalCleanupJob,
} = await import('../services/systemExternalCleanup.service.js');
const {
  buildInventoryBaselineMetadata,
  initializeProtectedAdministrator,
} = await import('../services/systemState.service.js');

const ADMIN_EMAIL = 'ivantadena18@gmail.com';
const ADMIN_PASSWORD = 'System!Management123';

let replSet;
let admin;

const actor = () => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role,
});

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri('autospf-system-lifecycle-inventory-firebase-test'));
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

const createCommittedOperation = async ({ kind, action, warning = null }) => SystemOperation.create({
  kind,
  action,
  status: warning ? 'completed_with_warnings' : 'completed',
  actor: actor(),
  planHash: `${kind}-${action}-${new mongoose.Types.ObjectId()}`,
  warnings: warning ? [warning] : [],
  completedAt: new Date(),
  receipt: { action, committed: true },
});

const persistBaseline = async (products) => {
  const turnover = await createCommittedOperation({ kind: 'turnover', action: 'turnover' });
  const verifiedAt = new Date();
  const entries = products
    .filter((product) => product.isActive !== false)
    .map((product) => ({ productId: product._id, quantity: Number(product.inventory || 0) }));
  const inventoryBaseline = buildInventoryBaselineMetadata(entries, {
    turnoverOperationId: turnover._id,
    capturedAt: verifiedAt,
  });
  await SystemState.updateOne(
    {},
    {
      $set: {
        turnoverCompletedAt: verifiedAt,
        inventoryBaselineVerifiedAt: verifiedAt,
        inventoryBaseline,
      },
    },
    { runValidators: true },
  );
  return inventoryBaseline;
};

const invokeController = (controller, req) => new Promise((resolve, reject) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      resolve({ statusCode: this.statusCode, body });
      return this;
    },
  };
  Promise.resolve(controller(req, res, reject)).catch(reject);
});

const waitForActivityWrites = async (minimum) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [activityCount, classificationCount] = await Promise.all([
      ActivityLog.countDocuments({}),
      mongoose.connection.db.collection('systemdataclassifications')
        .countDocuments({ collectionName: 'activity' }),
    ]);
    if (activityCount >= minimum && classificationCount >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${minimum} activity log writes.`);
};

const waitFor = async (work, message) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await work();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
};

const assertBaselineInvalidated = (state) => {
  assert.equal(state.inventoryBaselineVerifiedAt, null);
  assert.ok(state.inventoryBaseline, 'the reviewed baseline metadata must remain auditable');
  assert.ok(state.inventoryBaseline.invalidatedAt);
  assert.equal(state.inventoryBaseline.invalidationReason, 'active_product_catalog_changed');
};

test('turnover execution persists the reviewed baseline in SystemState and its immutable receipt', async () => {
  const product = await Product.create({
    name: 'Turnover Baseline Product',
    price: 120,
    inventory: 2,
    minLevel: 0,
  });
  const preview = await createCleanupPreview({
    actor: actor(),
    body: {
      operationType: 'turnover',
      openingInventory: [{ productId: String(product._id), quantity: 15 }],
    },
  });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.requiresBackup, true);

  const storedPreview = await SystemOperation.findById(preview.previewId).lean();
  const backup = await SystemBackup.create({
    status: 'verified',
    purpose: 'lifecycle',
    includeAssetsRequested: true,
    lifecycleEligible: true,
    createdBy: admin._id,
    verifiedBy: admin._id,
    dataFingerprint: storedPreview.dataFingerprint,
    checksum: 'a'.repeat(64),
    artifactSize: 1024,
    downloadVerifiedAt: new Date(),
    snapshotCatalogHash: 'b'.repeat(64),
    snapshotCompletedAt: new Date(),
    assetCoverage: {
      requested: true,
      managed: 0,
      included: 0,
      managedUnresolved: 0,
      legacyUnresolved: 0,
      unresolved: 0,
      complete: true,
      snapshotManifestHash: 'c'.repeat(64),
    },
  });
  const completed = await executeCleanup({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      backupId: backup._id,
      password: ADMIN_PASSWORD,
      phrase: 'PREPARE AUTOSPF',
      idempotencyKey: 'persist-turnover-inventory-baseline',
    },
  });
  assert.ok(['completed', 'completed_with_warnings'].includes(completed.status));

  const [state, operation, updatedProduct] = await Promise.all([
    SystemState.findOne({}).lean(),
    SystemOperation.findById(preview.previewId).lean(),
    Product.findById(product._id).lean(),
  ]);
  assert.equal(String(state.inventoryBaseline.turnoverOperationId), preview.previewId);
  assert.equal(state.inventoryBaseline.productCount, 1);
  assert.equal(String(state.inventoryBaseline.products[0].productId), String(product._id));
  assert.equal(state.inventoryBaseline.products[0].openingQuantity, 15);
  assert.equal(operation.receipt.inventoryBaseline.products[0].openingQuantity, 15);
  assert.equal(updatedProduct.inventory, 15);
  assert.ok(state.inventoryBaselineVerifiedAt);

  // Join the post-commit pass so the next test cannot drop the database while
  // its durable admission ticket is still being released.
  await processDueExternalCleanupJobs({ operationId: operation._id });
});

test('production readiness binds turnover to the exact active product set', async () => {
  const product = await Product.create({
    name: 'Opening Stock Product',
    price: 100,
    inventory: 12,
    minLevel: 0,
  });
  const baseline = await persistBaseline([product]);

  let plan = await buildLifecyclePlan('enter_production');
  assert.equal(
    plan.blockers.some((blocker) => blocker.code === 'INVENTORY_BASELINE_STALE'),
    false,
  );
  assert.equal(plan.preserved.inventoryBaseline.productCount, 1);
  assert.equal(plan.preserved.inventoryBaseline.productSetHash, baseline.productSetHash);

  product.inventory = 8;
  await product.save();
  plan = await buildLifecyclePlan('enter_production');
  assert.equal(
    plan.blockers.some((blocker) => blocker.code === 'INVENTORY_BASELINE_STALE'),
    false,
    'normal stock consumption must not invalidate a product-set baseline',
  );

  await Product.create({ name: 'Unreviewed Active Product', price: 50, inventory: 1, minLevel: 0 });
  plan = await buildLifecyclePlan('enter_production');
  assert.ok(
    plan.blockers.some((blocker) => blocker.code === 'INVENTORY_BASELINE_STALE'),
    'an active product added outside the controller must still fail authoritative readiness checks',
  );
});

test('catalog create, delete, and activation invalidate the baseline but stock consumption does not', async () => {
  const primary = await Product.create({
    name: 'Primary Product',
    price: 100,
    inventory: 10,
    minLevel: 0,
  });
  await persistBaseline([primary]);

  await invokeController(consumeInventory, {
    body: {
      productId: String(primary._id),
      quantity: 1,
      userId: String(admin._id),
      userName: admin.name,
    },
    user: actor(),
  });
  let state = await SystemState.findOne({}).lean();
  assert.ok(state.inventoryBaselineVerifiedAt);
  assert.ok(state.inventoryBaseline);

  const created = await invokeController(createProduct, {
    body: {
      name: 'Created Active Product',
      price: 75,
      inventory: 3,
      minLevel: 0,
    },
    user: actor(),
  });
  assert.equal(created.statusCode, 201);
  state = await SystemState.findOne({}).lean();
  assertBaselineInvalidated(state);

  const createdProduct = await Product.findById(created.body.data._id);
  await persistBaseline([primary, createdProduct]);
  const deleted = await invokeController(deleteProduct, {
    params: { id: String(createdProduct._id) },
    user: actor(),
  });
  assert.equal(deleted.statusCode, 200);
  state = await SystemState.findOne({}).lean();
  assertBaselineInvalidated(state);

  const inactive = await Product.create({
    name: 'Inactive Product',
    price: 40,
    inventory: 2,
    minLevel: 0,
    isActive: false,
  });
  await persistBaseline([primary, inactive]);
  const activated = await invokeController(updateProduct, {
    params: { id: String(inactive._id) },
    body: { isActive: true },
    user: actor(),
  });
  assert.equal(activated.statusCode, 200);
  state = await SystemState.findOne({}).lean();
  assertBaselineInvalidated(state);
  await waitForActivityWrites(4);
});

test('handover revocation starts after lease release and reconciles the source operation', async () => {
  admin.firebaseUid = 'firebase-outgoing-admin';
  await admin.save({ validateBeforeSave: false });
  const target = await User.create({
    name: 'Client Administrator',
    email: 'client.firebase@example.test',
    password: 'Client!Firebase123',
    role: 'office_admin',
    isVerified: true,
    isActive: true,
    status: 'active',
    firebaseUid: 'firebase-client-admin',
  });
  target.lastPasswordOtpSignInAt = new Date();
  await target.save({ validateBeforeSave: false });

  const preview = await createHandoverPreview({
    actor: actor(),
    targetUserId: target._id,
  });
  assert.equal(preview.blockers.length, 0);
  const calls = [];
  const completed = await executeHandover({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      password: ADMIN_PASSWORD,
      phrase: 'TRANSFER AUTOSPF ADMIN',
      idempotencyKey: 'handover-firebase-revocation-ordering',
    },
    firebaseAuth: {
      async revokeRefreshTokens(uid) {
        const state = await SystemState.findOne({}).lean();
        assert.equal(
          state.mutationLease?.operationId || null,
          null,
          'provider revocation must not start until the destructive lease is released',
        );
        calls.push(uid);
      },
    },
  });
  assert.equal(completed.status, 'completed_with_warnings');

  const source = await waitFor(async () => {
    const operation = await SystemOperation.findById(completed.previewId).lean();
    return operation?.status === 'completed' ? operation : null;
  }, 'Timed out waiting for handover revocation reconciliation.');
  assert.deepEqual(calls.sort(), ['firebase-client-admin', 'firebase-outgoing-admin']);
  assert.equal(source.externalCleanup.remaining, 0);
  assert.deepEqual(source.warnings, []);
  assert.equal(
    await ExternalCleanupJob.countDocuments({ operationId: source._id, status: 'completed' }),
    2,
  );
});

test('archive Firebase revocations are durable, retryable, and the archived exception is source-bound', async () => {
  admin.firebaseUid = 'firebase-protected-admin';
  await admin.save({ validateBeforeSave: false });
  await User.create({
    name: 'Firebase Office Admin',
    email: 'firebase.office@example.test',
    password: 'Firebase!Office123',
    role: 'office_admin',
    isVerified: true,
    isActive: true,
    status: 'active',
    firebaseUid: 'firebase-office-admin',
  });
  const source = await createCommittedOperation({
    kind: 'lifecycle',
    action: 'archive',
    warning: '2 external cleanup job(s) are pending for Firebase session revocation.',
  });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const queued = await enqueueFirebaseSessionRevocations({
        operationId: source._id,
        reason: 'final_archive',
        session,
      });
      assert.equal(queued, 2);
    });
  } finally {
    await session.endSession();
  }
  await SystemState.updateOne({}, {
    $set: {
      mode: 'archived',
      registrationEnabled: false,
      bookingsEnabled: false,
    },
  });

  const calls = [];
  const firstPass = await processDueExternalCleanupJobs({
    operationId: source._id,
    allowArchivedSessionRevocations: true,
    firebaseAuth: {
      async revokeRefreshTokens(uid) {
        calls.push(uid);
        if (uid === 'firebase-protected-admin') throw new Error('temporary provider outage');
      },
    },
  });
  assert.equal(firstPass.processed, 2);
  assert.deepEqual(calls.sort(), ['firebase-office-admin', 'firebase-protected-admin']);
  assert.equal(await ExternalCleanupJob.countDocuments({ operationId: source._id, status: 'failed' }), 1);
  let reconciledSource = await SystemOperation.findById(source._id).lean();
  assert.equal(reconciledSource.status, 'completed_with_warnings');
  assert.equal(reconciledSource.externalCleanup.remaining, 1);

  await ExternalCleanupJob.updateMany(
    { operationId: source._id, status: 'failed' },
    { $set: { nextAttemptAt: new Date(0) } },
  );
  const retryPass = await processDueExternalCleanupJobs({
    operationId: source._id,
    allowArchivedSessionRevocations: true,
    firebaseAuth: { revokeRefreshTokens: async () => {} },
  });
  assert.equal(retryPass.processed, 1);
  reconciledSource = await SystemOperation.findById(source._id).lean();
  assert.equal(reconciledSource.status, 'completed');
  assert.equal(reconciledSource.externalCleanup.remaining, 0);
  assert.deepEqual(reconciledSource.warnings, []);
  assert.deepEqual(reconciledSource.receipt, { action: 'archive', committed: true });

  const ordinarySource = await createCommittedOperation({
    kind: 'cleanup',
    action: 'clear_demo_data',
    warning: '1 external cleanup job is pending.',
  });
  const ordinaryJob = await ExternalCleanupJob.create({
    operationId: ordinarySource._id,
    provider: 'firebase_auth',
    action: 'delete_identity',
    target: { uid: 'must-not-run-while-archived' },
    targetHash: 'ordinary-archived-job',
  });
  await assert.rejects(
    processExternalCleanupJob(ordinaryJob._id, {
      allowArchivedSessionRevocation: true,
      firebaseAuth: { deleteUser: async () => assert.fail('ordinary archived job ran') },
    }),
    (error) => error.code === 'SYSTEM_ARCHIVED',
  );
  assert.equal((await ExternalCleanupJob.findById(ordinaryJob._id).lean()).status, 'pending');
});
