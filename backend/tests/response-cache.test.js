import assert from 'node:assert/strict';
import test from 'node:test';

const {
  clearResponseCache,
  getOrSetResponseCache,
  invalidateResponseCache,
} = await import('../utils/responseCache.utils.js');

test('response cache reuses fresh values and supports prefix invalidation', async () => {
  clearResponseCache();
  let loads = 0;
  const loader = async () => ({ value: ++loads });

  const first = await getOrSetResponseCache('qc:stats:all', 1_000, loader);
  const second = await getOrSetResponseCache('qc:stats:all', 1_000, loader);
  assert.equal(first.status, 'MISS');
  assert.equal(second.status, 'HIT');
  assert.equal(loads, 1);

  invalidateResponseCache('qc:');
  const third = await getOrSetResponseCache('qc:stats:all', 1_000, loader);
  assert.equal(third.status, 'MISS');
  assert.equal(loads, 2);
});

test('response cache coalesces concurrent database loaders', async () => {
  clearResponseCache();
  let loads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = async () => {
    loads += 1;
    await gate;
    return 'done';
  };

  const first = getOrSetResponseCache('ai:scans:first', 1_000, loader);
  const second = getOrSetResponseCache('ai:scans:first', 1_000, loader);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.value, 'done');
  assert.equal(secondResult.value, 'done');
  assert.equal(secondResult.status, 'COALESCED');
  assert.equal(loads, 1);
});

test('invalidation during a load does not repopulate stale data', async () => {
  clearResponseCache();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const staleLoad = getOrSetResponseCache('qc:activity:first', 1_000, async () => {
    await gate;
    return 'stale';
  });

  invalidateResponseCache('qc:');
  release();
  await staleLoad;
  const fresh = await getOrSetResponseCache('qc:activity:first', 1_000, async () => 'fresh');

  assert.equal(fresh.status, 'MISS');
  assert.equal(fresh.value, 'fresh');
});
