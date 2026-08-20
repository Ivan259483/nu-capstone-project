import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY ||= 'T'.repeat(32);

const { createEncryptionService } = await import('../utils/encryption.utils.js');
const { default: Order } = await import('../models/order.model.js');
const { default: User } = await import('../models/user.model.js');

const unavailableKeyService = createEncryptionService({
  currentKey: 'X'.repeat(32),
  logger: { info() {}, warn() {} },
});

test('unreadable order ciphertext is suppressed without becoming a pending write', () => {
  const ciphertext = unavailableKeyService.encrypt('legacy order value');
  const order = Order.hydrate({
    _id: '64b000000000000000000001',
    orderNumber: 'ORDER-TEST',
    customer: '64b000000000000000000002',
    vehiclePlate: ciphertext,
    notes: ciphertext,
  });

  assert.equal(order.vehiclePlate, null);
  assert.equal(order.notes, null);
  assert.deepEqual(order.modifiedPaths(), []);
});

test('unreadable user ciphertext is suppressed without becoming a pending write', () => {
  const ciphertext = unavailableKeyService.encrypt('legacy user value');
  const user = User.hydrate({
    _id: '64b000000000000000000003',
    name: 'Encryption Test',
    email: 'encryption-test@example.com',
    phone: ciphertext,
    address: ciphertext,
  });

  assert.equal(user.phone, null);
  assert.equal(user.address, null);
  assert.deepEqual(user.modifiedPaths(), []);
});
