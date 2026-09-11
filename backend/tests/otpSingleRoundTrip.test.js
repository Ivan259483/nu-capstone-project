/**
 * Regression cover for the OTP double round trip.
 *
 * The reported defect: after verifying a signup code the user was returned to
 * the sign-in screen, had to sign in again, received a SECOND code, and only
 * then received a session. These tests pin the contract the clients rely on so
 * the bounce cannot come back:
 *
 *   sign up  -> exactly one code -> verify -> usable session, no second code
 *   sign in  -> exactly one code -> verify -> usable session, no second code
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'otp_single_round_trip_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_otp_single_round_trip';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
const sentEmails = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    sentEmails.push(JSON.parse(String(init?.body || '{}')));
    return new Response(JSON.stringify({ id: `otp_email_${sentEmails.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return nativeFetch(input, init);
};

const { default: OTP } = await import('../models/oTP.model.js');
const { default: User } = await import('../models/user.model.js');
const authRoutes = (await import('../routes/auth.routes.js')).default;

const MOBILE_HEADERS = { 'X-Client-Type': 'mobile' };
const PASSWORD = 'CustomerSecure1!';

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

/** Every OTP email delivered to this address, oldest first. */
const otpEmailsFor = (email) => {
  const normalized = String(email).toLowerCase();
  return sentEmails.filter((entry) => {
    const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
    return recipients.some((recipient) => String(recipient).toLowerCase() === normalized)
      && /\b\d{6}\b/.test(String(entry.text || ''));
  });
};

const latestOtpCode = (email) => {
  const emails = otpEmailsFor(email);
  assert.ok(emails.length > 0, `expected an OTP email for ${email}`);
  return String(emails[emails.length - 1].text).match(/\b(\d{6})\b/)[1];
};

const registerCustomer = async (email, { mobile = false } = {}) => {
  const registered = await postJson('/api/auth/register', {
    name: 'Round Trip Customer',
    email,
    password: PASSWORD,
    phone: '+639171234567',
  }, { mobile });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.body.data.requiresOtp, true);
  return registered;
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-otp-single-round-trip-test'));

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

test('customer signup issues a usable session from the first OTP, on mobile and web', async () => {
  for (const mobile of [true, false]) {
    await mongoose.connection.db.dropDatabase();
    sentEmails.length = 0;

    const email = `signup-${mobile ? 'mobile' : 'web'}@example.test`;
    await registerCustomer(email, { mobile });

    // Exactly one code for the signup request — no duplicate send.
    assert.equal(otpEmailsFor(email).length, 1);

    const verified = await postJson('/api/auth/verify-otp', {
      email,
      otp: latestOtpCode(email),
    }, { mobile });

    assert.equal(verified.response.status, 200);
    assert.equal(verified.body.data.verified, true);
    // The session the clients must consume instead of returning to sign-in.
    assert.ok(verified.body.data.token, 'verify-otp must return a session token');
    assert.ok(verified.body.data.user, 'verify-otp must return the user object');
    assert.equal(verified.body.data.user.role, 'customer');
    assert.ok(verified.body.data.user.email);
    assert.equal(verified.body.data.user.password, undefined);

    // That session authorizes protected routes immediately — no second sign-in.
    const me = await requestJson('/api/auth/me', {
      token: verified.body.data.token,
      mobile,
    });
    assert.equal(me.response.status, 200);
    // /auth/me returns the user object directly under `data`.
    assert.equal(me.body.data.email, email);

    // And no second code was ever sent.
    assert.equal(otpEmailsFor(email).length, 1, 'a second OTP must never be sent');
  }
});

test('customer login issues a session from the first OTP with no extra round trip', async () => {
  const email = 'login-round-trip@example.test';
  await registerCustomer(email, { mobile: true });
  const activation = await postJson('/api/auth/verify-otp', {
    email,
    otp: latestOtpCode(email),
  }, { mobile: true });
  assert.ok(activation.body.data.token);

  const emailsAfterSignup = otpEmailsFor(email).length;

  const login = await postJson('/api/auth/login', { email, password: PASSWORD }, { mobile: true });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.requiresOTP, true);
  // Login must never hand out a session token.
  assert.equal(login.body.data.token, undefined);
  assert.ok(login.body.data.challengeToken);
  assert.ok(login.body.data.maskedEmail);
  assert.equal(typeof login.body.data.expiresIn, 'number');

  // Exactly one code for the login attempt.
  assert.equal(otpEmailsFor(email).length, emailsAfterSignup + 1);

  const user = await User.findOne({ email });
  const verified = await postJson('/api/auth/verify-login-otp', {
    userId: user._id.toString(),
    challengeToken: login.body.data.challengeToken,
    otp: latestOtpCode(email),
  }, { mobile: true });

  assert.equal(verified.response.status, 200);
  assert.ok(verified.body.data.token);
  assert.equal(verified.body.data.user.role, 'customer');

  const me = await requestJson('/api/auth/me', { token: verified.body.data.token, mobile: true });
  assert.equal(me.response.status, 200);
  assert.equal(otpEmailsFor(email).length, emailsAfterSignup + 1, 'a second login OTP must never be sent');
});

test('the opaque login challenge is never accepted as a session token', async () => {
  const email = 'challenge-not-a-session@example.test';
  await registerCustomer(email, { mobile: true });
  await postJson('/api/auth/verify-otp', { email, otp: latestOtpCode(email) }, { mobile: true });

  const login = await postJson('/api/auth/login', { email, password: PASSWORD }, { mobile: true });
  const challengeToken = login.body.data.challengeToken;
  assert.ok(challengeToken);

  const rejected = await requestJson('/api/auth/me', { token: challengeToken, mobile: true });
  assert.equal(rejected.response.status, 401);
  assert.equal(rejected.body.success, false);
});

test('a signup OTP is single use and reports distinct failure reasons', async () => {
  const email = 'single-use@example.test';
  await registerCustomer(email, { mobile: true });
  const code = latestOtpCode(email);

  const wrongCode = code === '000000' ? '111111' : '000000';
  const invalid = await postJson('/api/auth/verify-otp', { email, otp: wrongCode }, { mobile: true });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.code, 'OTP_INVALID');
  assert.equal(typeof invalid.body.data.remainingAttempts, 'number');
  assert.ok(invalid.body.data.remainingAttempts > 0);

  const accepted = await postJson('/api/auth/verify-otp', { email, otp: code }, { mobile: true });
  assert.equal(accepted.response.status, 200);
  assert.ok(accepted.body.data.token);

  // The record is consumed, so a replay cannot mint a second session.
  const replay = await postJson('/api/auth/verify-otp', { email, otp: code }, { mobile: true });
  assert.notEqual(replay.response.status, 200);
  assert.equal(replay.body.data?.token, undefined);
  assert.equal(await OTP.countDocuments({ email, purpose: 'signup' }), 0);
});

test('an expired signup OTP reports OTP_EXPIRED so the client can offer a resend inline', async () => {
  const email = 'expired-code@example.test';
  await registerCustomer(email, { mobile: true });
  const code = latestOtpCode(email);

  await OTP.updateOne(
    { email, purpose: 'signup' },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );

  const expired = await postJson('/api/auth/verify-otp', { email, otp: code }, { mobile: true });
  assert.equal(expired.response.status, 400);
  assert.equal(expired.body.code, 'OTP_EXPIRED');
  assert.equal(expired.body.data?.token, undefined);
});

test('staff email verification still refuses to mint a session', async () => {
  const email = 'office-admin@example.test';
  await User.create({
    name: 'Office Admin',
    email,
    password: PASSWORD,
    role: 'office_admin',
    isActive: true,
    isVerified: false,
    status: 'pending',
  });

  const attempt = await postJson('/api/auth/verify-otp', { email, otp: '123456' });
  assert.equal(attempt.response.status, 400);
  assert.equal(attempt.body.code, 'STAFF_VERIFICATION_LINK_REQUIRED');
  assert.equal(attempt.body.data?.token, undefined);
});
