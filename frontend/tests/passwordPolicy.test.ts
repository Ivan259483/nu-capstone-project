import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordPolicyError } from '../src/lib/password-policy.ts';

test('change-password policy rejects a password without a special character', () => {
  assert.equal(
    getPasswordPolicyError('SecurePass123'),
    'New password must contain at least one special character (e.g. ! @ # *)',
  );
});

test('change-password policy accepts a strong password with a special character', () => {
  assert.equal(getPasswordPolicyError('SecurePass123!'), null);
});

