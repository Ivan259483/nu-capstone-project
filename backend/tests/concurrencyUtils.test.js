import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../utils/concurrency.utils.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

test('never exceeds the configured concurrency limit', async () => {
  let inFlight = 0;
  let peak = 0;

  await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 2, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });

  assert.equal(peak, 2);
});

test('preserves input order regardless of completion order', async () => {
  const gates = [deferred(), deferred(), deferred()];

  const run = mapWithConcurrency([0, 1, 2], 3, async (value) => {
    await gates[value].promise;
    return `item-${value}`;
  });

  // Finish out of order.
  gates[2].resolve();
  gates[0].resolve();
  gates[1].resolve();

  assert.deepEqual(await run, ['item-0', 'item-1', 'item-2']);
});

test('returns an empty array for no items and never calls the worker', async () => {
  let calls = 0;
  const result = await mapWithConcurrency([], 2, async () => { calls += 1; });
  assert.deepEqual(result, []);
  assert.equal(calls, 0);
});

test('treats a limit below one as sequential rather than stalling', async () => {
  let inFlight = 0;
  let peak = 0;

  const result = await mapWithConcurrency([1, 2, 3], 0, async (value) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    return value;
  });

  assert.equal(peak, 1);
  assert.deepEqual(result, [1, 2, 3]);
});

test('a rejected worker rejects the whole call', async () => {
  await assert.rejects(
    () => mapWithConcurrency([1, 2], 2, async (value) => {
      if (value === 2) throw new Error('worker failed');
      return value;
    }),
    /worker failed/
  );
});
