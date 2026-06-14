import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const {
  resolvePhoneForClient,
  resolveReceiptPhoneForClient,
} = await import('../utils/phone-client.utils.js');
const {
  hydrateReceiptSnapshot,
} = await import('../utils/receiptSnapshot.utils.js');

const phoneFields = [
  'phone',
  'phoneNumber',
  'contactNumber',
  'mobileNumber',
  'contactNo',
];

test('phone resolver supports canonical and legacy saved user fields', () => {
  for (const field of phoneFields) {
    assert.equal(
      resolvePhoneForClient({ [field]: '09171234567' }),
      '+639171234567'
    );
  }
});

test('receipt resolver supports nested customer, user, booking, payment, and receipt fields', () => {
  const cases = [
    { customer: { phone: '09171234567' } },
    { user: { phoneNumber: '09181234567' } },
    { booking: { customer: { contactNumber: '09191234567' } } },
    { payment: { customer: { mobileNumber: '09201234567' } } },
    { receipt: { customer: { contactNo: '09211234567' } } },
  ];

  const expected = [
    '+639171234567',
    '+639181234567',
    '+639191234567',
    '+639201234567',
    '+639211234567',
  ];

  cases.forEach((source, index) => {
    assert.equal(resolveReceiptPhoneForClient(source), expected[index]);
  });
});

test('receipt resolver ignores empty placeholders and undecryptable ciphertext', () => {
  assert.equal(
    resolveReceiptPhoneForClient(
      { customerPhone: 'undefined', customer: { phone: 'null' } },
      { user: { contactNo: '-' } }
    ),
    ''
  );
  assert.equal(
    resolveReceiptPhoneForClient({
      customer: { phone: '0123456789abcdef0123456789abcdef:deadbeef' },
    }),
    ''
  );
});

test('receipt snapshot keeps saved phone and uses current customer only as fallback', () => {
  const saved = hydrateReceiptSnapshot(
    {
      customerPhone: '+639171111111',
      vehicle: { type: 'Sedan' },
    },
    {
      customer: { phone: '+639182222222' },
      vehicle: { color: 'Red', vehicleType: 'SUV' },
    }
  );
  assert.equal(saved.customerPhone, '+639171111111');
  assert.equal(saved.vehicle.type, 'Sedan');
  assert.equal(saved.vehicle.color, 'Red');

  const fallback = hydrateReceiptSnapshot(
    { vehicle: {} },
    {
      customer: { contactNumber: '09193334444' },
      vehicle: { vehicleType: 'Sedan' },
    }
  );
  assert.equal(fallback.customerPhone, '+639193334444');
  assert.equal(fallback.vehicle.type, 'Sedan');

  const missing = hydrateReceiptSnapshot(
    { customerPhone: 'undefined' },
    { customer: {} }
  );
  assert.equal(Object.hasOwn(missing, 'customerPhone'), false);
});
