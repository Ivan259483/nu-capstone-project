import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountPreferenceStore } from '../src/lib/account-preference-store.ts';
import { canUpdatePassword, formatRegionalPreview, getPasswordRequirements, getProfileCompletion, REGIONAL_OPTIONS } from '../src/lib/customer-account-settings.ts';
import { CUSTOMER_REGIONAL_OPTIONS } from '../../backend/utils/customerRegionalPreferences.utils.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('completion counts only the original three fields, with no invented photo requirement', () => {
  assert.deepEqual(getProfileCompletion({ name: 'Customer', email: 'customer@example.test' }), { percent: 67, missing: ['Phone number'] });
  assert.equal(getProfileCompletion({ name: 'Customer', email: 'customer@example.test', phone: '+639123456789' }).percent, 100);
  assert.equal(getProfileCompletion({ name: ' ', email: '', phone: '' }).percent, 0);
});

test('password meter and submit gating match all five requirements', () => {
  assert.equal(getPasswordRequirements('').filter((rule) => rule.met).length, 0);
  const password = 'SecurePass123!';
  assert.equal(getPasswordRequirements(password).filter((rule) => rule.met).length, 5);
  for (const weak of ['Aa1!', 'password123!', 'PASSWORD123!', 'Password!!!', 'Password123']) {
    assert.equal(canUpdatePassword({ current: 'Current123!', newPass: weak, confirm: weak }), false);
  }
  assert.equal(canUpdatePassword({ current: password, newPass: password, confirm: password }), false);
  assert.equal(canUpdatePassword({ current: '', newPass: password, confirm: password }), false);
  assert.equal(canUpdatePassword({ current: 'Current123!', newPass: password, confirm: 'different' }), false);
  assert.equal(canUpdatePassword({ current: 'Current123!', newPass: password, confirm: password }), true);
});

test('regional options match backend and preview honors timezone at a date boundary', () => {
  assert.deepEqual(REGIONAL_OPTIONS, CUSTOMER_REGIONAL_OPTIONS);
  const preferences = { language: 'English', region: null, timezone: 'Asia/Manila', dateFormat: 'YYYY-MM-DD' } as const;
  assert.match(formatRegionalPreview(preferences, new Date('2026-09-05T20:00:00Z'))!, /^2026-09-06/);
  assert.equal(formatRegionalPreview({ ...preferences, timezone: null }, new Date()), null);
});

test('preferences remain unavailable until loaded and failed loads can retry', async () => {
  let attempts = 0;
  const store = createAccountPreferenceStore({ load: async () => { if (++attempts === 1) throw new Error('Offline'); return { push: true }; }, save: async () => ({ push: false }) });
  store.update({ push: false });
  assert.equal(store.getSnapshot().value, null);
  await store.load();
  assert.equal(store.getSnapshot().error, 'Offline');
  assert.equal(store.getSnapshot().value, null);
  await store.load();
  assert.deepEqual(store.getSnapshot().value, { push: true });
});

test('rapid toggles serialize and persist the final value even when it returns to the original', async () => {
  const requests: { patch: Partial<{ push: boolean }>; response: ReturnType<typeof deferred<{ push: boolean }>> }[] = [];
  const store = createAccountPreferenceStore({ load: async () => ({ push: true }), save: (patch) => {
    const response = deferred<{ push: boolean }>(); requests.push({ patch, response }); return response.promise;
  } });
  await store.load(); store.update({ push: false }); store.update({ push: true });
  assert.equal(requests.length, 1);
  assert.equal(store.getSnapshot().value?.push, true);
  requests[0].response.resolve({ push: false }); await settle();
  assert.deepEqual(requests[1].patch, { push: true });
  requests[1].response.resolve({ push: true }); await settle();
  assert.deepEqual(store.getSnapshot().confirmed, { push: true });
  assert.equal(store.getSnapshot().saving, false);
});

test('failed saves roll back failed intent without dropping newer edits to another field', async () => {
  const first = deferred<{ push: boolean; email: boolean }>();
  const patches: object[] = [];
  const store = createAccountPreferenceStore({ load: async () => ({ push: true, email: true }), save: async (patch) => {
    patches.push(patch); if (patches.length === 1) return first.promise; return { push: true, email: false };
  } });
  await store.load(); store.update({ push: false }); store.update({ email: false });
  first.reject(new Error('Save failed')); await settle();
  assert.deepEqual(patches, [{ push: false }, { email: false }]);
  assert.deepEqual(store.getSnapshot().value, { push: true, email: false });
  assert.equal(store.getSnapshot().error, 'Save failed');
  assert.equal(store.getSnapshot().saving, false);
});

test('disposal prevents queued writes and stale account responses from reaching subscribers', async () => {
  const response = deferred<{ push: boolean }>();
  let calls = 0;
  const store = createAccountPreferenceStore({ load: async () => ({ push: true }), save: async () => { calls++; return response.promise; } });
  await store.load(); store.update({ push: false }); store.update({ push: true }); store.dispose();
  const snapshot = store.getSnapshot();
  response.resolve({ push: false }); await settle();
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot(), snapshot);
});
