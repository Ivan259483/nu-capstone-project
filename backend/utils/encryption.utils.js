import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const REQUIRED_KEY_BYTES = 32;

// Existing persisted format: 16-byte hex IV, a colon, then one or more
// complete AES-CBC blocks encoded as hex. Keep this stable for compatibility.
export const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{32})+$/i;
const ENCRYPTED_VALUE_PREFIX_PATTERN = /^[0-9a-f]{32}:/i;

const validateKey = (name, value, { required }) => {
  if (!value) {
    if (required) {
      throw new Error(`[encryption.utils] ${name} must be configured as exactly 32 UTF-8 bytes.`);
    }
    return null;
  }

  if (Buffer.byteLength(value, 'utf8') !== REQUIRED_KEY_BYTES) {
    throw new Error(`[encryption.utils] ${name} must be exactly 32 UTF-8 bytes.`);
  }

  return Buffer.from(value, 'utf8');
};

const decodeUtf8 = (buffer) => new TextDecoder('utf-8', { fatal: true }).decode(buffer);

export const isEncryptedValue = (value) =>
  typeof value === 'string' && ENCRYPTED_VALUE_PATTERN.test(value);

export const looksLikeEncryptedValue = (value) =>
  typeof value === 'string' && ENCRYPTED_VALUE_PREFIX_PATTERN.test(value);

/**
 * Build an isolated encryption service. Exported for deterministic key-rotation
 * tests; application code uses the environment-backed default instance below.
 */
export function createEncryptionService({
  currentKey,
  legacyKey,
  logger = console,
  announceConfiguration = false,
} = {}) {
  const currentKeyBuffer = validateKey('ENCRYPTION_KEY', currentKey, { required: true });
  const legacyKeyBuffer = validateKey('LEGACY_ENCRYPTION_KEY', legacyKey, { required: false });

  if (
    legacyKeyBuffer
    && crypto.timingSafeEqual(currentKeyBuffer, legacyKeyBuffer)
  ) {
    throw new Error('[encryption.utils] LEGACY_ENCRYPTION_KEY must differ from ENCRYPTION_KEY.');
  }

  if (announceConfiguration) {
    logger.info?.('[Encryption] Current key configured: true');
    logger.info?.(`[Encryption] Legacy key configured: ${Boolean(legacyKeyBuffer)}`);
  }

  let legacyDecryptCount = 0;
  let unreadableDecryptCount = 0;
  let legacyWarningEmitted = false;
  let unreadableWarningEmitted = false;

  const tryDecrypt = (ciphertext, keyBuffer) => {
    if (!keyBuffer || !isEncryptedValue(ciphertext)) return null;

    try {
      const [ivHex, encryptedHex] = ciphertext.split(':');
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        keyBuffer,
        Buffer.from(ivHex, 'hex')
      );
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
      ]);

      // A wrong CBC key can rarely produce valid padding. Reject invalid UTF-8
      // as an additional compatibility-safe check, without changing the format.
      return decodeUtf8(plaintext);
    } catch {
      return null;
    }
  };

  const decryptWithMetadata = (value) => {
    if (value === null || value === undefined || value === '') {
      return { status: 'plaintext', value };
    }

    if (typeof value !== 'string' || !looksLikeEncryptedValue(value)) {
      return { status: 'plaintext', value };
    }

    // Values with the encryption prefix but an invalid IV/cipher block shape
    // are corrupted ciphertext, not trustworthy plaintext.
    if (!isEncryptedValue(value)) {
      return { status: 'unreadable', value: null };
    }

    const currentPlaintext = tryDecrypt(value, currentKeyBuffer);
    if (currentPlaintext !== null) {
      return { status: 'current', value: currentPlaintext };
    }

    const legacyPlaintext = tryDecrypt(value, legacyKeyBuffer);
    if (legacyPlaintext !== null) {
      return { status: 'legacy', value: legacyPlaintext };
    }

    return { status: 'unreadable', value: null };
  };

  /** New writes always use the current key and the existing iv:ciphertext format. */
  const encrypt = (value) => {
    if (value === null || value === undefined || value === '') return value;

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, currentKeyBuffer, iv);
      const encrypted = Buffer.concat([
        cipher.update(String(value), 'utf8'),
        cipher.final(),
      ]);
      return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    } catch {
      // Never persist plaintext merely because encryption failed.
      throw new Error('[encryption.utils] Encryption failed.');
    }
  };

  /**
   * Compatibility API for normal reads. Plaintext passes through, current and
   * legacy ciphertext decrypt, and unreadable ciphertext is suppressed.
   */
  const decrypt = (value) => {
    const result = decryptWithMetadata(value);

    if (result.status === 'legacy') {
      legacyDecryptCount += 1;
      if (!legacyWarningEmitted) {
        legacyWarningEmitted = true;
        logger.warn?.(
          '[encryption.utils] Legacy ciphertext detected; run the controlled key migration. Further legacy warnings are suppressed.'
        );
      }
    } else if (result.status === 'unreadable') {
      unreadableDecryptCount += 1;
      if (!unreadableWarningEmitted) {
        unreadableWarningEmitted = true;
        logger.warn?.(
          '[encryption.utils] Encrypted value could not be decrypted with the configured keys; value suppressed. Further mismatch warnings are suppressed.'
        );
      }
    }

    return result.value;
  };

  /**
   * Pure, idempotent migration primitive. It changes legacy ciphertext only,
   * verifies the new value with the current key, and never mutates storage.
   */
  const migrateEncryptedValue = (value) => {
    const before = decryptWithMetadata(value);
    if (before.status !== 'legacy') {
      return { status: before.status, value };
    }

    const migratedValue = encrypt(before.value);
    const verification = decryptWithMetadata(migratedValue);
    if (verification.status !== 'current' || verification.value !== before.value) {
      throw new Error('[encryption.utils] Re-encryption verification failed.');
    }

    return { status: 'migrated', value: migratedValue };
  };

  const getTelemetry = () => ({
    legacyDecryptCount,
    unreadableDecryptCount,
  });

  const getKeyStatus = () => ({
    currentConfigured: true,
    legacyConfigured: Boolean(legacyKeyBuffer),
  });

  return {
    decrypt,
    decryptWithMetadata,
    encrypt,
    getKeyStatus,
    getTelemetry,
    migrateEncryptedValue,
  };
}

const defaultService = createEncryptionService({
  currentKey: process.env.ENCRYPTION_KEY,
  legacyKey: process.env.LEGACY_ENCRYPTION_KEY,
  announceConfiguration: true,
});

export const decrypt = defaultService.decrypt;
export const decryptWithMetadata = defaultService.decryptWithMetadata;
export const encrypt = defaultService.encrypt;
export const getEncryptionKeyStatus = defaultService.getKeyStatus;
export const getEncryptionTelemetry = defaultService.getTelemetry;
export const migrateEncryptedValue = defaultService.migrateEncryptedValue;
