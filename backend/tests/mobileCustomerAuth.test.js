import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'mobile_customer_auth_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_mobile_customer_auth';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
const sentEmails = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    sentEmails.push(JSON.parse(String(init?.body || '{}')));
    return new Response(JSON.stringify({ id: `mobile_email_${sentEmails.length}` }), {
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

const MOBILE_HEADERS = { 'X-Client-Type': 'mobile' };
const PASSWORD = 'MobileSecure1!';

let mongo;
let server;
let baseUrl;

const requestJson = async (path, { token, mobile = false, ...options } = {}) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(mobile ? MOBILE_HEADERS : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const postJson = (path, body, options = {}) => requestJson(path, {
  ...options,
  method: 'POST',
  body: JSON.stringify(body),
});

const seedUser = ({
  role,
  email = `${role}-${Math.random().toString(16).slice(2)}@example.test`,
  isActive = true,
  isVerified = true,
}) => User.create({
  name: `${role} Mobile Auth User`,
  email,
  password: PASSWORD,
  role,
  isActive,
  isVerified,
  status: isVerified ? 'active' : 'pending',
});

const latestOtpCode = (email) => {
  const normalized = String(email).toLowerCase();
  const payload = [...sentEmails].reverse().find((entry) => {
    const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
    return recipients.some((recipient) => String(recipient).toLowerCase() === normalized)
      && /\b\d{6}\b/.test(String(entry.text || ''));
  });
  assert.ok(payload, `expected an OTP email for ${email}`);
  return String(payload.text).match(/\b(\d{6})\b/)[1];
};

const startOtpLogin = (user, { mobile = false } = {}) => postJson('/api/auth/login', {
  email: user.email,
  password: PASSWORD,
}, { mobile });

const completeOtpLogin = async (user, { mobile = false } = {}) => {
  const login = await startOtpLogin(user, { mobile });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data?.requiresOTP, true);
  assert.equal(login.body.data?.token, undefined);

  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: user._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: latestOtpCode(user.email),
  }, { mobile });
  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data?.token);
  return { login, verified, token: verified.body.data.token };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-mobile-customer-auth-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
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

test('Mobile password + OTP authentication allows Customer and blocks every staff role before OTP', async () => {
  const customer = await seedUser({ role: 'customer', email: 'mobile-customer@example.test' });
  const completed = await completeOtpLogin(customer, { mobile: true });
  assert.equal(completed.verified.body.data.user.role, 'customer');
  assert.equal(jwt.verify(completed.token, config.jwtSecret).clientType, 'mobile');

  const me = await requestJson('/api/auth/me', { token: completed.token, mobile: true });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.role, 'customer');

  for (const role of ['administrator', 'office_admin', 'sales', 'staff_quality_checker']) {
    const staff = await seedUser({ role });
    const rejected = await startOtpLogin(staff, { mobile: true });
    assert.equal(rejected.response.status, 403, `${role} must be denied on Mobile`);
    assert.equal(rejected.body.code, 'MOBILE_CUSTOMER_ONLY');
    assert.match(rejected.body.message, /Customer Mobile App/);
    assert.equal(await OTP.countDocuments({ userId: staff._id, purpose: 'login' }), 0);
  }
});

test('unknown, null, and missing database roles fail closed on Mobile', async () => {
  const cases = [
    ['unexpected_role', { $set: { role: 'unexpected_role' } }],
    ['null', { $set: { role: null } }],
    ['missing', { $unset: { role: 1 } }],
  ];

  for (const [label, update] of cases) {
    const user = await seedUser({
      role: 'customer',
      email: `${label}-role@example.test`,
    });
    await User.collection.updateOne({ _id: user._id }, update);

    const rejected = await postJson('/api/auth/login', {
      email: user.email,
      password: PASSWORD,
    }, { mobile: true });
    assert.notEqual(rejected.response.status, 200, `${label} role must be denied`);
    assert.equal(rejected.body.data?.token, undefined);
    assert.equal(await OTP.countDocuments({ userId: user._id, purpose: 'login' }), 0);
  }
});

test('Mobile OTP verification cannot convert a valid Web staff challenge into a Mobile session', async () => {
  const staff = await seedUser({ role: 'sales', email: 'web-sales-challenge@example.test' });
  const webLogin = await startOtpLogin(staff);
  assert.equal(webLogin.response.status, 200);
  const otp = latestOtpCode(staff.email);

  const mobileVerify = await postJson('/api/auth/verify-login-otp', {
    userId: staff._id.toString(),
    challengeToken: webLogin.body.data.challengeToken,
    otp,
  }, { mobile: true });
  assert.equal(mobileVerify.response.status, 403);
  assert.equal(mobileVerify.body.code, 'MOBILE_CUSTOMER_ONLY');
  assert.equal(mobileVerify.body.data?.token, undefined);

  const webVerify = await postJson('/api/auth/verify-login-otp', {
    userId: staff._id.toString(),
    challengeToken: webLogin.body.data.challengeToken,
    otp,
  });
  assert.equal(webVerify.response.status, 200);
  assert.ok(webVerify.body.data.token, 'the same staff account must remain usable on Web');
  assert.equal(jwt.verify(webVerify.body.data.token, config.jwtSecret).clientType, undefined);
});

test('Administrator, Sales, and Quality Checker Web authentication remains operational', async () => {
  for (const role of ['administrator', 'sales', 'staff_quality_checker']) {
    const staff = await seedUser({
      role,
      email: `web-regression-${role}@example.test`,
    });
    const completed = await completeOtpLogin(staff);
    assert.equal(completed.verified.body.data.user.role, role);

    const me = await requestJson('/api/auth/me', { token: completed.token });
    assert.equal(me.response.status, 200, `${role} Web session must remain valid`);
    assert.equal(me.body.data.role, role);
  }
});

test('persisted staff/Web sessions are rejected and live role changes revoke Mobile access', async () => {
  for (const role of ['administrator', 'sales', 'staff_quality_checker']) {
    const staff = await seedUser({ role });
    const webToken = jwt.sign({
      id: staff._id.toString(),
      email: staff.email,
      role,
      authVersion: 0,
      authLevel: STAFF_2FA_AUTH_LEVEL,
    }, config.jwtSecret, { expiresIn: '1h' });

    const rejected = await requestJson('/api/auth/me', {
      token: webToken,
      mobile: true,
    });
    assert.equal(rejected.response.status, 403, `${role} persisted session must be revoked`);
    assert.equal(rejected.body.code, 'MOBILE_CUSTOMER_ONLY');
  }

  const customer = await seedUser({ role: 'customer', email: 'role-change@example.test' });
  const mobileSession = await completeOtpLogin(customer, { mobile: true });
  await User.collection.updateOne({ _id: customer._id }, { $set: { role: 'sales' } });

  const changedRole = await requestJson('/api/auth/me', {
    token: mobileSession.token,
    mobile: true,
  });
  assert.equal(changedRole.response.status, 403);
  assert.equal(changedRole.body.code, 'MOBILE_CUSTOMER_ONLY');
});

test('a Customer Web JWT is not accepted as a Mobile-bound session', async () => {
  const customer = await seedUser({ role: 'customer', email: 'web-customer@example.test' });
  const webSession = await completeOtpLogin(customer);

  const webMe = await requestJson('/api/auth/me', { token: webSession.token });
  assert.equal(webMe.response.status, 200);

  const mobileMe = await requestJson('/api/auth/me', {
    token: webSession.token,
    mobile: true,
  });
  assert.equal(mobileMe.response.status, 401);
  assert.equal(mobileMe.body.code, 'MOBILE_SESSION_REQUIRED');
});

test('disabled Customers remain blocked from Mobile authentication', async () => {
  const disabled = await seedUser({
    role: 'customer',
    email: 'disabled-mobile-customer@example.test',
    isActive: false,
  });
  const rejected = await startOtpLogin(disabled, { mobile: true });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.code, 'ACCOUNT_INACTIVE');
  assert.equal(await OTP.countDocuments({ userId: disabled._id, purpose: 'login' }), 0);
});
