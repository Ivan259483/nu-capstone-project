import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY ||= 'T'.repeat(32);

const {
  createEncryptionService,
  isEncryptedValue,
  looksLikeEncryptedValue,
} = await import('../utils/encryption.utils.js');

const CURRENT_KEY = 'C'.repeat(32);
const LEGACY_KEY = 'L'.repeat(32);
const THIRD_KEY = 'X'.repeat(32);

const quietLogger = () => {
  const messages = { info: [], warn: [] };
  return {
    messages,
    logger: {
      info: (message) => messages.info.push(String(message)),
      warn: (message) => messages.warn.push(String(message)),
    },
  };
};

test('current-key encryption preserves the existing format and round trips', () => {
  const service = createEncryptionService({ currentKey: CURRENT_KEY, logger: quietLogger().logger });
  const ciphertext = service.encrypt('current secret');

  assert.equal(isEncryptedValue(ciphertext), true);
  assert.equal(service.decrypt(ciphertext), 'current secret');
  assert.deepEqual(service.decryptWithMetadata(ciphertext), {
    status: 'current',
    value: 'current secret',
  });
});

test('rotated service decrypts legacy ciphertext but writes only with the current key', () => {
  const legacyService = createEncryptionService({ currentKey: LEGACY_KEY, logger: quietLogger().logger });
  const rotatedService = createEncryptionService({
    currentKey: CURRENT_KEY,
    legacyKey: LEGACY_KEY,
    logger: quietLogger().logger,
  });
  const legacyCiphertext = legacyService.encrypt('legacy secret');
  const newCiphertext = rotatedService.encrypt('new secret');

  assert.deepEqual(rotatedService.decryptWithMetadata(legacyCiphertext), {
    status: 'legacy',
    value: 'legacy secret',
  });
  assert.deepEqual(rotatedService.decryptWithMetadata(newCiphertext), {
    status: 'current',
    value: 'new secret',
  });
});

test('ordinary plaintext remains compatible while ciphertext-shaped corruption fails closed', () => {
  const { logger, messages } = quietLogger();
  const service = createEncryptionService({ currentKey: CURRENT_KEY, logger });
  const malformedCiphertext = `${'a'.repeat(32)}:00`;

  assert.equal(service.decrypt('Apartment 3: West Wing'), 'Apartment 3: West Wing');
  assert.equal(looksLikeEncryptedValue(malformedCiphertext), true);
  assert.equal(isEncryptedValue(malformedCiphertext), false);
  assert.equal(service.decrypt(malformedCiphertext), null);
  assert.equal(service.decrypt(malformedCiphertext), null);
  assert.equal(messages.warn.length, 1, 'repeated unreadable values must not flood logs');
  assert.deepEqual(service.getTelemetry(), {
    legacyDecryptCount: 0,
    unreadableDecryptCount: 2,
  });
});

test('valid ciphertext from an unavailable key is suppressed when no legacy key is configured', () => {
  const unavailableService = createEncryptionService({ currentKey: THIRD_KEY, logger: quietLogger().logger });
  const currentOnlyService = createEncryptionService({ currentKey: CURRENT_KEY, logger: quietLogger().logger });

  let ciphertext;
  do {
    ciphertext = unavailableService.encrypt('unavailable legacy secret');
  } while (currentOnlyService.decryptWithMetadata(ciphertext).status !== 'unreadable');

  assert.equal(currentOnlyService.decrypt(ciphertext), null);
  assert.deepEqual(currentOnlyService.decryptWithMetadata(ciphertext), {
    status: 'unreadable',
    value: null,
  });
});

test('migration re-encrypts verified legacy ciphertext and is idempotent', () => {
  const legacyService = createEncryptionService({ currentKey: LEGACY_KEY, logger: quietLogger().logger });
  const rotatedService = createEncryptionService({
    currentKey: CURRENT_KEY,
    legacyKey: LEGACY_KEY,
    logger: quietLogger().logger,
  });
  const original = legacyService.encrypt('migrate exactly once');

  const firstPass = rotatedService.migrateEncryptedValue(original);
  assert.equal(firstPass.status, 'migrated');
  assert.notEqual(firstPass.value, original);
  assert.deepEqual(rotatedService.decryptWithMetadata(firstPass.value), {
    status: 'current',
    value: 'migrate exactly once',
  });

  const secondPass = rotatedService.migrateEncryptedValue(firstPass.value);
  assert.deepEqual(secondPass, { status: 'current', value: firstPass.value });
});

test('key configuration fails fast without exposing key contents', () => {
  assert.throws(
    () => createEncryptionService({ currentKey: 'short', logger: quietLogger().logger }),
    /ENCRYPTION_KEY must be exactly 32 UTF-8 bytes/
  );
  assert.throws(
    () => createEncryptionService({
      currentKey: CURRENT_KEY,
      legacyKey: 'short',
      logger: quietLogger().logger,
    }),
    /LEGACY_ENCRYPTION_KEY must be exactly 32 UTF-8 bytes/
  );
  assert.throws(
    () => createEncryptionService({
      currentKey: CURRENT_KEY,
      legacyKey: CURRENT_KEY,
      logger: quietLogger().logger,
    }),
    /LEGACY_ENCRYPTION_KEY must differ/
  );
});
