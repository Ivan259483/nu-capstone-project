import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

process.env.JWT_SECRET ||= 'mail_reliability_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 're_test_mail_reliability';
process.env.RESEND_FROM_EMAIL ||= 'security@example.test';
process.env.EMAIL_PROVIDER = 'resend';
process.env.EMAIL_RETRY_DELAY_MS = '0';
process.env.NODE_ENV = 'test';

const nativeFetch = globalThis.fetch.bind(globalThis);
let fetchBehavior = async () => new Response(JSON.stringify({ id: 'email_default' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const providerCalls = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (String(url).includes('api.resend.com')) {
    providerCalls.push({ url: String(url), init });
    return fetchBehavior(input, init);
  }
  return nativeFetch(input, init);
};

const {
  classifyEmailDeliveryError,
  sendOtpEmail,
} = await import('../utils/mail.utils.js');

beforeEach(() => {
  providerCalls.length = 0;
  fetchBehavior = async () => new Response(JSON.stringify({ id: 'email_default' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

after(() => {
  globalThis.fetch = nativeFetch;
});

test('one transient provider failure is retried once with the same idempotency key', async () => {
  let attempt = 0;
  fetchBehavior = async () => {
    attempt += 1;
    if (attempt === 1) {
      return new Response(JSON.stringify({
        name: 'application_error',
        statusCode: 503,
        message: 'Temporary provider outage',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ id: 'email_after_retry' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await sendOtpEmail('retry@example.test', '123456', {
    purpose: 'login',
    otpRecordId: 'otp-record-retry',
    requestId: 'request-retry',
  });

  assert.equal(result.success, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(providerCalls.length, 2);
  const idempotencyKeys = providerCalls.map(({ init }) => new Headers(init.headers).get('idempotency-key'));
  assert.ok(idempotencyKeys[0]);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
});

test('network resolution failure is retried no more than once', async () => {
  fetchBehavior = async () => {
    throw Object.assign(new Error('simulated DNS resolution error'), { code: 'EAI_AGAIN' });
  };

  const result = await sendOtpEmail('network@example.test', '123456', {
    purpose: 'login',
    otpRecordId: 'otp-record-network',
    requestId: 'request-network',
  });

  assert.equal(result.success, false);
  assert.equal(result.attempts, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.classification.transient, true);
  assert.equal(providerCalls.length, 2);
});

test('provider authentication failure is not retried', async () => {
  fetchBehavior = async () => new Response(JSON.stringify({
    name: 'authentication_error',
    statusCode: 401,
    message: 'Invalid API key',
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await sendOtpEmail('auth-failure@example.test', '123456', {
    purpose: 'login',
    otpRecordId: 'otp-record-auth-failure',
    requestId: 'request-auth-failure',
  });

  assert.equal(result.success, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.classification.authFailure, true);
  assert.equal(result.classification.retryable, false);
  assert.equal(providerCalls.length, 1);
});

test('SMTP DATA-phase timeout is treated as ambiguous and is never retried', () => {
  const classification = classifyEmailDeliveryError(
    Object.assign(new Error('Connection timed out after DATA'), {
      code: 'ETIMEDOUT',
      command: 'DATA',
    }),
    { provider: 'smtp' },
  );

  assert.equal(classification.transient, true);
  assert.equal(classification.ambiguousDelivery, true);
  assert.equal(classification.retryable, false);
});

test('temporary SMTP mailbox response is retryable before the DATA phase', () => {
  const classification = classifyEmailDeliveryError(
    Object.assign(new Error('Mailbox temporarily unavailable'), {
      code: 'EENVELOPE',
      responseCode: 451,
      command: 'RCPT TO',
    }),
    { provider: 'gmail' },
  );

  assert.equal(classification.authFailure, false);
  assert.equal(classification.validationFailure, false);
  assert.equal(classification.transient, true);
  assert.equal(classification.retryable, true);
  assert.equal(classification.ambiguousDelivery, false);
});
