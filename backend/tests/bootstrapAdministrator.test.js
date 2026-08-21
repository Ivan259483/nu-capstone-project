import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'bootstrap_administrator_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_bootstrap_administrator';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.CLIENT_URL ||= 'https://portal.custom-domain.test';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
const resendRequests = [];
const deliveredEmails = [];
let failResendDelivery = false;
let terminalizeBootstrapOperationDuringDelivery = false;
let blockNextResendDelivery = false;
let notifyBlockedResendStarted = null;
let releaseBlockedResend = null;

const holdNextResendRequest = () => {
  blockNextResendDelivery = true;
  const started = new Promise((resolve) => {
    notifyBlockedResendStarted = resolve;
  });
  return {
    started,
    release: () => releaseBlockedResend?.(),
  };
};

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    const payload = JSON.parse(String(init?.body || '{}'));
    resendRequests.push(payload);

    if (blockNextResendDelivery) {
      blockNextResendDelivery = false;
      await new Promise((resolve) => {
        releaseBlockedResend = resolve;
        notifyBlockedResendStarted?.();
      });
      notifyBlockedResendStarted = null;
      releaseBlockedResend = null;
    }

    if (terminalizeBootstrapOperationDuringDelivery) {
      terminalizeBootstrapOperationDuringDelivery = false;
      await SystemBootstrapOperation.updateOne(
        { status: 'in_progress' },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            leaseExpiresAt: null,
          },
        },
      );
    }

    if (failResendDelivery) {
      return new Response(JSON.stringify({ message: 'Simulated Resend outage' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    deliveredEmails.push(payload);
    return new Response(JSON.stringify({ id: `bootstrap_email_${deliveredEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return nativeFetch(input, init);
};

const { config } = await import('../config/environment.js');
const {
  STAFF_2FA_AUTH_LEVEL,
} = await import('../constants/roles.js');
const { default: OTP } = await import('../models/oTP.model.js');
const { default: StaffVerificationIssuance } = await import('../models/staffVerificationIssuance.model.js');
const { default: StaffVerificationToken } = await import('../models/staffVerificationToken.model.js');
const { default: SystemBootstrapOperation } = await import('../models/systemBootstrapOperation.model.js');
const { default: User } = await import('../models/user.model.js');
const {
  ADMINISTRATOR_PROVISION_OPERATION_KEY,
  inspectBootstrapAdministrator,
  migrateBootstrapAdministratorEmail,
  provisionBootstrapAdministrator,
  resendBootstrapAdministratorVerification,
} = await import('../services/bootstrapAdministrator.service.js');
const {
  consumeStaffVerificationToken,
  hashStaffVerificationToken,
  issueStaffVerificationLink,
} = await import('../services/staffVerification.service.js');
const { migrateLegacyUserRoles } = await import('../utils/migrateLegacyUserRoles.utils.js');
const { authenticate, authorize } = await import('../middleware/auth.middleware.js');
const authRoutes = (await import('../routes/auth.routes.js')).default;

const PROVISION_EMAIL = 'bootstrap.owner@custom-domain.test';
const PROVISION_NAME = 'Bootstrap Owner';
const PROVISION_PASSWORD = 'N3w!BootstrapOwner';

let mongo;
let server;
let baseUrl;

const requestJson = async (path, { token, ...options } = {}) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
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

const postJson = (path, body, token) => requestJson(path, {
  method: 'POST',
  body: JSON.stringify(body),
  token,
});

const latestEmailPayload = () => {
  assert.ok(deliveredEmails.length > 0, 'expected a delivered Resend email');
  return deliveredEmails.at(-1);
};

const latestOtpCode = (expectedEmail) => {
  const normalized = String(expectedEmail || '').trim().toLowerCase();
  const payload = [...deliveredEmails].reverse().find((entry) => {
    const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
    return recipients.some((recipient) => String(recipient || '').toLowerCase() === normalized)
      && /\b\d{6}\b/.test(String(entry.text || ''));
  });
  assert.ok(payload, `expected an OTP email for ${expectedEmail}`);
  return String(payload.text).match(/\b(\d{6})\b/)[1];
};

const emailRecipient = (payload) => Array.isArray(payload?.to) ? payload.to[0] : payload?.to;

const latestStaffVerificationToken = () => {
  const payload = latestEmailPayload();
  const content = `${payload.html || ''}\n${payload.text || ''}`;
  const match = content.match(/verify-account\?token=([^\s"<&]+)/);
  assert.ok(match?.[1], 'verification email must contain an opaque link token');
  return decodeURIComponent(match[1]);
};

const provisionPlan = (
  targetEmail = PROVISION_EMAIL,
  name = PROVISION_NAME,
  initialPassword = PROVISION_PASSWORD,
) => inspectBootstrapAdministrator({
  mode: 'provision',
  targetEmail,
  name,
  initialPassword,
});

const provisionFromPlan = (plan, overrides = {}) => provisionBootstrapAdministrator({
  targetEmail: plan.targetEmail,
  name: PROVISION_NAME,
  initialPassword: PROVISION_PASSWORD,
  confirmationToken: plan.confirmationToken,
  ...overrides,
});

const rawUserSnapshot = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  email: doc.email,
  password: doc.password,
  role: doc.role,
  phone: doc.phone,
  address: doc.address,
  avatar: doc.avatar,
  firebaseUid: doc.firebaseUid,
  referralCode: doc.referralCode,
  isVerified: doc.isVerified,
  isActive: doc.isActive,
  isDeleted: doc.isDeleted,
  status: doc.status,
  authVersion: Number(doc.authVersion || 0),
  version: Number(doc.__v || 0),
  loginAttempts: doc.loginAttempts,
  lockUntil: doc.lockUntil ? new Date(doc.lockUntil).toISOString() : null,
  createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
});

const readRawUser = (id) => User.collection.findOne({ _id: id });

const seedAdministrator = (overrides = {}) => User.create({
  name: 'Existing Administrator',
  email: 'existing.administrator@custom-domain.test',
  password: 'Existing!AdminPass1',
  role: 'administrator',
  isVerified: true,
  isActive: true,
  isDeleted: false,
  status: 'active',
  isFirstLogin: false,
  loginAttempts: 0,
  ...overrides,
});

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-bootstrap-administrator-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.get(
    '/api/admin-only',
    authenticate,
    authorize('administrator'),
    (_req, res) => res.json({ success: true, scope: 'administrator' }),
  );
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  });

  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  // Recreate the collections and uniqueness constraints used by the bootstrap
  // race tests after each database reset.
  await Promise.all([
    User.createCollection(),
    OTP.createCollection(),
    StaffVerificationIssuance.createCollection(),
    StaffVerificationToken.createCollection(),
    SystemBootstrapOperation.createCollection(),
  ]);
  await Promise.all([
    User.collection.createIndex({ email: 1 }, { unique: true }),
    StaffVerificationIssuance.collection.createIndex(
      { userId: 1, purpose: 1 },
      { unique: true, name: 'one_staff_verification_issuance_lease_per_account' },
    ),
    StaffVerificationToken.collection.createIndex({ tokenHash: 1 }, { unique: true }),
    SystemBootstrapOperation.collection.createIndex({ key: 1 }, { unique: true }),
  ]);
  resendRequests.length = 0;
  deliveredEmails.length = 0;
  failResendDelivery = false;
  terminalizeBootstrapOperationDuringDelivery = false;
  blockNextResendDelivery = false;
  notifyBlockedResendStarted = null;
  releaseBlockedResend?.();
  releaseBlockedResend = null;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  globalThis.fetch = nativeFetch;
});

test('empty database provisions one pending unverified Administrator with a hashed password and one link email', async () => {
  const plan = await provisionPlan();
  assert.equal(plan.canApply, true);
  assert.equal(plan.action, 'provision_pending_administrator');
  assert.ok(plan.confirmationToken);

  const result = await provisionFromPlan(plan);
  assert.equal(result.applied, true);
  assert.equal(result.status, 'provisioned');
  assert.equal(result.verification.method, 'link');
  assert.equal(result.administrator.role, 'administrator');
  assert.equal(result.administrator.status, 'pending');
  assert.equal(result.administrator.isVerified, false);
  assert.equal(result.administrator.isActive, true);
  assert.equal('token' in result, false);
  assert.equal('password' in result.administrator, false);

  assert.equal(await User.countDocuments({ role: 'administrator' }), 1);
  const administrator = await User.findOne({ role: 'administrator' });
  assert.equal(administrator.email, PROVISION_EMAIL);
  assert.equal(administrator.name, PROVISION_NAME);
  assert.equal(administrator.status, 'pending');
  assert.equal(administrator.isVerified, false);
  assert.equal(administrator.isActive, true);
  assert.equal(administrator.isDeleted, false);
  assert.match(administrator.password, /^\$2[aby]\$\d{2}\$/);
  assert.notEqual(administrator.password, PROVISION_PASSWORD);
  assert.equal(await bcrypt.compare(PROVISION_PASSWORD, administrator.password), true);

  assert.equal(deliveredEmails.length, 1);
  assert.equal(resendRequests.length, 1);
  assert.equal(emailRecipient(latestEmailPayload()), PROVISION_EMAIL);
  const rawToken = latestStaffVerificationToken();
  assert.ok(rawToken.length >= 40);

  const tokenRecord = await StaffVerificationToken.findOne({
    userId: administrator._id,
    purpose: 'staff_email_verification',
    usedAt: null,
  }).select('+tokenHash');
  assert.ok(tokenRecord);
  assert.equal(tokenRecord.email, PROVISION_EMAIL);
  assert.equal(tokenRecord.tokenHash, hashStaffVerificationToken(rawToken));
  assert.notEqual(tokenRecord.tokenHash, rawToken);
  assert.ok(tokenRecord.expiresAt > new Date());
  assert.equal(await OTP.countDocuments({ userId: administrator._id }), 0);
  assert.equal(await SystemBootstrapOperation.countDocuments({ status: 'completed' }), 1);
});

test('provision confirmation binds normalized name and a keyed password digest without exposing the password', async () => {
  const plan = await provisionPlan(
    PROVISION_EMAIL,
    '  Bootstrap   Owner  ',
    PROVISION_PASSWORD,
  );
  assert.equal(plan.provisionInput.name, PROVISION_NAME);
  assert.match(plan.provisionInput.passwordDigest, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(plan).includes(PROVISION_PASSWORD), false);

  const changedName = await provisionPlan(
    PROVISION_EMAIL,
    'Different Owner',
    PROVISION_PASSWORD,
  );
  const changedPassword = await provisionPlan(
    PROVISION_EMAIL,
    PROVISION_NAME,
    'An0ther!StrongSecret',
  );
  assert.notEqual(changedName.confirmationToken, plan.confirmationToken);
  assert.notEqual(changedPassword.confirmationToken, plan.confirmationToken);

  await assert.rejects(
    provisionBootstrapAdministrator({
      targetEmail: PROVISION_EMAIL,
      name: 'Different Owner',
      initialPassword: PROVISION_PASSWORD,
      confirmationToken: plan.confirmationToken,
    }),
    (error) => error?.code === 'BOOTSTRAP_CONFIRMATION_REQUIRED',
  );
  assert.equal(await User.countDocuments(), 0);
  assert.equal(await SystemBootstrapOperation.countDocuments(), 0);

  const result = await provisionBootstrapAdministrator({
    targetEmail: PROVISION_EMAIL,
    name: '  Bootstrap   Owner  ',
    initialPassword: PROVISION_PASSWORD,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(result.applied, true);
  const operation = await SystemBootstrapOperation.findOne().lean();
  assert.equal(JSON.stringify(operation).includes(PROVISION_PASSWORD), false);
  assert.equal('provisionInput' in operation, false);
});

test('concurrent account-bound verification issuance leaves one active token and one delivered link', async () => {
  const administrator = await seedAdministrator({
    email: 'concurrent.resend@custom-domain.test',
    isVerified: false,
    status: 'pending',
  });
  const gate = holdNextResendRequest();
  const first = issueStaffVerificationLink(administrator, { enforceCooldown: true });
  await gate.started;

  let concurrentError = null;
  try {
    await issueStaffVerificationLink(administrator, { enforceCooldown: true });
  } catch (error) {
    concurrentError = error;
  } finally {
    gate.release();
  }
  await first;

  assert.equal(concurrentError?.code, 'VERIFICATION_ISSUANCE_IN_PROGRESS');
  assert.equal(deliveredEmails.length, 1);
  assert.equal(await StaffVerificationToken.countDocuments({
    userId: administrator._id,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }), 1);
  const issuance = await StaffVerificationIssuance.findOne({ userId: administrator._id });
  assert.ok(issuance.currentTokenId);
  assert.ok(issuance.currentTokenDeliveredAt);
  assert.equal(issuance.leaseExpiresAt, null);
});

test('concurrent and repeated provisioning remains one-time and sends only one email', async () => {
  const plan = await provisionPlan();
  const results = await Promise.all([
    provisionFromPlan(plan),
    provisionFromPlan(plan),
    provisionFromPlan(plan),
  ]);

  assert.equal(results.filter((entry) => entry.applied).length, 1);
  assert.equal(await User.countDocuments({ role: 'administrator' }), 1);
  assert.equal(await SystemBootstrapOperation.countDocuments(), 1);
  assert.equal(await StaffVerificationToken.countDocuments({ usedAt: null }), 1);
  assert.equal(deliveredEmails.length, 1);

  const administrator = await User.findOne({ role: 'administrator' });
  const passwordHash = administrator.password;
  const repeat = await provisionFromPlan(plan, {
    name: 'Changed Bootstrap Name',
    initialPassword: 'Changed!BootstrapPass2',
  });
  assert.equal(repeat.applied, false);
  assert.ok(['already_completed', 'completed'].includes(repeat.status));

  const unchanged = await User.findById(administrator._id);
  assert.equal(unchanged.password, passwordHash);
  assert.equal(unchanged.name, PROVISION_NAME);
  assert.equal(unchanged.email, PROVISION_EMAIL);
  assert.equal(deliveredEmails.length, 1);
  assert.equal(await StaffVerificationToken.countDocuments({ usedAt: null }), 1);
});

test('resend inspection reports cooldown and a confirmation cannot be replayed after delivery', async () => {
  const administrator = await seedAdministrator({
    email: 'bootstrap.resend@custom-domain.test',
    isVerified: false,
    status: 'pending',
  });
  await issueStaffVerificationLink(administrator);

  const cooldownPlan = await inspectBootstrapAdministrator({
    mode: 'resend',
    targetEmail: administrator.email,
  });
  assert.equal(cooldownPlan.canApply, false);
  assert.equal(cooldownPlan.action, 'resend_cooldown');
  assert.ok(cooldownPlan.retryAfterSeconds > 0);
  assert.ok(cooldownPlan.verificationState.cooldownUntil);

  const originalToken = await StaffVerificationToken.findOne({
    userId: administrator._id,
    usedAt: null,
  });
  originalToken.lastSentAt = new Date(Date.now() - 61_000);
  await originalToken.save();

  const plan = await inspectBootstrapAdministrator({
    mode: 'resend',
    targetEmail: administrator.email,
  });
  assert.equal(plan.canApply, true);
  assert.equal(plan.action, 'resend_verification');
  assert.equal(plan.verificationState.activeTokenId, String(originalToken._id));

  const resent = await resendBootstrapAdministratorVerification({
    targetEmail: administrator.email,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(resent.applied, true);
  assert.equal(resent.status, 'verification_resent');
  assert.equal(deliveredEmails.length, 2);
  assert.equal(await StaffVerificationToken.countDocuments({
    userId: administrator._id,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }), 1);

  await assert.rejects(
    resendBootstrapAdministratorVerification({
      targetEmail: administrator.email,
      confirmationToken: plan.confirmationToken,
    }),
    (error) => error?.code === 'BOOTSTRAP_CONFIRMATION_REQUIRED',
  );
  assert.equal(deliveredEmails.length, 2);
});

test('existing Administrator causes a no-op without changing fields or sending email', async () => {
  const lockUntil = new Date(Date.now() + 20 * 60 * 1000);
  const existing = await seedAdministrator({
    loginAttempts: 4,
    lockUntil,
    avatar: 'https://cdn.custom-domain.test/existing-admin.png',
  });
  const before = rawUserSnapshot(await readRawUser(existing._id));

  const plan = await provisionPlan('different.owner@custom-domain.test');
  assert.equal(plan.canApply, false);
  assert.equal(plan.action, 'skipped_existing');
  const result = await provisionBootstrapAdministrator({
    targetEmail: 'different.owner@custom-domain.test',
    name: 'Should Not Apply',
    initialPassword: 'Should!NeverChange2',
    confirmationToken: 'irrelevant-for-a-no-op',
  });

  assert.equal(result.applied, false);
  assert.equal(result.status, 'skipped_existing');
  const after = rawUserSnapshot(await readRawUser(existing._id));
  assert.deepEqual(after, before);
  assert.equal(await User.countDocuments({ role: 'administrator' }), 1);
  assert.equal(await SystemBootstrapOperation.countDocuments(), 0);
  assert.equal(await StaffVerificationToken.countDocuments(), 0);
  assert.equal(deliveredEmails.length, 0);
});

test('bootstrap email collision never promotes or mutates the existing account', async () => {
  const customer = await User.create({
    name: 'Existing Customer',
    email: PROVISION_EMAIL,
    password: 'Existing!CustomerPass1',
    role: 'customer',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  const before = rawUserSnapshot(await readRawUser(customer._id));

  const plan = await provisionPlan();
  assert.equal(plan.canApply, false);
  assert.equal(plan.action, 'blocked');
  const result = await provisionBootstrapAdministrator({
    targetEmail: PROVISION_EMAIL,
    name: PROVISION_NAME,
    initialPassword: PROVISION_PASSWORD,
    confirmationToken: 'not-applicable',
  });

  assert.equal(result.applied, false);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(rawUserSnapshot(await readRawUser(customer._id)), before);
  assert.equal(await User.countDocuments({ role: 'administrator' }), 0);
  assert.equal(await SystemBootstrapOperation.countDocuments(), 0);
  assert.equal(deliveredEmails.length, 0);
});

test('explicit email migration preserves identity, password, profile, role, and lock state, then verifies only once', async () => {
  const sourceEmail = 'legacy.owner@custom-domain.test';
  const targetEmail = 'new.owner@custom-domain.test';
  const lockUntil = new Date(Date.now() + 25 * 60 * 1000);
  const administrator = await seedAdministrator({
    name: 'Legacy Bootstrap Owner',
    email: sourceEmail,
    password: 'Legacy!BootstrapPass1',
    phone: '+639171234567',
    address: 'Makati City',
    avatar: 'https://cdn.custom-domain.test/legacy-owner.png',
    firebaseUid: 'legacy-bootstrap-firebase-uid',
    loginAttempts: 3,
    lockUntil,
  });
  const before = rawUserSnapshot(await readRawUser(administrator._id));

  const plan = await inspectBootstrapAdministrator({
    mode: 'migrate',
    sourceEmail,
    targetEmail,
  });
  assert.equal(plan.canApply, true);
  assert.equal(plan.action, 'migrate_administrator_email');

  const result = await migrateBootstrapAdministratorEmail({
    sourceEmail,
    targetEmail,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(result.applied, true);
  assert.equal(result.status, 'migrated_pending_verification');
  assert.equal(result.administrator.id, String(administrator._id));
  assert.equal(result.administrator.email, targetEmail);
  assert.equal(result.administrator.role, 'administrator');
  assert.equal(result.administrator.status, 'pending');
  assert.equal(result.administrator.isVerified, false);

  const migrated = rawUserSnapshot(await readRawUser(administrator._id));
  assert.equal(migrated.id, before.id);
  assert.equal(migrated.password, before.password);
  assert.equal(migrated.role, before.role);
  assert.equal(migrated.name, before.name);
  assert.equal(migrated.phone, before.phone);
  assert.equal(migrated.address, before.address);
  assert.equal(migrated.avatar, before.avatar);
  assert.equal(migrated.firebaseUid, before.firebaseUid);
  assert.equal(migrated.referralCode, before.referralCode);
  assert.equal(migrated.loginAttempts, before.loginAttempts);
  assert.equal(migrated.lockUntil, before.lockUntil);
  assert.equal(migrated.email, targetEmail);
  assert.equal(migrated.isVerified, false);
  assert.equal(migrated.status, 'pending');
  assert.equal(migrated.authVersion, before.authVersion + 1);

  assert.equal(deliveredEmails.length, 1);
  assert.equal(emailRecipient(latestEmailPayload()), targetEmail);
  const rawToken = latestStaffVerificationToken();
  assert.equal(await StaffVerificationToken.countDocuments({
    userId: administrator._id,
    email: targetEmail,
    usedAt: null,
  }), 1);

  const postMigrationSnapshot = rawUserSnapshot(await readRawUser(administrator._id));
  const replay = await migrateBootstrapAdministratorEmail({
    sourceEmail,
    targetEmail,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(replay.applied, false);
  assert.equal(replay.status, 'already_completed');
  assert.deepEqual(rawUserSnapshot(await readRawUser(administrator._id)), postMigrationSnapshot);
  assert.equal(deliveredEmails.length, 1);

  const activation = await postJson('/api/auth/verify-staff-email', { token: rawToken });
  assert.equal(activation.response.status, 200);
  assert.equal(activation.body.data.token, undefined);
  const activated = await User.findById(administrator._id);
  assert.equal(activated.isVerified, true);
  assert.equal(activated.status, 'active');
  assert.equal(activated.loginAttempts, before.loginAttempts);
  assert.equal(activated.lockUntil.toISOString(), before.lockUntil);

  const reused = await postJson('/api/auth/verify-staff-email', { token: rawToken });
  assert.equal(reused.response.status, 409);
  assert.equal(reused.body.code, 'VERIFICATION_TOKEN_USED');

  const lockedLogin = await postJson('/api/auth/login', {
    email: targetEmail,
    password: 'Legacy!BootstrapPass1',
  });
  assert.equal(lockedLogin.response.status, 423);
});

test('provisioned Administrator receives no JWT before login OTP and final OTP JWT passes Administrator RBAC', async () => {
  const plan = await provisionPlan();
  const provisioned = await provisionFromPlan(plan);
  const administrator = await User.findById(provisioned.administrator.id);
  const verificationToken = latestStaffVerificationToken();

  const pendingLogin = await postJson('/api/auth/login', {
    email: administrator.email,
    password: PROVISION_PASSWORD,
  });
  assert.equal(pendingLogin.response.status, 403);
  assert.equal(pendingLogin.body.code, 'ACCOUNT_PENDING_VERIFICATION');
  assert.equal(pendingLogin.body.data?.token, undefined);
  assert.equal(await OTP.countDocuments({ userId: administrator._id, purpose: 'login' }), 0);

  const activation = await postJson('/api/auth/verify-staff-email', {
    token: verificationToken,
  });
  assert.equal(activation.response.status, 200);
  assert.equal(activation.body.data.token, undefined);
  assert.equal(activation.body.data.user, undefined);

  const plainJwt = jwt.sign({
    id: administrator._id.toString(),
    email: administrator.email,
    role: 'administrator',
  }, config.jwtSecret, { expiresIn: '1h' });
  const preOtpRbac = await requestJson('/api/admin-only', { token: plainJwt });
  assert.equal(preOtpRbac.response.status, 401);
  assert.equal(preOtpRbac.body.code, 'STAFF_2FA_REQUIRED');

  const login = await postJson('/api/auth/login', {
    email: administrator.email,
    password: PROVISION_PASSWORD,
    require2FA: false,
    role: 'customer',
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.requiresOTP, true);
  assert.equal(login.body.data.token, undefined);
  assert.ok(login.body.data.challengeToken);

  const otpRecord = await OTP.findOne({ userId: administrator._id, purpose: 'login' });
  assert.ok(otpRecord);
  assert.equal(otpRecord.otp, null);
  const deliveredOtp = latestOtpCode(administrator.email);
  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: administrator._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: deliveredOtp,
  });
  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data.token);

  const claims = jwt.verify(verified.body.data.token, config.jwtSecret);
  assert.equal(claims.role, 'administrator');
  assert.equal(claims.authLevel, STAFF_2FA_AUTH_LEVEL);
  const allowed = await requestJson('/api/admin-only', { token: verified.body.data.token });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.scope, 'administrator');

  const replay = await postJson('/api/auth/verify-login-otp', {
    userId: administrator._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: deliveredOtp,
  });
  assert.notEqual(replay.response.status, 200);
  assert.equal(replay.body.data?.token, undefined);
});

test('failed provision delivery retains a safe pending account and retries the same identity without resetting its password', async () => {
  const plan = await provisionPlan();
  failResendDelivery = true;

  await assert.rejects(
    provisionFromPlan(plan),
    (error) => error?.code === 'VERIFICATION_EMAIL_FAILED',
  );

  const pending = await User.findOne({ role: 'administrator' });
  assert.ok(pending);
  assert.equal(pending.isVerified, false);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.isActive, true);
  const originalId = String(pending._id);
  const originalHash = pending.password;
  assert.equal(await StaffVerificationToken.countDocuments(), 0);
  assert.equal(deliveredEmails.length, 0);
  assert.equal(resendRequests.length, 1);
  const failedOperation = await SystemBootstrapOperation.findOne();
  assert.equal(failedOperation.status, 'failed');
  assert.equal(String(failedOperation.targetUserId), originalId);

  failResendDelivery = false;
  const retryPlan = await provisionPlan();
  assert.equal(retryPlan.canApply, true);
  assert.equal(retryPlan.action, 'retry_provision_delivery');
  const retried = await provisionBootstrapAdministrator({
    targetEmail: PROVISION_EMAIL,
    confirmationToken: retryPlan.confirmationToken,
  });

  assert.equal(retried.applied, true);
  assert.equal(retried.status, 'delivery_retried');
  const recovered = await User.findOne({ role: 'administrator' });
  assert.equal(String(recovered._id), originalId);
  assert.equal(recovered.password, originalHash);
  assert.equal(recovered.isVerified, false);
  assert.equal(recovered.status, 'pending');
  assert.equal(await User.countDocuments({ role: 'administrator' }), 1);
  assert.equal(await StaffVerificationToken.countDocuments({ usedAt: null }), 1);
  assert.equal(deliveredEmails.length, 1);
  assert.equal(resendRequests.length, 2);
  assert.equal((await SystemBootstrapOperation.findOne()).status, 'completed');
});

test('failed migration delivery rolls the account back and a confirmed retry migrates the same identity', async () => {
  const sourceEmail = 'rollback.source@custom-domain.test';
  const targetEmail = 'rollback.target@custom-domain.test';
  const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  const administrator = await seedAdministrator({
    email: sourceEmail,
    password: 'Rollback!BootstrapPass1',
    loginAttempts: 2,
    lockUntil,
  });
  const before = rawUserSnapshot(await readRawUser(administrator._id));
  const plan = await inspectBootstrapAdministrator({ mode: 'migrate', sourceEmail, targetEmail });

  failResendDelivery = true;
  await assert.rejects(
    migrateBootstrapAdministratorEmail({
      sourceEmail,
      targetEmail,
      confirmationToken: plan.confirmationToken,
    }),
    (error) => error?.code === 'VERIFICATION_EMAIL_FAILED',
  );

  const rolledBack = rawUserSnapshot(await readRawUser(administrator._id));
  // Visible account state rolls back, while authVersion intentionally remains
  // incremented so pre-migration sessions stay revoked. __v/updatedAt also
  // advance because both the migration and rollback are compare-and-set writes.
  const {
    updatedAt: _beforeUpdatedAt,
    authVersion: _beforeAuthVersion,
    version: _beforeVersion,
    ...beforeRestoredFields
  } = before;
  const {
    updatedAt: _afterUpdatedAt,
    authVersion: _afterAuthVersion,
    version: _afterVersion,
    ...rolledBackRestoredFields
  } = rolledBack;
  assert.deepEqual(rolledBackRestoredFields, beforeRestoredFields);
  assert.equal(rolledBack.authVersion, before.authVersion + 1);
  assert.ok(rolledBack.version > before.version);
  assert.ok(new Date(rolledBack.updatedAt) >= new Date(before.updatedAt));
  assert.equal(await StaffVerificationToken.countDocuments(), 0);
  assert.equal((await SystemBootstrapOperation.findOne()).status, 'failed');

  failResendDelivery = false;
  const retryPlan = await inspectBootstrapAdministrator({ mode: 'migrate', sourceEmail, targetEmail });
  assert.equal(retryPlan.action, 'retry_email_migration');
  const retried = await migrateBootstrapAdministratorEmail({
    sourceEmail,
    targetEmail,
    confirmationToken: retryPlan.confirmationToken,
  });
  assert.equal(retried.applied, true);
  assert.equal(retried.status, 'migrated_pending_verification');

  const migrated = rawUserSnapshot(await readRawUser(administrator._id));
  assert.equal(migrated.id, before.id);
  assert.equal(migrated.password, before.password);
  assert.equal(migrated.role, before.role);
  assert.equal(migrated.loginAttempts, before.loginAttempts);
  assert.equal(migrated.lockUntil, before.lockUntil);
  assert.equal(migrated.email, targetEmail);
  assert.equal(migrated.isVerified, false);
  assert.equal(migrated.status, 'pending');
  assert.equal(migrated.authVersion, rolledBack.authVersion + 1);
  assert.equal(await StaffVerificationToken.countDocuments({ usedAt: null }), 1);
  assert.equal(deliveredEmails.length, 1);
  assert.equal(resendRequests.length, 2);
});

test('expired provision lease reconciles a confirmed delivery without sending a duplicate', async () => {
  const administrator = await seedAdministrator({
    email: PROVISION_EMAIL,
    isVerified: false,
    status: 'pending',
  });
  await issueStaffVerificationLink(administrator);
  assert.equal(deliveredEmails.length, 1);

  await SystemBootstrapOperation.create({
    key: ADMINISTRATOR_PROVISION_OPERATION_KEY,
    operation: 'administrator_provision',
    status: 'in_progress',
    phase: 'account_ready',
    attemptId: 'expired-provision-attempt',
    leaseExpiresAt: new Date(Date.now() - 1000),
    targetUserId: administrator._id,
    targetEmail: PROVISION_EMAIL,
  });
  const plan = await inspectBootstrapAdministrator({
    mode: 'provision',
    targetEmail: PROVISION_EMAIL,
  });
  assert.equal(plan.action, 'reconcile_provision');
  assert.equal(plan.verificationState.deliveryConfirmed, true);

  const result = await provisionBootstrapAdministrator({
    targetEmail: PROVISION_EMAIL,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(result.status, 'reconciled_completed');
  assert.equal(result.verification.existingDelivery, true);
  assert.equal(deliveredEmails.length, 1);
  const operation = await SystemBootstrapOperation.findOne();
  assert.equal(operation.status, 'completed');
  assert.equal(operation.phase, 'verification_delivered');
});

test('expired provision lease replaces a pre-delivery crash token instead of treating it as delivered', async () => {
  const administrator = await seedAdministrator({
    email: PROVISION_EMAIL,
    isVerified: false,
    status: 'pending',
  });
  const ghostToken = await StaffVerificationToken.create({
    userId: administrator._id,
    email: PROVISION_EMAIL,
    tokenHash: hashStaffVerificationToken('never-delivered-bootstrap-token'),
    purpose: 'staff_email_verification',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    lastSentAt: new Date(),
  });
  await StaffVerificationIssuance.create({
    userId: administrator._id,
    purpose: 'staff_email_verification',
    generation: 1,
    currentTokenId: null,
    currentTokenDeliveredAt: null,
    leaseOwner: 'crashed-before-resend',
    leaseExpiresAt: new Date(Date.now() - 1000),
  });
  await SystemBootstrapOperation.create({
    key: ADMINISTRATOR_PROVISION_OPERATION_KEY,
    operation: 'administrator_provision',
    status: 'in_progress',
    phase: 'account_ready',
    attemptId: 'expired-pre-delivery-attempt',
    leaseExpiresAt: new Date(Date.now() - 1000),
    targetUserId: administrator._id,
    targetEmail: PROVISION_EMAIL,
  });

  const plan = await inspectBootstrapAdministrator({
    mode: 'provision',
    targetEmail: PROVISION_EMAIL,
  });
  assert.equal(plan.verificationState.hasActiveToken, true);
  assert.equal(plan.verificationState.deliveryConfirmed, false);
  const result = await provisionBootstrapAdministrator({
    targetEmail: PROVISION_EMAIL,
    confirmationToken: plan.confirmationToken,
  });

  assert.equal(result.status, 'reconciled_completed');
  assert.equal(result.verification.existingDelivery, undefined);
  assert.equal(deliveredEmails.length, 1);
  assert.ok((await StaffVerificationToken.findById(ghostToken._id)).usedAt);
  const activeToken = await StaffVerificationToken.findOne({
    userId: administrator._id,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  const issuance = await StaffVerificationIssuance.findOne({ userId: administrator._id });
  assert.ok(activeToken);
  assert.equal(String(issuance.currentTokenId), String(activeToken._id));
  assert.ok(issuance.currentTokenDeliveredAt >= activeToken.lastSentAt);
});

test('terminal operation CAS prevents a late delivery failure from downgrading completed state', async () => {
  const plan = await provisionPlan();
  terminalizeBootstrapOperationDuringDelivery = true;
  failResendDelivery = true;

  await assert.rejects(
    provisionFromPlan(plan),
    (error) => error?.code === 'BOOTSTRAP_OPERATION_TERMINAL_CAS_FAILED',
  );

  const operation = await SystemBootstrapOperation.findOne();
  assert.equal(operation.status, 'completed');
  assert.ok(operation.completedAt);
  assert.notEqual(operation.status, 'failed');
  assert.equal(deliveredEmails.length, 0);
});

test('migration delivery failure restores an existing pending source verification link', async () => {
  const sourceEmail = 'pending.source@custom-domain.test';
  const targetEmail = 'pending.target@custom-domain.test';
  const administrator = await seedAdministrator({
    email: sourceEmail,
    isVerified: false,
    status: 'pending',
  });
  await issueStaffVerificationLink(administrator);
  const sourceRawToken = latestStaffVerificationToken();
  const sourceToken = await StaffVerificationToken.findOne({
    userId: administrator._id,
    email: sourceEmail,
    usedAt: null,
  }).select('+tokenHash');
  assert.ok(sourceToken);

  const plan = await inspectBootstrapAdministrator({ mode: 'migrate', sourceEmail, targetEmail });
  failResendDelivery = true;
  await assert.rejects(
    migrateBootstrapAdministratorEmail({
      sourceEmail,
      targetEmail,
      confirmationToken: plan.confirmationToken,
    }),
    (error) => error?.code === 'VERIFICATION_EMAIL_FAILED',
  );
  assert.equal(resendRequests.length, 2);
  assert.equal(emailRecipient(resendRequests.at(-1)), targetEmail);

  const rolledBack = await User.findById(administrator._id);
  assert.equal(rolledBack.email, sourceEmail);
  assert.equal(rolledBack.status, 'pending');
  assert.equal(rolledBack.isVerified, false);
  const restoredToken = await StaffVerificationToken.findById(sourceToken._id).select('+tokenHash');
  assert.equal(restoredToken.usedAt, null);
  assert.equal(restoredToken.email, sourceEmail);
  assert.equal(restoredToken.tokenHash, sourceToken.tokenHash);
  assert.ok(restoredToken.expiresAt > new Date());
  assert.equal(await StaffVerificationToken.countDocuments({
    userId: administrator._id,
    email: targetEmail,
    usedAt: null,
  }), 0);

  failResendDelivery = false;
  const activated = await consumeStaffVerificationToken(sourceRawToken);
  assert.equal(String(activated._id), String(administrator._id));
  assert.equal(activated.email, sourceEmail);
  assert.equal(activated.status, 'active');
});

test('migration CAS does not overwrite a concurrent suspension', async () => {
  const sourceEmail = 'cas.source@custom-domain.test';
  const targetEmail = 'cas.target@custom-domain.test';
  const administrator = await seedAdministrator({ email: sourceEmail });
  const plan = await inspectBootstrapAdministrator({ mode: 'migrate', sourceEmail, targetEmail });

  const originalFindOneAndUpdate = User.findOneAndUpdate;
  let injectedSuspension = false;
  User.findOneAndUpdate = function patchedFindOneAndUpdate(filter, update, options) {
    if (!injectedSuspension && update?.$set?.email === targetEmail) {
      injectedSuspension = true;
      return (async () => {
        await User.collection.updateOne(
          { _id: administrator._id },
          {
            $set: { status: 'suspended', updatedAt: new Date() },
            $inc: { __v: 1 },
          },
        );
        return originalFindOneAndUpdate.call(User, filter, update, options);
      })();
    }
    return originalFindOneAndUpdate.call(User, filter, update, options);
  };

  try {
    await assert.rejects(
      migrateBootstrapAdministratorEmail({
        sourceEmail,
        targetEmail,
        confirmationToken: plan.confirmationToken,
      }),
      (error) => error?.code === 'BOOTSTRAP_MIGRATION_STATE_CHANGED',
    );
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }

  assert.equal(injectedSuspension, true);
  const after = await User.findById(administrator._id);
  assert.equal(after.email, sourceEmail);
  assert.equal(after.status, 'suspended');
  assert.equal(deliveredEmails.length, 0);
  assert.equal((await SystemBootstrapOperation.findOne()).status, 'failed');
});

test('migration reconciliation requires the operation-bound target and an incremented auth version', async () => {
  const sourceEmail = 'reconcile.source@custom-domain.test';
  const targetEmail = 'reconcile.target@custom-domain.test';
  const inspectedAuthVersion = 4;
  const administrator = await seedAdministrator({
    email: targetEmail,
    isVerified: false,
    status: 'pending',
    authVersion: inspectedAuthVersion,
  });
  const operation = await SystemBootstrapOperation.create({
    key: 'administrator:email-migration:v1',
    operation: 'administrator_email_migration',
    status: 'failed',
    phase: 'identity_updated',
    attemptId: 'reconcile-auth-version-attempt',
    targetUserId: administrator._id,
    sourceEmail,
    targetEmail,
    rollbackSnapshot: {
      email: sourceEmail,
      isVerified: true,
      status: 'active',
      inspectedUpdatedAt: new Date(Date.now() - 10_000),
      inspectedVersion: 0,
      inspectedAuthVersion,
    },
  });

  const staleVersionPlan = await inspectBootstrapAdministrator({
    mode: 'migrate',
    sourceEmail,
    targetEmail,
  });
  assert.equal(staleVersionPlan.canApply, false);
  assert.equal(staleVersionPlan.action, 'blocked');
  assert.equal(
    staleVersionPlan.reasonCode,
    'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
  );
  const staleApply = await migrateBootstrapAdministratorEmail({
    sourceEmail,
    targetEmail,
    confirmationToken: 'stale-manual-state',
  });
  assert.equal(staleApply.applied, false);
  assert.equal(deliveredEmails.length, 0);

  await User.updateOne(
    { _id: administrator._id },
    { $set: { authVersion: inspectedAuthVersion + 1 } },
  );
  await SystemBootstrapOperation.updateOne(
    { _id: operation._id },
    { $set: { targetUserId: new mongoose.Types.ObjectId() } },
  );
  const mismatchedIdentityPlan = await inspectBootstrapAdministrator({
    mode: 'migrate',
    sourceEmail,
    targetEmail,
  });
  assert.equal(mismatchedIdentityPlan.canApply, false);
  assert.equal(
    mismatchedIdentityPlan.reasonCode,
    'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
  );
  assert.equal(deliveredEmails.length, 0);

  await SystemBootstrapOperation.updateOne(
    { _id: operation._id },
    { $set: { targetUserId: administrator._id } },
  );
  const validPlan = await inspectBootstrapAdministrator({
    mode: 'migrate',
    sourceEmail,
    targetEmail,
  });
  assert.equal(validPlan.canApply, true);
  assert.equal(validPlan.action, 'reconcile_email_migration');
  const reconciled = await migrateBootstrapAdministratorEmail({
    sourceEmail,
    targetEmail,
    confirmationToken: validPlan.confirmationToken,
  });
  assert.equal(reconciled.applied, true);
  assert.equal(reconciled.status, 'reconciled_completed');
  assert.equal(deliveredEmails.length, 1);
  const after = await User.findById(administrator._id);
  assert.equal(after.authVersion, inspectedAuthVersion + 1);
});

test('generic startup role migration never promotes a raw legacy admin account', async () => {
  const password = await bcrypt.hash('Raw!LegacyAdminPass1', 10);
  const now = new Date();
  const inserted = await User.collection.insertOne({
    name: 'Raw Legacy Admin',
    email: 'raw.legacy.admin@custom-domain.test',
    password,
    role: 'admin',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    loginAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  const modified = await migrateLegacyUserRoles();
  const after = await User.collection.findOne({ _id: inserted.insertedId });
  assert.equal(modified, 0);
  assert.equal(after.role, 'admin');
  assert.equal(await User.countDocuments({ role: 'administrator' }), 0);
});

test('raw legacy admin cannot start login 2FA or authorize as canonical Administrator', async () => {
  const password = 'Raw!LegacyAdminPass1';
  const inserted = await User.collection.insertOne({
    name: 'Unmigrated Legacy Admin',
    email: 'unmigrated.admin@custom-domain.test',
    password: await bcrypt.hash(password, 10),
    role: 'admin',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    loginAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const login = await postJson('/api/auth/login', {
    email: 'unmigrated.admin@custom-domain.test',
    password,
  });
  const forgedLegacyToken = jwt.sign({
    id: inserted.insertedId.toString(),
    email: 'unmigrated.admin@custom-domain.test',
    role: 'admin',
    authLevel: STAFF_2FA_AUTH_LEVEL,
  }, config.jwtSecret, { expiresIn: '1h' });
  const authorization = await requestJson('/api/admin-only', { token: forgedLegacyToken });

  assert.notEqual(login.response.status, 200);
  assert.equal(login.body.data?.token, undefined);
  assert.equal(await OTP.countDocuments({ userId: inserted.insertedId, purpose: 'login' }), 0);
  assert.notEqual(authorization.response.status, 200);
});
