import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNetworkRetryDelayMs,
  NETWORK_RETRY_LIMIT,
  shareInFlightRequest,
} from '../src/services/api/retryPolicy.ts';

test('network retries use exponential delays capped at 30 seconds', () => {
  assert.equal(NETWORK_RETRY_LIMIT, 5);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => getNetworkRetryDelayMs(index + 1)),
    [2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000],
  );
});

test('same-key callers share one active request and a later call starts fresh', async () => {
  const requests = new Map();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const createRequest = async () => {
    calls += 1;
    await pending;
    return 'done';
  };

  const first = shareInFlightRequest(requests, '/bookings', createRequest);
  const overlapping = shareInFlightRequest(requests, '/bookings', createRequest);
  assert.equal(first, overlapping);
  await Promise.resolve();
  assert.equal(calls, 1);

  release();
  assert.equal(await first, 'done');
  assert.equal(requests.size, 0);

  assert.equal(await shareInFlightRequest(requests, '/bookings', createRequest), 'done');
  assert.equal(calls, 2);
});
