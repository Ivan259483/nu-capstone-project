import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ||= 'socket_authorization_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const {
  getLimitedDbChangePayload,
  isSocketRoomAuthorized,
} = await import('../utils/socket.utils.js');

test('anonymous sockets cannot join staff, admin, booking, or customer rooms', () => {
  assert.equal(isSocketRoomAuthorized(undefined, 'admin:chat'), false);
  assert.equal(isSocketRoomAuthorized(undefined, 'booking:approvals'), false);
  assert.equal(isSocketRoomAuthorized(undefined, 'user:victim-id'), false);
  assert.equal(isSocketRoomAuthorized(undefined, 'staff:victim-id'), false);
  assert.equal(isSocketRoomAuthorized(undefined, 'chat:public_session_123'), true);
});

test('authenticated sockets can join only rooms authorized by live identity and role', () => {
  const sales = { id: 'sales-id', role: 'sales' };
  const qualityChecker = { id: 'qc-id', role: 'staff_quality_checker' };
  const customer = { id: 'customer-id', role: 'customer' };

  assert.equal(isSocketRoomAuthorized(sales, 'user:sales-id'), true);
  assert.equal(isSocketRoomAuthorized(sales, 'user:customer-id'), false);
  assert.equal(isSocketRoomAuthorized(sales, 'booking:approvals'), true);
  assert.equal(isSocketRoomAuthorized(sales, 'admin:chat'), false);
  assert.equal(isSocketRoomAuthorized(qualityChecker, 'admin:chat'), true);
  assert.equal(isSocketRoomAuthorized(qualityChecker, 'staff:qc-id'), true);
  assert.equal(isSocketRoomAuthorized(customer, 'staff:customer-id'), false);
  assert.equal(isSocketRoomAuthorized(customer, 'booking:approvals'), false);
});

test('limited realtime invalidations never contain full documents or object IDs', () => {
  const limited = getLimitedDbChangePayload({
    collection: 'orders',
    operationType: 'update',
    documentKey: { _id: 'private-order-id' },
    fullDocument: {
      customerName: 'Private Customer',
      customerPhone: '+639171234567',
      paymentStatus: 'paid',
    },
  });

  assert.deepEqual(limited, { collection: 'orders', operationType: 'update' });
  assert.equal('fullDocument' in limited, false);
  assert.equal('documentKey' in limited, false);
});
