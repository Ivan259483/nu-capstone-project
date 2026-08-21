import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'staff_auth_security_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_staff_auth_security';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
const sentEmails = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    sentEmails.push({ url: String(url), body: init?.body });
    return new Response(JSON.stringify({ id: `email_${sentEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return nativeFetch(input, init);
};

const { config } = await import('../config/environment.js');
const {
  LOGIN_OTP_REQUIRED_ROLES,
  STAFF_2FA_AUTH_LEVEL,
  requiresLoginOtp,
} = await import('../constants/roles.js');
const { default: OTP } = await import('../models/oTP.model.js');
const { default: StaffVerificationToken } = await import('../models/staffVerificationToken.model.js');
const { default: User } = await import('../models/user.model.js');
const { issueStaffVerificationLink } = await import('../services/staffVerification.service.js');
const authRoutes = (await import('../routes/auth.routes.js')).default;
const userRoutes = (await import('../routes/users.routes.js')).default;

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

const postJson = (path, body, token) =>
  requestJson(path, { method: 'POST', body: JSON.stringify(body), token });

const latestEmailPayload = () => {
  assert.ok(sentEmails.length > 0, 'expected Resend to receive an email');
  return JSON.parse(String(sentEmails.at(-1).body || '{}'));
};

const latestStaffVerificationToken = () => {
  const payload = latestEmailPayload();
  const content = `${payload.html || ''}\n${payload.text || ''}`;
  const match = content.match(/verify-account\?token=([^\s"<&]+)/);
  assert.ok(match?.[1], 'verification email must contain an opaque link token');
  return decodeURIComponent(match[1]);
};

const seedUser = ({
  role,
  email = `${role}-${Math.random().toString(16).slice(2)}@example.test`,
  password = 'SecurePass1!',
  isVerified = true,
  isActive = true,
  status = isVerified ? 'active' : 'pending',
}) => User.create({
  name: `${role} Test User`,
  email,
  password,
  role,
  isVerified,
  isActive,
  status,
  isFirstLogin: false,
});

const fullStaffToken = (user) => jwt.sign(
  {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    authLevel: STAFF_2FA_AUTH_LEVEL,
  },
  config.jwtSecret,
  { expiresIn: '1h' },
);

const plainToken = (user) => jwt.sign(
  { id: user._id.toString(), email: user.email, role: user.role },
  config.jwtSecret,
  { expiresIn: '1h' },
);

async function completeOtpLogin(user, password = 'SecurePass1!') {
  const login = await postJson('/api/auth/login', {
    email: user.email,
    password,
    require2FA: false,
    role: 'customer',
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.success, true);
  assert.equal(login.body.data.requiresOTP, true);
  assert.equal(login.body.data.token, undefined);
  assert.ok(login.body.data.challengeToken);

  const otpRecord = await OTP.findOne({ userId: user._id, purpose: 'login' });
  assert.ok(otpRecord);
  const emailPayload = latestEmailPayload();
  const recipients = Array.isArray(emailPayload.to) ? emailPayload.to : [emailPayload.to];
  assert.ok(recipients.includes(user.email));
  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: user._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: otpRecord.otp,
  });
  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data.token);
  assert.equal(jwt.verify(verified.body.data.token, config.jwtSecret).authLevel, STAFF_2FA_AUTH_LEVEL);
  return { login, verified, token: verified.body.data.token, otp: otpRecord.otp };
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-staff-auth-security-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  sentEmails.length = 0;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  globalThis.fetch = nativeFetch;
});

test('Sales, Quality Checker, Office Admin, and Administrator activate by link, then require login 2FA', async () => {
  const creator = await seedUser({ role: 'administrator', email: 'creator-admin@example.test' });
  const roleCases = [
    ['sales', 'sales.pending@example.test'],
    ['staff_quality_checker', 'qc.pending@example.test'],
    ['office_admin', 'office.pending@example.test'],
    ['administrator', 'administrator.pending@example.test'],
  ];

  for (const [role, email] of roleCases) {
    let staff;
    if (role === 'administrator') {
      staff = await seedUser({ role, email, isVerified: false, status: 'pending' });
      await issueStaffVerificationLink(staff);
    } else {
      const created = await postJson('/api/users', {
        name: `${role} Pending User`,
        email,
        role,
        password: 'SecurePass1!',
        confirmPassword: 'SecurePass1!',
        isVerified: true,
        status: 'active',
        require2FA: false,
      }, fullStaffToken(creator));

      assert.equal(created.response.status, 201);
      assert.equal(created.body.data.status, 'pending');
      assert.equal(created.body.data.isVerified, false);
      assert.equal(created.body.data.twoFactorRequired, true);
      assert.equal(created.body.data.verification.emailSent, true);
      assert.equal(created.body.data.verification.method, 'link');
      assert.equal(created.body.data.password, undefined);
      staff = await User.findOne({ email });
    }

    const verificationToken = latestStaffVerificationToken();
    const tokenRecord = await StaffVerificationToken.findOne({
      userId: staff._id,
      purpose: 'staff_email_verification',
      usedAt: null,
    });
    assert.ok(tokenRecord);
    assert.equal(await OTP.countDocuments({ userId: staff._id, purpose: 'signup' }), 0);
    assert.equal(latestEmailPayload().to, staff.email);

    const unverifiedLogin = await postJson('/api/auth/login', {
      email: staff.email,
      password: 'SecurePass1!',
    });
    assert.equal(unverifiedLogin.response.status, 403);
    assert.equal(unverifiedLogin.body.code, 'ACCOUNT_PENDING_VERIFICATION');
    assert.equal(unverifiedLogin.body.data.requiresEmailVerification, true);
    assert.equal(unverifiedLogin.body.data.requiresOtp, undefined);
    assert.equal(unverifiedLogin.body.data.token, undefined);
    assert.equal(await OTP.countDocuments({ userId: staff._id, purpose: 'login' }), 0);

    const pendingApi = await requestJson('/api/auth/me', { token: fullStaffToken(staff) });
    assert.equal(pendingApi.response.status, 403);

    const activation = await postJson('/api/auth/verify-staff-email', {
      token: verificationToken,
    });
    assert.equal(activation.response.status, 200);
    assert.equal(activation.body.data.requires2FA, true);
    assert.equal(activation.body.data.token, undefined);
    assert.equal(activation.body.data.user, undefined);

    const activeStaff = await User.findById(staff._id);
    assert.equal(activeStaff.isVerified, true);
    assert.equal(activeStaff.status, 'active');

    const reusedActivation = await postJson('/api/auth/verify-staff-email', {
      token: verificationToken,
    });
    assert.equal(reusedActivation.response.status, 409);
    assert.equal(reusedActivation.body.code, 'VERIFICATION_TOKEN_USED');

    const preOtpApi = await requestJson('/api/auth/me', { token: plainToken(activeStaff) });
    assert.equal(preOtpApi.response.status, 401);
    assert.equal(preOtpApi.body.code, 'STAFF_2FA_REQUIRED');

    const completed = await completeOtpLogin(activeStaff);
    const me = await requestJson('/api/auth/me', { token: completed.token });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.data.role, role);

    const replay = await postJson('/api/auth/verify-login-otp', {
      userId: activeStaff._id.toString(),
      challengeToken: completed.login.body.data.challengeToken,
      otp: completed.otp,
    });
    assert.notEqual(replay.response.status, 200);
  }
});

test('Customer, Sales, Quality Checker, Office Admin, and Administrator all require login OTP', async () => {
  const otpRoles = ['administrator', 'office_admin', 'sales', 'staff_quality_checker', 'customer'];
  assert.deepEqual([...LOGIN_OTP_REQUIRED_ROLES].sort(), [...otpRoles].sort());

  for (const role of otpRoles) {
    assert.equal(requiresLoginOtp(role), true);
    const user = await seedUser({ role });
    const completed = await completeOtpLogin(user);
    assert.equal(completed.verified.body.data.user.role, role);

    if (role === 'sales' || role === 'staff_quality_checker') {
      const forbidden = await postJson('/api/users', {
        name: 'Unauthorized Staff',
        email: `forbidden-${role}@example.test`,
        role: 'sales',
        password: 'SecurePass1!',
      }, completed.token);
      assert.equal(forbidden.response.status, 403);
    }
  }
});

test('customer mobile API contract supports registration, login, and password reset', async () => {
  const email = 'mobile.customer@custom-domain.test';
  const initialPassword = 'CustomerPass1!';
  const updatedPassword = 'CustomerPass2!';

  const sent = await postJson('/api/auth/send-otp', { email });
  assert.equal(sent.response.status, 200);
  const signupOtp = await OTP.findOne({ email, purpose: 'signup', verified: false });
  assert.ok(signupOtp);

  const ownership = await postJson('/api/auth/verify-otp', { email, otp: signupOtp.otp });
  assert.equal(ownership.response.status, 200);
  assert.equal(ownership.body.data.role, 'customer');
  assert.equal(ownership.body.data.token, undefined);

  const registered = await postJson('/api/auth/register', {
    name: 'Mobile Customer',
    email,
    password: initialPassword,
    phone: '+639171234567',
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.body.data.requiresOtp, false);
  const registeredUser = await User.findOne({ email });
  assert.ok(registeredUser);

  const login = await completeOtpLogin(registeredUser, initialPassword);
  assert.equal(login.verified.body.data.user.role, 'customer');
  assert.ok(login.verified.body.data.token);

  const forgot = await postJson('/api/auth/forgot-password', { email });
  assert.equal(forgot.response.status, 200);
  const resetOtp = await OTP.findOne({ email, purpose: 'password_reset', verified: false });
  assert.ok(resetOtp);

  const resetVerified = await postJson('/api/auth/verify-reset-otp', { email, otp: resetOtp.otp });
  assert.equal(resetVerified.response.status, 200);
  assert.equal(resetVerified.body.data.token, undefined);

  const reset = await postJson('/api/auth/reset-password', {
    email,
    otp: resetOtp.otp,
    newPassword: updatedPassword,
  });
  assert.equal(reset.response.status, 200);

  const oldPasswordLogin = await postJson('/api/auth/login', { email, password: initialPassword });
  assert.equal(oldPasswordLogin.response.status, 401);
  const newPasswordLogin = await completeOtpLogin(registeredUser, updatedPassword);
  assert.ok(newPasswordLogin.verified.body.data.token);
  assert.equal(newPasswordLogin.verified.body.data.user.role, 'customer');
});

test('activation and login resends require authorization/challenges and preserve cooldown plus attempts', async () => {
  const admin = await seedUser({ role: 'administrator', email: 'resend-admin@example.test' });
  const created = await postJson('/api/users', {
    name: 'Resend Quality Checker',
    email: 'resend-qc@example.test',
    role: 'staff_quality_checker',
    password: 'SecurePass1!',
    confirmPassword: 'SecurePass1!',
  }, fullStaffToken(admin));
  assert.equal(created.response.status, 201);
  const staff = await User.findOne({ email: 'resend-qc@example.test' });
  const originalRawToken = latestStaffVerificationToken();
  const originalActivation = await StaffVerificationToken.findOne({
    userId: staff._id,
    purpose: 'staff_email_verification',
    usedAt: null,
  });
  assert.ok(originalActivation);

  const immediateActivationResend = await postJson(
    `/api/users/${staff._id}/resend-verification`,
    {},
    fullStaffToken(admin),
  );
  assert.equal(immediateActivationResend.response.status, 429);

  const unauthenticatedActivationResend = await postJson(
    `/api/users/${staff._id}/resend-verification`,
    {},
  );
  assert.equal(unauthenticatedActivationResend.response.status, 401);

  await StaffVerificationToken.updateOne(
    { _id: originalActivation._id },
    { lastSentAt: new Date(Date.now() - 61_000) },
  );
  const activationResend = await postJson(
    `/api/users/${staff._id}/resend-verification`,
    {},
    fullStaffToken(admin),
  );
  assert.equal(activationResend.response.status, 200);
  const replacementRawToken = latestStaffVerificationToken();
  const replacementActivation = await StaffVerificationToken.findOne({
    userId: staff._id,
    purpose: 'staff_email_verification',
    usedAt: null,
  });
  assert.notEqual(String(replacementActivation._id), String(originalActivation._id));
  assert.ok((await StaffVerificationToken.findById(originalActivation._id)).usedAt);

  const invalidatedOriginal = await postJson('/api/auth/verify-staff-email', {
    token: originalRawToken,
  });
  assert.equal(invalidatedOriginal.response.status, 409);

  const activated = await postJson('/api/auth/verify-staff-email', {
    token: replacementRawToken,
  });
  assert.equal(activated.response.status, 200);

  const login = await postJson('/api/auth/login', {
    email: staff.email,
    password: 'SecurePass1!',
  });
  assert.equal(login.response.status, 200);
  const firstLoginOtp = await OTP.findOne({ userId: staff._id, purpose: 'login' });

  const repeatedPasswordLogin = await postJson('/api/auth/login', {
    email: staff.email,
    password: 'SecurePass1!',
  });
  assert.equal(repeatedPasswordLogin.response.status, 429);

  const immediateLoginResend = await postJson('/api/auth/resend-login-otp', {
    userId: staff._id.toString(),
    challengeToken: login.body.data.challengeToken,
  });
  assert.equal(immediateLoginResend.response.status, 429);

  const wrongCode = firstLoginOtp.otp === '000000' ? '000001' : '000000';
  const wrong = await postJson('/api/auth/verify-login-otp', {
    userId: staff._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: wrongCode,
  });
  assert.equal(wrong.response.status, 401);
  await OTP.updateOne(
    { _id: firstLoginOtp._id },
    { lastSentAt: new Date(Date.now() - 61_000) },
  );

  const resent = await postJson('/api/auth/resend-login-otp', {
    userId: staff._id.toString(),
    challengeToken: login.body.data.challengeToken,
  });
  assert.equal(resent.response.status, 200);
  const replacementLoginOtp = await OTP.findOne({ userId: staff._id, purpose: 'login' });
  assert.equal(replacementLoginOtp.attempts, 1);

  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: staff._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: replacementLoginOtp.otp,
  });
  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data.token);
});

test('three wrong login codes lock the live account and public unlock is unavailable', async () => {
  const sales = await seedUser({ role: 'sales', email: 'otp-lock-sales@example.test' });
  const login = await postJson('/api/auth/login', {
    email: sales.email,
    password: 'SecurePass1!',
  });
  const record = await OTP.findOne({ userId: sales._id, purpose: 'login' });
  const wrongCode = record.otp === '000000' ? '000001' : '000000';

  for (const expectedStatus of [401, 401, 429]) {
    const attempt = await postJson('/api/auth/verify-login-otp', {
      userId: sales._id.toString(),
      challengeToken: login.body.data.challengeToken,
      otp: wrongCode,
    });
    assert.equal(attempt.response.status, expectedStatus);
  }

  const lockedUser = await User.findById(sales._id);
  assert.ok(lockedUser.lockUntil > new Date());

  const correctWhileLocked = await postJson('/api/auth/verify-login-otp', {
    userId: sales._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: record.otp,
  });
  assert.equal(correctWhileLocked.response.status, 423);

  const passwordWhileLocked = await postJson('/api/auth/login', {
    email: sales.email,
    password: 'SecurePass1!',
  });
  assert.equal(passwordWhileLocked.response.status, 423);

  const publicUnlock = await postJson('/api/auth/unlock', { email: sales.email });
  assert.equal(publicUnlock.response.status, 401);
});

test('an expired password lock starts a fresh failure window without weakening staff 2FA', async () => {
  const administrator = await seedUser({
    role: 'administrator',
    email: 'expired-password-lock-admin@example.test',
  });
  await User.updateOne(
    { _id: administrator._id },
    {
      $set: {
        loginAttempts: 5,
        lockUntil: new Date(Date.now() - 60_000),
      },
    },
  );

  const firstWrongAttempt = await postJson('/api/auth/login', {
    email: administrator.email,
    password: 'WrongPassword1!',
  });
  assert.equal(firstWrongAttempt.response.status, 401);
  assert.equal(firstWrongAttempt.body.data.loginAttempts, 1);
  assert.equal(firstWrongAttempt.body.data.remainingAttempts, 4);
  assert.equal(firstWrongAttempt.body.data.token, undefined);
  assert.equal(await OTP.countDocuments({ userId: administrator._id, purpose: 'login' }), 0);

  let currentAdministrator = await User.findById(administrator._id);
  assert.equal(currentAdministrator.loginAttempts, 1);
  assert.equal(currentAdministrator.lockUntil, undefined);

  for (let attempt = 2; attempt <= 5; attempt += 1) {
    const result = await postJson('/api/auth/login', {
      email: administrator.email,
      password: 'WrongPassword1!',
    });
    assert.equal(result.response.status, attempt === 5 ? 423 : 401);
    if (attempt < 5) {
      assert.equal(result.body.data.loginAttempts, attempt);
      assert.equal(result.body.data.remainingAttempts, 5 - attempt);
    }
  }

  currentAdministrator = await User.findById(administrator._id);
  assert.equal(currentAdministrator.loginAttempts, 5);
  assert.ok(currentAdministrator.lockUntil > new Date());

  const correctPasswordWhileLocked = await postJson('/api/auth/login', {
    email: administrator.email,
    password: 'SecurePass1!',
  });
  assert.equal(correctPasswordWhileLocked.response.status, 423);
  assert.equal(await OTP.countDocuments({ userId: administrator._id, purpose: 'login' }), 0);

  await User.updateOne(
    { _id: administrator._id },
    { $set: { lockUntil: new Date(Date.now() - 1_000) } },
  );

  const passwordAccepted = await postJson('/api/auth/login', {
    email: administrator.email,
    password: 'SecurePass1!',
  });
  assert.equal(passwordAccepted.response.status, 200);
  assert.equal(passwordAccepted.body.data.requiresOTP, true);
  assert.equal(passwordAccepted.body.data.token, undefined);
  assert.ok(passwordAccepted.body.data.challengeToken);

  currentAdministrator = await User.findById(administrator._id);
  assert.equal(currentAdministrator.loginAttempts, 0);
  assert.equal(currentAdministrator.lockUntil, undefined);

  const loginOtp = await OTP.findOne({ userId: administrator._id, purpose: 'login' });
  assert.ok(loginOtp);
  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: administrator._id.toString(),
    challengeToken: passwordAccepted.body.data.challengeToken,
    otp: loginOtp.otp,
  });
  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data.token);
  assert.equal(
    jwt.verify(verified.body.data.token, config.jwtSecret).authLevel,
    STAFF_2FA_AUTH_LEVEL,
  );
});

test('expired, account-mismatched, and legacy code activation are rejected for pending staff', async () => {
  const admin = await seedUser({ role: 'administrator', email: 'activation-limits-admin@example.test' });

  const createPending = async (email, role) => {
    const created = await postJson('/api/users', {
      name: `Pending ${role}`,
      email,
      role,
      password: 'SecurePass1!',
      confirmPassword: 'SecurePass1!',
    }, fullStaffToken(admin));
    assert.equal(created.response.status, 201);
    return User.findOne({ email });
  };

  const expiredStaff = await createPending('expired-activation@example.test', 'sales');
  const expiredRawToken = latestStaffVerificationToken();
  const expiredTokenRecord = await StaffVerificationToken.findOne({
    userId: expiredStaff._id,
    purpose: 'staff_email_verification',
    usedAt: null,
  });
  await StaffVerificationToken.updateOne(
    { _id: expiredTokenRecord._id },
    { expiresAt: new Date(Date.now() - 1000) },
  );
  const expiredAttempt = await postJson('/api/auth/verify-staff-email', {
    token: expiredRawToken,
  });
  assert.equal(expiredAttempt.response.status, 410);
  assert.equal(expiredAttempt.body.code, 'VERIFICATION_TOKEN_EXPIRED');
  assert.equal((await User.findById(expiredStaff._id)).isVerified, false);

  const reboundStaff = await createPending('bound-activation@example.test', 'staff_quality_checker');
  const boundRawToken = latestStaffVerificationToken();
  await User.updateOne(
    { _id: reboundStaff._id },
    { $set: { email: 'changed-bound-activation@example.test' } },
  );
  const mismatchedAttempt = await postJson('/api/auth/verify-staff-email', {
    token: boundRawToken,
  });
  assert.equal(mismatchedAttempt.response.status, 400);
  assert.equal(mismatchedAttempt.body.code, 'VERIFICATION_ACCOUNT_MISMATCH');
  assert.equal((await User.findById(reboundStaff._id)).isVerified, false);

  const legacyOtp = await OTP.create({
    email: 'changed-bound-activation@example.test',
    otp: '123456',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    purpose: 'signup',
    userId: reboundStaff._id,
  });
  const legacyCodeAttempt = await postJson('/api/auth/verify-otp', {
    email: 'changed-bound-activation@example.test',
    otp: legacyOtp.otp,
  });
  assert.equal(legacyCodeAttempt.response.status, 400);
  assert.equal(legacyCodeAttempt.body.code, 'STAFF_VERIFICATION_LINK_REQUIRED');
  assert.equal((await User.findById(reboundStaff._id)).isVerified, false);

  const publicResend = await postJson('/api/auth/resend-otp', {
    email: 'changed-bound-activation@example.test',
  });
  assert.equal(publicResend.response.status, 400);
  assert.equal(publicResend.body.code, 'STAFF_VERIFICATION_LINK_REQUIRED');
});

test('activation CAS cannot overwrite a concurrent suspension or issue a JWT', async () => {
  const staff = await seedUser({
    role: 'sales',
    email: 'activation-race@example.test',
    isVerified: false,
    status: 'pending',
  });
  await issueStaffVerificationLink(staff);
  const rawToken = latestStaffVerificationToken();

  const originalFindOneAndUpdate = User.findOneAndUpdate;
  let injectedSuspension = false;
  User.findOneAndUpdate = function patchedFindOneAndUpdate(filter, update, options) {
    if (!injectedSuspension && update?.$set?.isVerified === true) {
      injectedSuspension = true;
      return (async () => {
        await User.collection.updateOne(
          { _id: staff._id },
          { $set: { status: 'suspended' } },
        );
        return originalFindOneAndUpdate.call(User, filter, update, options);
      })();
    }
    return originalFindOneAndUpdate.call(User, filter, update, options);
  };

  let activation;
  try {
    activation = await postJson('/api/auth/verify-staff-email', { token: rawToken });
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }

  assert.equal(injectedSuspension, true);
  assert.equal(activation.response.status, 409);
  assert.equal(activation.body.code, 'VERIFICATION_ACCOUNT_MISMATCH');
  assert.equal(activation.body.data?.token, undefined);

  const after = await User.findById(staff._id);
  assert.equal(after.status, 'suspended');
  assert.equal(after.isVerified, false);

  const consumedToken = await StaffVerificationToken.findOne({ userId: staff._id });
  assert.ok(consumedToken.usedAt);

  const replay = await postJson('/api/auth/verify-staff-email', { token: rawToken });
  assert.equal(replay.response.status, 409);
  assert.equal(replay.body.code, 'VERIFICATION_TOKEN_USED');
  assert.equal(replay.body.data?.token, undefined);
});

test('staff email changes cannot be used to take over a stronger staff account', async () => {
  const administrator = await seedUser({ role: 'administrator', email: 'bootstrap-admin@example.test' });
  const officeAdmin = await seedUser({ role: 'office_admin', email: 'office-manager@example.test' });
  const sales = await seedUser({ role: 'sales', email: 'self-email-sales@example.test' });

  const officeTargetsBootstrap = await requestJson(`/api/users/${administrator._id}`, {
    method: 'PUT',
    token: fullStaffToken(officeAdmin),
    body: JSON.stringify({ email: 'attacker-owned@example.test' }),
  });
  assert.equal(officeTargetsBootstrap.response.status, 403);
  assert.equal((await User.findById(administrator._id)).email, 'bootstrap-admin@example.test');

  const selfEmailChange = await requestJson('/api/users/profile', {
    method: 'PATCH',
    token: fullStaffToken(sales),
    body: JSON.stringify({ email: 'self-attacker@example.test' }),
  });
  assert.equal(selfEmailChange.response.status, 403);
  assert.equal((await User.findById(sales._id)).email, 'self-email-sales@example.test');
});

test('invalid, wrong, expired, replayed, and unauthenticated customer login challenges are rejected', async () => {
  const customer = await seedUser({ role: 'customer', email: 'customer.challenge@example.test' });

  const wrongPassword = await postJson('/api/auth/login', {
    email: customer.email,
    password: 'WrongPassword1!',
  });
  assert.equal(wrongPassword.response.status, 401);
  assert.equal(await OTP.countDocuments({ userId: customer._id, purpose: 'login' }), 0);

  const login = await postJson('/api/auth/login', {
    email: customer.email,
    password: 'SecurePass1!',
  });
  const record = await OTP.findOne({ userId: customer._id, purpose: 'login' });

  const noChallengeResend = await postJson('/api/auth/resend-login-otp', { userId: customer._id.toString() });
  assert.equal(noChallengeResend.response.status, 400);

  const fakeChallenge = await postJson('/api/auth/verify-login-otp', {
    userId: customer._id.toString(),
    challengeToken: 'a'.repeat(43),
    otp: record.otp,
  });
  assert.equal(fakeChallenge.response.status, 401);

  const wrongOtp = await postJson('/api/auth/verify-login-otp', {
    userId: customer._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: record.otp === '000000' ? '000001' : '000000',
  });
  assert.equal(wrongOtp.response.status, 401);

  await OTP.updateOne({ _id: record._id }, { expiresAt: new Date(Date.now() - 1000) });
  const expired = await postJson('/api/auth/verify-login-otp', {
    userId: customer._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: record.otp,
  });
  assert.equal(expired.response.status, 400);

  const noToken = await requestJson('/api/auth/me');
  assert.equal(noToken.response.status, 401);
});

test('password-reset OTP is purpose-bound and can never create a staff session', async () => {
  const admin = await seedUser({ role: 'administrator', email: 'reset-admin@example.test' });
  const forgot = await postJson('/api/auth/forgot-password', { email: admin.email });
  assert.equal(forgot.response.status, 200);

  const resetOtp = await OTP.findOne({ email: admin.email, purpose: 'password_reset' });
  assert.ok(resetOtp);
  assert.equal(await OTP.countDocuments({ email: admin.email, purpose: 'signup' }), 0);

  const wrongPurpose = await postJson('/api/auth/verify-otp', {
    email: admin.email,
    otp: resetOtp.otp,
  });
  assert.notEqual(wrongPurpose.response.status, 200);
  assert.equal(wrongPurpose.body.data?.token, undefined);

  const resetVerified = await postJson('/api/auth/verify-reset-otp', {
    email: admin.email,
    otp: resetOtp.otp,
  });
  assert.equal(resetVerified.response.status, 200);
  assert.equal(resetVerified.body.data.token, undefined);

  const reset = await postJson('/api/auth/reset-password', {
    email: admin.email,
    otp: resetOtp.otp,
    newPassword: 'NewSecurePass2!',
  });
  assert.equal(reset.response.status, 200);

  const reusedReset = await postJson('/api/auth/reset-password', {
    email: admin.email,
    otp: resetOtp.otp,
    newPassword: 'AnotherPass3!',
  });
  assert.notEqual(reusedReset.response.status, 200);
});

test('disabled account remains blocked after a valid password creates a challenge', async () => {
  const qc = await seedUser({ role: 'staff_quality_checker', email: 'disabled-qc@example.test' });
  const login = await postJson('/api/auth/login', { email: qc.email, password: 'SecurePass1!' });
  const otp = await OTP.findOne({ userId: qc._id, purpose: 'login' });
  await User.updateOne({ _id: qc._id }, { isActive: false, status: 'suspended' });

  const verify = await postJson('/api/auth/verify-login-otp', {
    userId: qc._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: otp.otp,
  });
  assert.equal(verify.response.status, 403);
  assert.equal(verify.body.data?.token, undefined);
});
