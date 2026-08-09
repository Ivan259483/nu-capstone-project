import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'auth_version_invalidation_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_auth_version_invalidation';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.CLIENT_URL ||= 'https://portal.custom-domain.test';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
const deliveredEmails = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    const payload = JSON.parse(String(init?.body || '{}'));
    deliveredEmails.push(payload);
    return new Response(JSON.stringify({ id: `auth_version_email_${deliveredEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return nativeFetch(input, init);
};

const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL } = await import('../constants/roles.js');
const { default: OTP } = await import('../models/oTP.model.js');
const { default: User } = await import('../models/user.model.js');
const authRoutes = (await import('../routes/auth.routes.js')).default;
const userRoutes = (await import('../routes/users.routes.js')).default;
const {
  inspectBootstrapAdministrator,
  migrateBootstrapAdministratorEmail,
} = await import('../services/bootstrapAdministrator.service.js');
const { authenticate, authorize, optionalAuthenticate } = await import('../middleware/auth.middleware.js');
const { initSocket } = await import('../utils/socket.utils.js');

const SOURCE_EMAIL = 'session.source@custom-domain.test';
const TARGET_EMAIL = 'session.target@custom-domain.test';
const PASSWORD = 'Session!MigrationPass1';

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

const latestVerificationToken = (expectedEmail) => {
  assert.ok(deliveredEmails.length > 0, 'expected a verification email');
  const normalizedExpectedEmail = String(expectedEmail || '').trim().toLowerCase();
  const payload = normalizedExpectedEmail
    ? [...deliveredEmails].reverse().find((entry) => {
      const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
      return recipients.some((recipient) => String(recipient || '').toLowerCase() === normalizedExpectedEmail);
    })
    : deliveredEmails.at(-1);
  assert.ok(payload, `expected a verification email for ${expectedEmail}`);
  const content = `${payload.html || ''}\n${payload.text || ''}`;
  const match = content.match(/verify-account\?token=([^\s"<&]+)/);
  assert.ok(match?.[1], 'verification email must contain an opaque link token');
  return decodeURIComponent(match[1]);
};

const connectSocketByPolling = async (token) => {
  const stamp = `${Date.now()}_${Math.random()}`;
  const opened = await nativeFetch(`${baseUrl}/socket.io/?EIO=4&transport=polling&t=${stamp}`);
  const openingPacket = await opened.text();
  assert.equal(opened.status, 200);
  assert.equal(openingPacket[0], '0');
  const { sid } = JSON.parse(openingPacket.slice(1));

  const connected = await nativeFetch(
    `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(sid)}&t=${stamp}_connect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: `40${JSON.stringify({ token })}`,
    },
  );
  assert.equal(connected.status, 200);

  const polled = await nativeFetch(
    `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(sid)}&t=${stamp}_poll`,
  );
  const packet = await polled.text();
  return packet;
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-auth-version-test'));
  await User.init();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.get('/api/protected', authenticate, (req, res) => res.json({
    success: true,
    role: req.user.role,
  }));
  app.get(
    '/api/admin-only',
    authenticate,
    authorize('administrator'),
    (_req, res) => res.json({ success: true }),
  );
  app.get('/api/optional', optionalAuthenticate, (req, res) => res.json({
    success: true,
    authenticated: Boolean(req.user),
    role: req.user?.role || null,
  }));
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  });

  server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
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

test('Administrator email migration permanently revokes old HTTP and socket JWTs until fresh password plus OTP login', async () => {
  const administrator = await User.create({
    name: 'Session Migration Administrator',
    email: SOURCE_EMAIL,
    password: PASSWORD,
    role: 'administrator',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    authVersion: 0,
  });

  const preMigrationToken = jwt.sign({
    id: administrator._id.toString(),
    email: administrator.email,
    role: administrator.role,
    authLevel: STAFF_2FA_AUTH_LEVEL,
    // Tokens minted before authVersion was deployed have no version claim.
    // They belong to version 0 and must stop working after the migration bump.
  }, config.jwtSecret, { expiresIn: '1h' });

  const beforeMigration = await requestJson('/api/admin-only', { token: preMigrationToken });
  assert.equal(beforeMigration.response.status, 200);
  const optionalBeforeMigration = await requestJson('/api/optional', { token: preMigrationToken });
  assert.equal(optionalBeforeMigration.body.authenticated, true);
  assert.equal(optionalBeforeMigration.body.role, 'administrator');
  assert.match(await connectSocketByPolling(preMigrationToken), /^40/);

  const plan = await inspectBootstrapAdministrator({
    mode: 'migrate',
    sourceEmail: SOURCE_EMAIL,
    targetEmail: TARGET_EMAIL,
  });
  assert.equal(plan.canApply, true);
  const migrated = await migrateBootstrapAdministratorEmail({
    sourceEmail: SOURCE_EMAIL,
    targetEmail: TARGET_EMAIL,
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(migrated.applied, true);

  const pending = await User.findById(administrator._id);
  assert.equal(pending.authVersion, 1);
  assert.equal(pending.isVerified, false);
  const whilePending = await requestJson('/api/admin-only', { token: preMigrationToken });
  assert.equal(whilePending.response.status, 403);
  assert.equal(whilePending.body.code, 'ACCOUNT_PENDING_VERIFICATION');

  const activation = await postJson('/api/auth/verify-staff-email', {
    token: latestVerificationToken(),
  });
  assert.equal(activation.response.status, 200);

  const staleHttp = await requestJson('/api/admin-only', { token: preMigrationToken });
  assert.equal(staleHttp.response.status, 401);
  assert.equal(staleHttp.body.code, 'STAFF_SESSION_REVOKED');
  const staleOptionalHttp = await requestJson('/api/optional', { token: preMigrationToken });
  assert.equal(staleOptionalHttp.response.status, 200);
  assert.equal(staleOptionalHttp.body.authenticated, false);
  assert.match(await connectSocketByPolling(preMigrationToken), /^44/);

  const login = await postJson('/api/auth/login', {
    email: TARGET_EMAIL,
    password: PASSWORD,
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.requiresOTP, true);
  assert.equal(login.body.data.token, undefined);

  const otpRecord = await OTP.findOne({
    userId: administrator._id,
    purpose: 'login',
  });
  assert.ok(otpRecord);
  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: administrator._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: otpRecord.otp,
  });
  assert.equal(verified.response.status, 200);

  const freshClaims = jwt.verify(verified.body.data.token, config.jwtSecret);
  assert.equal(freshClaims.authLevel, STAFF_2FA_AUTH_LEVEL);
  assert.equal(freshClaims.authVersion, 1);
  const freshHttp = await requestJson('/api/admin-only', { token: verified.body.data.token });
  assert.equal(freshHttp.response.status, 200);
  const freshOptionalHttp = await requestJson('/api/optional', { token: verified.body.data.token });
  assert.equal(freshOptionalHttp.body.authenticated, true);
  assert.equal(freshOptionalHttp.body.role, 'administrator');
  assert.match(await connectSocketByPolling(verified.body.data.token), /^40/);
});

test('staff email, archive/restore, and restricted-state transitions revoke old sessions without changing customer behavior', async () => {
  const manager = await User.create({
    name: 'Lifecycle Manager',
    email: 'lifecycle.manager@custom-domain.test',
    password: 'Lifecycle!ManagerPass1',
    role: 'administrator',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    authVersion: 0,
  });
  const managerToken = jwt.sign({
    id: manager._id.toString(),
    email: manager.email,
    role: manager.role,
    authLevel: STAFF_2FA_AUTH_LEVEL,
    authVersion: 0,
  }, config.jwtSecret, { expiresIn: '1h' });

  const originalEmail = 'lifecycle.sales.old@custom-domain.test';
  const changedEmail = 'lifecycle.sales.new@custom-domain.test';
  const password = 'Lifecycle!SalesPass1';
  const pastLockUntil = new Date(Date.now() - 60_000);
  const staff = await User.create({
    name: 'Lifecycle Sales',
    email: originalEmail,
    password,
    role: 'sales',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    loginAttempts: 3,
    lockUntil: pastLockUntil,
    authVersion: 0,
  });
  const originalRecord = await User.findById(staff._id).select('+password');
  const originalPasswordHash = originalRecord.password;
  const preChangeToken = jwt.sign({
    id: staff._id.toString(),
    email: staff.email,
    role: staff.role,
    authLevel: STAFF_2FA_AUTH_LEVEL,
    authVersion: 0,
  }, config.jwtSecret, { expiresIn: '1h' });

  assert.equal((await requestJson('/api/protected', { token: preChangeToken })).response.status, 200);
  assert.match(await connectSocketByPolling(preChangeToken), /^40/);

  const emailChange = await requestJson(`/api/users/${staff._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ email: changedEmail }),
  });
  assert.equal(emailChange.response.status, 200);

  const pending = await User.findById(staff._id).select('+password');
  assert.equal(pending.email, changedEmail);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.isVerified, false);
  assert.equal(pending.authVersion, 1);
  assert.equal(pending.loginAttempts, 3);
  assert.equal(pending.lockUntil.toISOString(), pastLockUntil.toISOString());
  assert.equal(pending.password, originalPasswordHash);
  assert.equal(pending.role, 'sales');
  assert.equal((await requestJson('/api/protected', { token: preChangeToken })).body.code, 'ACCOUNT_PENDING_VERIFICATION');

  const activation = await postJson('/api/auth/verify-staff-email', {
    token: latestVerificationToken(changedEmail),
  });
  assert.equal(activation.response.status, 200);
  const staleAfterActivation = await requestJson('/api/protected', { token: preChangeToken });
  assert.equal(staleAfterActivation.response.status, 401);
  assert.equal(staleAfterActivation.body.code, 'STAFF_SESSION_REVOKED');
  assert.equal((await requestJson('/api/optional', { token: preChangeToken })).body.authenticated, false);
  assert.match(await connectSocketByPolling(preChangeToken), /^44/);

  const completeLogin = async (expectedVersion) => {
    const login = await postJson('/api/auth/login', { email: changedEmail, password });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.data.requiresOTP, true);
    assert.equal(login.body.data.token, undefined);
    const otpRecord = await OTP.findOne({ userId: staff._id, purpose: 'login' });
    assert.ok(otpRecord);
    const verified = await postJson('/api/auth/verify-login-otp', {
      userId: staff._id.toString(),
      challengeToken: login.body.data.challengeToken,
      otp: otpRecord.otp,
    });
    assert.equal(verified.response.status, 200);
    assert.equal(jwt.verify(verified.body.data.token, config.jwtSecret).authVersion, expectedVersion);
    assert.equal((await requestJson('/api/protected', { token: verified.body.data.token })).response.status, 200);
    return verified.body.data.token;
  };

  const versionOneToken = await completeLogin(1);
  const archived = await requestJson(`/api/users/${staff._id}/archive`, {
    method: 'PATCH',
    token: managerToken,
  });
  assert.equal(archived.response.status, 200);
  let lifecycleAccount = await User.findById(staff._id).select('+password');
  assert.equal(lifecycleAccount.authVersion, 2);
  assert.equal(lifecycleAccount.isActive, false);
  assert.equal(lifecycleAccount.status, 'suspended');
  assert.equal(lifecycleAccount.password, originalPasswordHash);
  assert.equal(lifecycleAccount.role, 'sales');

  const restored = await requestJson(`/api/users/${staff._id}/activate`, {
    method: 'PATCH',
    token: managerToken,
  });
  assert.equal(restored.response.status, 200);
  lifecycleAccount = await User.findById(staff._id);
  assert.equal(lifecycleAccount.authVersion, 3);
  assert.equal(lifecycleAccount.isActive, true);
  assert.equal(lifecycleAccount.status, 'active');
  const staleAfterRestore = await requestJson('/api/protected', { token: versionOneToken });
  assert.equal(staleAfterRestore.response.status, 401);
  assert.equal(staleAfterRestore.body.code, 'STAFF_SESSION_REVOKED');

  const versionThreeToken = await completeLogin(3);
  const suspended = await requestJson(`/api/users/${staff._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(suspended.response.status, 200);
  assert.equal((await User.findById(staff._id)).authVersion, 4);
  assert.equal((await requestJson('/api/protected', { token: versionThreeToken })).body.code, 'STAFF_SESSION_REVOKED');

  const resumed = await requestJson(`/api/users/${staff._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(resumed.response.status, 200);
  assert.equal((await User.findById(staff._id)).authVersion, 4);
  const versionFourToken = await completeLogin(4);

  const disabled = await requestJson(`/api/users/${staff._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(disabled.response.status, 200);
  assert.equal((await User.findById(staff._id)).authVersion, 5);
  const reenabled = await requestJson(`/api/users/${staff._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ isActive: true }),
  });
  assert.equal(reenabled.response.status, 200);
  assert.equal((await User.findById(staff._id)).authVersion, 5);
  const staleAfterReenable = await requestJson('/api/protected', { token: versionFourToken });
  assert.equal(staleAfterReenable.response.status, 401);
  assert.equal(staleAfterReenable.body.code, 'STAFF_SESSION_REVOKED');
  await completeLogin(5);

  const customerPassword = 'Lifecycle!CustomerPass1';
  const customer = await User.create({
    name: 'Lifecycle Customer',
    email: 'lifecycle.customer.old@custom-domain.test',
    password: customerPassword,
    role: 'customer',
    isVerified: true,
    isActive: true,
    isDeleted: false,
    status: 'active',
    authVersion: 0,
  });
  const customerToken = jwt.sign({
    id: customer._id.toString(),
    email: customer.email,
    role: 'customer',
  }, config.jwtSecret, { expiresIn: '1h' });
  const customerChange = await requestJson(`/api/users/${customer._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ email: 'lifecycle.customer.new@custom-domain.test' }),
  });
  assert.equal(customerChange.response.status, 200);
  const changedCustomer = await User.findById(customer._id);
  assert.equal(changedCustomer.authVersion, 0);
  assert.equal(changedCustomer.isVerified, true);
  assert.equal(changedCustomer.status, 'active');
  assert.equal((await requestJson('/api/protected', { token: customerToken })).response.status, 200);
  const customerOptional = await requestJson('/api/optional', { token: customerToken });
  assert.equal(customerOptional.body.authenticated, true);
  assert.equal(customerOptional.body.role, 'customer');

  const promoted = await requestJson(`/api/users/${customer._id}`, {
    method: 'PUT',
    token: managerToken,
    body: JSON.stringify({ role: 'sales' }),
  });
  assert.equal(promoted.response.status, 200);
  const staleCustomerOptional = await requestJson('/api/optional', { token: customerToken });
  assert.equal(staleCustomerOptional.response.status, 200);
  assert.equal(staleCustomerOptional.body.authenticated, false);
  const staleCustomerStrict = await requestJson('/api/protected', { token: customerToken });
  assert.equal(staleCustomerStrict.response.status, 401);
  assert.equal(staleCustomerStrict.body.code, 'STAFF_2FA_REQUIRED');

  const promotedLogin = await postJson('/api/auth/login', {
    email: changedCustomer.email,
    password: customerPassword,
  });
  assert.equal(promotedLogin.response.status, 200);
  assert.equal(promotedLogin.body.data.requiresOTP, true);
  assert.equal(promotedLogin.body.data.token, undefined);
  const promotedOtp = await OTP.findOne({ userId: customer._id, purpose: 'login' });
  assert.ok(promotedOtp);
  const promotedVerification = await postJson('/api/auth/verify-login-otp', {
    userId: customer._id.toString(),
    challengeToken: promotedLogin.body.data.challengeToken,
    otp: promotedOtp.otp,
  });
  assert.equal(promotedVerification.response.status, 200);
  const promotedOptional = await requestJson('/api/optional', {
    token: promotedVerification.body.data.token,
  });
  assert.equal(promotedOptional.body.authenticated, true);
  assert.equal(promotedOptional.body.role, 'sales');
});
