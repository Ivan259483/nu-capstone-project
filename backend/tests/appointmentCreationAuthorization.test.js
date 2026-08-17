import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeOrderCreation } from '../middleware/orderCreationAuthorization.middleware.js';

const runGuard = ({ role, body = {} }) => {
  let nextCalled = false;
  let statusCode = 200;
  let payload;
  const req = { user: { role }, body };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };

  authorizeOrderCreation(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, payload };
};

test('customer accounts may create their own scheduled appointments', () => {
  const result = runGuard({
    role: 'customer',
    body: { bookingDate: '2099-08-17', bookingTime: '08:00' },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test('admin roles receive 403 when directly attempting to create an appointment', () => {
  for (const role of ['administrator', 'office_admin', 'sales']) {
    const result = runGuard({
      role,
      body: { bookingDate: '2099-08-17', bookingTime: '08:00' },
    });

    assert.equal(result.nextCalled, false, role);
    assert.equal(result.statusCode, 403, role);
    assert.equal(result.payload?.errorCode, 'APPOINTMENT_CUSTOMER_ONLY', role);
  }
});

test('authorized POS roles may still create explicitly unscheduled walk-in orders', () => {
  for (const role of ['administrator', 'sales']) {
    const result = runGuard({ role, body: { isWalkIn: true } });
    assert.equal(result.nextCalled, true, role);
  }

  const officeAdmin = runGuard({ role: 'office_admin', body: { isWalkIn: true } });
  assert.equal(officeAdmin.nextCalled, false);
  assert.equal(officeAdmin.statusCode, 403);
});
