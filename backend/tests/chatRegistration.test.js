import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const {
  parseChatRegistrationBody,
} = await import('../services/chatRegistration.service.js');

test('chat registration requires mobile number before setup email flow', () => {
  const parsed = parseChatRegistrationBody({
    firstName: 'Ivan',
    lastName: 'Tadena',
    email: 'ivan@example.com',
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 400);
  assert.match(parsed.message, /phone|mobile|number/i);
});

test('chat registration accepts required fields without any password input', () => {
  const parsed = parseChatRegistrationBody({
    firstName: 'Ivan',
    lastName: 'Tadena',
    email: 'Ivan@Example.com',
    phone: '09199453262',
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.fullName, 'Ivan Tadena');
  assert.equal(parsed.email, 'ivan@example.com');
  assert.equal(parsed.phone, '+639199453262');
  assert.equal(Object.hasOwn(parsed, 'password'), false);
});
