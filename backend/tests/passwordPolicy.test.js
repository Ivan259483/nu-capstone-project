import assert from 'node:assert/strict';
import test from 'node:test';
import { validationResult } from 'express-validator';
import { validateResetPassword } from '../middleware/validation.middleware.js';

async function getResetValidationErrors(body) {
  const req = { body: { ...body } };

  for (const validator of validateResetPassword.slice(0, -1)) {
    await validator.run(req);
  }

  return validationResult(req).array().map(({ field, msg, path }) => ({
    field: field || path,
    message: msg,
  }));
}

const validResetRequest = {
  email: 'user@example.com',
  otp: '123456',
};

test('reset-password rejects a password without a special character', async () => {
  const errors = await getResetValidationErrors({
    ...validResetRequest,
    newPassword: 'Password123',
  });

  assert.deepEqual(errors, [
    {
      field: 'newPassword',
      message: 'Password must contain at least one special character',
    },
  ]);
});

test('reset-password accepts a strong password with a special character', async () => {
  const errors = await getResetValidationErrors({
    ...validResetRequest,
    newPassword: 'Password123!',
    confirmPassword: 'Password123!',
  });

  assert.deepEqual(errors, []);
});

test('reset-password rejects mismatched confirmation when supplied', async () => {
  const errors = await getResetValidationErrors({
    ...validResetRequest,
    newPassword: 'Password123!',
    confirmPassword: 'Different123!',
  });

  assert.deepEqual(errors, [
    {
      field: 'confirmPassword',
      message: 'Passwords do not match',
    },
  ]);
});
