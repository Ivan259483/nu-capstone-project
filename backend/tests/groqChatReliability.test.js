import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GROQ_CHAT_MODEL,
  formatGroqApiError,
  getGroqReasoningOptions,
  resolveGroqModel,
  runGroqWithRetry,
} from '../utils/groqChat.utils.js';

const providerError = (status, options = {}) => {
  const error = new Error(options.message || `Provider returned ${status}`);
  error.response = {
    status,
    data: { error: { code: options.code, message: error.message } },
    headers: options.headers || {},
  };
  return error;
};

test('uses the supported production model and migrates the retired Llama alias', () => {
  assert.equal(DEFAULT_GROQ_CHAT_MODEL, 'openai/gpt-oss-20b');
  assert.equal(resolveGroqModel(), DEFAULT_GROQ_CHAT_MODEL);
  assert.equal(resolveGroqModel('llama-3.1-8b-instant'), DEFAULT_GROQ_CHAT_MODEL);
  assert.equal(resolveGroqModel('openai/gpt-oss-120b'), 'openai/gpt-oss-120b');
  assert.deepEqual(getGroqReasoningOptions(DEFAULT_GROQ_CHAT_MODEL), {
    reasoning_effort: 'low',
  });
  assert.deepEqual(getGroqReasoningOptions('qwen/qwen3.8-27b'), {});
});

test('classifies provider rate limits and preserves Retry-After without exposing internals', () => {
  const details = formatGroqApiError(providerError(429, {
    code: 'rate_limit_exceeded',
    headers: { 'retry-after': '2' },
  }));

  assert.equal(details.publicCode, 'AI_RATE_LIMITED');
  assert.equal(details.statusCode, 429);
  assert.equal(details.retryable, true);
  assert.equal(details.retryAfterMs, 2_000);
});

test('retries only bounded transient provider failures', async () => {
  let attempts = 0;
  const result = await runGroqWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw providerError(503, { headers: { 'retry-after-ms': '0' } });
    }
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('does not retry authentication or invalid request failures', async () => {
  for (const status of [400, 401, 403]) {
    let attempts = 0;
    await assert.rejects(
      runGroqWithRetry(async () => {
        attempts += 1;
        throw providerError(status);
      }),
    );
    assert.equal(attempts, 1);
  }
});

test('classifies timeouts, network failures, and empty responses separately', () => {
  const timeout = new Error('Request timed out');
  timeout.code = 'ECONNABORTED';
  assert.equal(formatGroqApiError(timeout).publicCode, 'AI_TIMEOUT');

  const network = new Error('socket hang up');
  network.code = 'ECONNRESET';
  assert.equal(formatGroqApiError(network).publicCode, 'AI_PROVIDER_UNAVAILABLE');

  const empty = new Error('Empty completion');
  empty.code = 'GROQ_EMPTY_RESPONSE';
  assert.equal(formatGroqApiError(empty).publicCode, 'AI_BAD_RESPONSE');
});
