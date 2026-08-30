import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CUSTOMER_BOOKING_PATH,
  CUSTOMER_DASHBOARD_PATH,
  LOGIN_REDIRECT_STORAGE_KEY,
  appendPostLoginRedirect,
  consumePostLoginRedirect,
  getAccountEntryPath,
  getBookingEntryPath,
  getSafeLoginRedirect,
  persistPostLoginRedirect,
  resolvePostAuthDestination,
} from '../src/lib/auth-redirect.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function readFrontendSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${relativePath}`, import.meta.url)), 'utf8');
}

test('normal Login and booking CTAs keep distinct guest intents', () => {
  assert.equal(getAccountEntryPath(null), '/login');
  assert.equal(getBookingEntryPath(null), '/login?redirect=/customer/book');
  assert.equal(getBookingEntryPath('customer'), CUSTOMER_BOOKING_PATH);
});

test('authenticated staff never enter customer booking', () => {
  assert.equal(getBookingEntryPath('administrator'), '/admin/dashboard');
  assert.equal(getBookingEntryPath('office_admin'), '/admin/dashboard');
  assert.equal(getBookingEntryPath('sales'), '/sales/dashboard');
  assert.equal(getBookingEntryPath('staff_quality_checker'), '/detailer/dashboard');

  for (const role of ['administrator', 'office_admin', 'sales', 'staff_quality_checker']) {
    assert.notEqual(resolvePostAuthDestination(CUSTOMER_BOOKING_PATH, role), CUSTOMER_BOOKING_PATH);
  }
  assert.equal(resolvePostAuthDestination(CUSTOMER_BOOKING_PATH, 'unknown-role'), CUSTOMER_DASHBOARD_PATH);
});

test('redirect validation allows only approved customer routes', () => {
  assert.equal(getSafeLoginRedirect('/customer/dashboard'), CUSTOMER_DASHBOARD_PATH);
  assert.equal(getSafeLoginRedirect('/customer/book'), CUSTOMER_BOOKING_PATH);
  assert.equal(getSafeLoginRedirect('%2Fcustomer%2Fbook'), CUSTOMER_BOOKING_PATH);
  assert.equal(getSafeLoginRedirect('/customer/dashboard?ref=ASPF-123#status'), '/customer/dashboard?ref=ASPF-123#status');

  for (const rejected of [
    'http://evil.example',
    'https://evil.example/customer/book',
    '//evil.example/customer/book',
    'javascript:alert(1)',
    '/admin/dashboard',
    '/sales/dashboard',
    '/detailer/dashboard',
    '/customer/book/extra',
  ]) {
    assert.equal(getSafeLoginRedirect(rejected), '', rejected);
  }
});

test('booking intent survives registration and OTP then is consumed once', () => {
  const storage = memoryStorage();
  persistPostLoginRedirect(CUSTOMER_BOOKING_PATH, storage);
  assert.equal(
    appendPostLoginRedirect('/verify-otp?email=customer%40example.com&from=register', CUSTOMER_BOOKING_PATH),
    '/verify-otp?email=customer%40example.com&from=register&redirect=%2Fcustomer%2Fbook',
  );
  assert.equal(consumePostLoginRedirect(null, storage, 'customer'), CUSTOMER_BOOKING_PATH);
  assert.equal(storage.getItem(LOGIN_REDIRECT_STORAGE_KEY), null);
  assert.equal(consumePostLoginRedirect(null, storage, 'customer'), CUSTOMER_DASHBOARD_PATH);
});

test('normal Login clears stale booking intent', () => {
  const storage = memoryStorage({ [LOGIN_REDIRECT_STORAGE_KEY]: CUSTOMER_BOOKING_PATH });
  persistPostLoginRedirect(null, storage);
  assert.equal(storage.getItem(LOGIN_REDIRECT_STORAGE_KEY), null);
  assert.equal(consumePostLoginRedirect(null, storage, 'customer'), CUSTOMER_DASHBOARD_PATH);
});

test('public booking CTAs share the booking entry helper while Login uses account intent', () => {
  const navbar = readFrontendSource('components/Navbar.tsx');
  assert.match(navbar, /to=\{accountEntryPath\}/);
  assert.match(navbar, /to=\{bookingEntryPath\}/);

  for (const sourcePath of [
    'components/HeroSection.tsx',
    'components/BookingCTA.tsx',
    'components/services/LuxuryServiceCard.tsx',
    'pages/Gallery.tsx',
  ]) {
    const source = readFrontendSource(sourcePath);
    assert.match(source, /getBookingEntryPath/);
    assert.match(source, /to=\{bookingEntryPath\}/);
  }
});

test('registration carries booking intent into OTP instead of relying on transient component state', () => {
  const login = readFrontendSource('pages/Login.tsx');
  const otp = readFrontendSource('pages/VerifyOtpPage.tsx');

  assert.match(
    login,
    /appendPostLoginRedirect\(\s*`\/verify-otp\?email=\$\{encodeURIComponent\(emailNorm\)\}&from=register`,\s*redirectParamTo/,
  );
  assert.match(otp, /consumePostLoginRedirect\(redirectParamTo, sessionStorage, role\)/);
  assert.match(otp, /appendPostLoginRedirect\(\s*fromRegister \? "\/login\?verified=1"/);
});
