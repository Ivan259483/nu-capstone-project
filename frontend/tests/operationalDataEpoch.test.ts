import assert from 'node:assert/strict';
import test from 'node:test';
import { syncOperationalDataEpoch } from '../src/lib/operational-data-epoch.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };
}

test('an operational epoch change clears only operational browser caches', () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  let dispatched = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
      dispatchEvent() { dispatched += 1; },
    },
  });

  try {
    syncOperationalDataEpoch(7);
    localStorage.setItem('autospf_token', 'jwt');
    localStorage.setItem('adminhub_theme', 'dark');
    localStorage.setItem('autospf_settings', '{"currency":"PHP"}');
    localStorage.setItem('autospf_bookings', '[{"id":"demo"}]');
    localStorage.setItem('inspection_order-1', '{"demo":true}');
    sessionStorage.setItem('autospf:scan:demo', '{"demo":true}');

    const result = syncOperationalDataEpoch(8);
    assert.equal(result.changed, true);
    assert.equal(localStorage.getItem('autospf_bookings'), null);
    assert.equal(localStorage.getItem('inspection_order-1'), null);
    assert.equal(sessionStorage.getItem('autospf:scan:demo'), null);
    assert.equal(localStorage.getItem('autospf_token'), 'jwt');
    assert.equal(localStorage.getItem('adminhub_theme'), 'dark');
    assert.equal(localStorage.getItem('autospf_settings'), '{"currency":"PHP"}');
    assert.equal(dispatched, 1);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
