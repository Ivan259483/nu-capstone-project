import crypto from 'crypto';

/** Matches backend `encrypt()` output: 32-char hex IV + colon + hex ciphertext */
const ENCRYPTED_FIELD_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const ALGORITHM = 'aes-256-cbc';
const REQUIRED_KEY_BYTES = 32;

function describeKey(key) {
  const byteLength = key ? Buffer.byteLength(key, 'utf8') : 0;
  return {
    present: Boolean(key),
    byteLength,
    valid: byteLength === REQUIRED_KEY_BYTES,
  };
}

function decryptWithKey(ciphertext, key) {
  const keyInfo = describeKey(key);
  if (!keyInfo.valid) {
    throw new Error(`invalid key length (${keyInfo.byteLength} bytes)`);
  }

  const [ivHex, encryptedHex] = String(ciphertext).split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('missing iv or ciphertext');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function tryDecryptWithNamedKey(ciphertext, keyName) {
  try {
    return {
      ok: true,
      value: decryptWithKey(ciphertext, process.env[keyName]),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Decrypt order PII fields when Mongoose post-init hooks did not run (e.g. `.lean()`).
 * If decryption fails, return the raw stored value so consumers can still show
 * that a note exists instead of collapsing the UI to an empty state.
 */
export function safeDecryptOrderField(val, fieldName = 'orderField') {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val).trim();
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (!ENCRYPTED_FIELD_PATTERN.test(trimmed)) return trimmed;

  console.log('Decrypt attempt:', {
    hasKey: !!process.env.ENCRYPTION_KEY,
    noteLength: trimmed.length,
  });

  const primary = tryDecryptWithNamedKey(trimmed, 'ENCRYPTION_KEY');
  if (primary.ok) {
    const plain = String(primary.value || '').trim();
    return plain || trimmed;
  }

  const legacy = tryDecryptWithNamedKey(trimmed, 'LEGACY_ENCRYPTION_KEY');
  if (legacy.ok) {
    console.warn('[orderFieldDecrypt] Decrypted order field with LEGACY_ENCRYPTION_KEY.', {
      field: fieldName,
      noteLength: trimmed.length,
    });
    const plain = String(legacy.value || '').trim();
    return plain || trimmed;
  }

  console.warn('[orderFieldDecrypt] Failed to decrypt order field; returning raw stored value.', {
    field: fieldName,
    hasKey: !!process.env.ENCRYPTION_KEY,
    keyBytes: describeKey(process.env.ENCRYPTION_KEY).byteLength,
    hasLegacyKey: !!process.env.LEGACY_ENCRYPTION_KEY,
    legacyKeyBytes: describeKey(process.env.LEGACY_ENCRYPTION_KEY).byteLength,
    noteLength: trimmed.length,
    primaryReason: primary.reason,
    legacyReason: legacy.reason,
  });

  return trimmed;
}
