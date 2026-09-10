/**
 * staleAdministratorBinding.test.js
 *
 * Isolated tests for the staleAdministratorBinding.service.js recovery mechanism.
 *
 * Uses an in-memory MongoDB instance (mongodb-memory-server) so NO production
 * data is ever touched.  Each test gets a clean database state.
 *
 * Tests:
 *  1. stale ID + zero admins → recovery clears to null
 *  2. stale ID resolves to existing user → recovery refused
 *  3. Administrator already exists → stale recovery refused
 *  4. Expected stale ID changes before write (CAS fails) → operation fails closed
 *  5. Customer cannot be promoted via this recovery path
 *  6. Arbitrary email cannot abuse the recovery path
 *  7. Stale recovery is idempotent (already null → no-op)
 *  8. Wrong expected stale ID → refused
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Force test environment to prevent any production safeguards that key on NODE_ENV
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'stale_binding_test_secret_32_chars!!';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

// Import models and service AFTER setting env vars
const { default: SystemState, SYSTEM_STATE_KEY } = await import('../models/systemState.model.js');
const { default: User } = await import('../models/user.model.js');
const {
  inspectStaleAdministratorBinding,
  reconcileStaleAdministratorBinding,
} = await import('../services/staleAdministratorBinding.service.js');

// ─── Test Fixtures ───────────────────────────────────────────────────────────

// The exact stale ID used in this production incident.
const KNOWN_STALE_ID = '69e95742b5d5b813fd407f01';

// A different ObjectId that is NOT the stale one in production.
const DIFFERENT_ID = '000000000000000000000001';

/**
 * Build a minimal SystemState document with the given protectedAdministratorId.
 */
const seedSystemState = async (protectedAdministratorId = null) => {
  await SystemState.deleteMany({});
  return SystemState.create({
    key: SYSTEM_STATE_KEY,
    mode: 'development',
    protectedAdministratorId: protectedAdministratorId
      ? new mongoose.Types.ObjectId(protectedAdministratorId)
      : null,
    revision: 5,
  });
};

/**
 * Seed a minimal User document with the given role.
 */
const seedUser = async ({ role = 'customer', emailSuffix = 'test', overrides = {} } = {}) => User.create({
  name: `Test ${role} ${emailSuffix}`,
  email: `${role}.${emailSuffix}@stale-binding.test`,
  password: 'TestPassword!123',
  role,
  isVerified: true,
  isActive: true,
  status: 'active',
  isFirstLogin: false,
  ...overrides,
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    instance: {
      // Force the in-memory DB name to 'autospf' so the target-database guard passes.
      dbName: 'autospf',
    },
  });
  await mongoose.connect(mongo.getUri('autospf'), { serverSelectionTimeoutMS: 10_000 });
});

beforeEach(async () => {
  // Clear all relevant collections before each test to ensure isolation.
  await SystemState.deleteMany({});
  await User.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

// ─── Test 1: stale ID + zero admins → recovery clears to null ────────────────

test('1. stale ID + zero admins → reconcileStaleAdministratorBinding clears to null', async () => {
  await seedSystemState(KNOWN_STALE_ID);
  // No users seeded → adminCount = 0.

  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(inspection.canReconcile, true, 'Inspection should permit reconciliation');
  assert.equal(inspection.staleUserExists, false);
  assert.equal(inspection.administratorCount, 0);
  assert.equal(inspection.storedMatchesExpected, true);

  const result = await reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(result.reconciled, true, 'Reconciliation should succeed');
  assert.equal(result.alreadyClear, false);
  assert.equal(result.previousStaleId, KNOWN_STALE_ID);
  assert.equal(result.newProtectedAdministratorId, null);

  // Verify the DB was actually updated.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(state.protectedAdministratorId, null, 'protectedAdministratorId must be null after reconciliation');
  assert.equal(state.revision, 6, 'Revision must have been incremented by 1');
});

// ─── Test 2: stale ID resolves to existing user → refused ────────────────────

test('2. stale ID resolves to existing user → reconciliation refused', async () => {
  // Create a user whose _id IS the stale ID, simulating a "non-stale" binding.
  const existingUser = await User.create({
    _id: new mongoose.Types.ObjectId(KNOWN_STALE_ID),
    name: 'Active Admin',
    email: 'active.admin@stale-binding.test',
    password: 'TestPassword!123',
    role: 'administrator',
    isVerified: true,
    isActive: true,
    status: 'active',
    isFirstLogin: false,
  });
  await seedSystemState(KNOWN_STALE_ID);

  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(inspection.canReconcile, false);
  assert.equal(inspection.staleUserExists, true);
  assert.equal(inspection.reasonCode, 'STALE_USER_STILL_EXISTS');

  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID }),
    (error) => {
      assert.equal(error.code, 'STALE_USER_STILL_EXISTS');
      return true;
    },
    'Should reject when the stale ID still resolves to an existing user',
  );

  // Verify DB was NOT modified.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(String(state.protectedAdministratorId), KNOWN_STALE_ID, 'protectedAdministratorId must remain unchanged');
  assert.equal(state.revision, 5, 'Revision must NOT have been incremented');

  await existingUser.deleteOne();
});

// ─── Test 3: Administrator already exists → refused ───────────────────────────

test('3. Administrator already exists → stale recovery refused', async () => {
  // Seed a different administrator (not the stale ID, so it is a "real" admin in the system).
  await seedUser({ role: 'administrator', emailSuffix: 'existing' });
  // SystemState still has the stale ID (but the stale user doesn't exist).
  await seedSystemState(KNOWN_STALE_ID);

  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(inspection.canReconcile, false);
  assert.equal(inspection.administratorCount, 1);
  assert.equal(inspection.reasonCode, 'ADMINISTRATOR_EXISTS');

  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID }),
    (error) => {
      assert.equal(error.code, 'ADMINISTRATOR_EXISTS');
      return true;
    },
    'Should reject when an administrator already exists',
  );

  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(String(state.protectedAdministratorId), KNOWN_STALE_ID);
  assert.equal(state.revision, 5);
});

// ─── Test 4: CAS fails if the stored protectedAdministratorId changes before write

test('4. expected stale ID changes before write → CAS fails closed', async () => {
  await seedSystemState(KNOWN_STALE_ID);

  // Snapshot the inspection — confirms canReconcile: true at this moment.
  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(inspection.canReconcile, true);
  assert.equal(inspection.revision, 5);

  // Simulate a concurrent process that replaced the stored protectedAdministratorId
  // with a *different* ObjectId before our reconcile write lands.
  const NEW_CONCURRENT_ID = '000000000000000000000099';
  await SystemState.updateOne(
    { key: SYSTEM_STATE_KEY },
    {
      $set: { protectedAdministratorId: new mongoose.Types.ObjectId(NEW_CONCURRENT_ID) },
      $inc: { revision: 1 },
    },
  );

  // Now reconcile with the original stale ID — the service re-inspects first and
  // sees STALE_ID_MISMATCH (stored is now NEW_CONCURRENT_ID, not KNOWN_STALE_ID).
  // Either STALE_ID_MISMATCH or CAS_FAILED means the service failed closed.
  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID }),
    (error) => {
      const failedClosed = ['STALE_ID_MISMATCH', 'CAS_FAILED', 'RECONCILE_REFUSED'].includes(error.code);
      assert.ok(failedClosed, `Expected fail-closed error but got ${error.code}: ${error.message}`);
      return true;
    },
    'Should reject fail-closed when stored protectedAdministratorId changed before write',
  );

  // Verify DB was NOT cleared by our reconcile attempt.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.notEqual(state.protectedAdministratorId, null, 'protectedAdministratorId must not be null after fail-closed rejection');
  assert.equal(String(state.protectedAdministratorId), NEW_CONCURRENT_ID);
  assert.equal(state.revision, 6, 'Revision must reflect only the concurrent write');
});

// ─── Test 5: Customer cannot be promoted via recovery path ───────────────────

test('5. Customer account cannot be promoted via stale binding recovery', async () => {
  // Seed a customer user and the stale system state.
  const customer = await seedUser({ role: 'customer', emailSuffix: 'customer' });
  await seedSystemState(KNOWN_STALE_ID);

  // The recovery service only clears protectedAdministratorId to null.
  // It has no mechanism to change a user's role.
  const result = await reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(result.reconciled, true);

  // Customer must remain unchanged.
  const reloaded = await User.findById(customer._id);
  assert.equal(reloaded.role, 'customer', 'Customer role must not change during stale binding recovery');
  assert.equal(reloaded.email, customer.email, 'Customer email must not change');
  assert.equal(String(reloaded._id), String(customer._id), 'Customer _id must not change');

  // SystemState protectedAdministratorId must be null, not set to the customer's id.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(state.protectedAdministratorId, null, 'protectedAdministratorId must be null, never set to a customer id');
});

// ─── Test 6: Arbitrary email cannot abuse the recovery path ──────────────────

test('6. arbitrary email cannot abuse the recovery path (service only accepts ObjectIds)', async () => {
  await seedSystemState(KNOWN_STALE_ID);

  // Try to pass an email address as expectedStaleId — must be rejected immediately.
  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: 'attacker@evil.test' }),
    (error) => {
      assert.equal(error.code, 'INVALID_OBJECT_ID');
      return true;
    },
    'Service must reject non-ObjectId expectedStaleId values',
  );

  // Try a random-looking string.
  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: 'arbitrary-string-that-is-not-an-objectid' }),
    (error) => {
      assert.equal(error.code, 'INVALID_OBJECT_ID');
      return true;
    },
  );

  // Try an empty string.
  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: '' }),
    (error) => {
      assert.equal(error.code, 'INVALID_OBJECT_ID');
      return true;
    },
  );

  // Try undefined.
  await assert.rejects(
    () => reconcileStaleAdministratorBinding({}),
    (error) => {
      assert.equal(error.code, 'INVALID_OBJECT_ID');
      return true;
    },
  );

  // DB must be untouched.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(String(state.protectedAdministratorId), KNOWN_STALE_ID);
  assert.equal(state.revision, 5);
});

// ─── Test 7: Idempotent — already null → no-op ───────────────────────────────

test('7. stale recovery is idempotent when protectedAdministratorId is already null', async () => {
  await seedSystemState(null); // Already cleared.

  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(inspection.alreadyClear, true);
  assert.equal(inspection.canReconcile, false);
  assert.equal(inspection.reasonCode, 'ALREADY_CLEAR');

  const result = await reconcileStaleAdministratorBinding({ expectedStaleId: KNOWN_STALE_ID });
  assert.equal(result.reconciled, false);
  assert.equal(result.alreadyClear, true);
  assert.equal(result.status, 'ALREADY_CLEAR');

  // DB must be untouched.
  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(state.protectedAdministratorId, null);
  assert.equal(state.revision, 5, 'Revision must not be incremented for a no-op');
});

// ─── Test 8: Wrong expected stale ID → refused ───────────────────────────────

test('8. wrong expected stale ID → reconciliation refused without modifying state', async () => {
  await seedSystemState(KNOWN_STALE_ID);

  // Provide a different (but valid) ObjectId that does NOT match the stored value.
  const inspection = await inspectStaleAdministratorBinding({ expectedStaleId: DIFFERENT_ID });
  assert.equal(inspection.canReconcile, false);
  assert.equal(inspection.storedMatchesExpected, false);
  assert.equal(inspection.reasonCode, 'STALE_ID_MISMATCH');

  await assert.rejects(
    () => reconcileStaleAdministratorBinding({ expectedStaleId: DIFFERENT_ID }),
    (error) => {
      assert.equal(error.code, 'STALE_ID_MISMATCH');
      return true;
    },
    'Should reject when expectedStaleId does not match stored protectedAdministratorId',
  );

  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY });
  assert.equal(String(state.protectedAdministratorId), KNOWN_STALE_ID, 'protectedAdministratorId must remain the original stale ID');
  assert.equal(state.revision, 5, 'Revision must NOT be incremented');
});
