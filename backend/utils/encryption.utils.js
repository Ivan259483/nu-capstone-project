import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ── Fail-fast: validate primary key at module load time ─────────────────────
// aes-256-cbc requires exactly 32 bytes (256 bits).
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || Buffer.byteLength(ENCRYPTION_KEY, 'utf8') !== 32) {
  throw new Error(
    '[encryption.utils] ENCRYPTION_KEY environment variable must be set to exactly 32 characters (256 bits). ' +
    `Current length: ${ENCRYPTION_KEY ? Buffer.byteLength(ENCRYPTION_KEY, 'utf8') : 0}. ` +
    'Set a valid key in your .env file and restart the server.'
  );
}

// ── Optional legacy key for migrating old records ────────────────────────────
// If a LEGACY_ENCRYPTION_KEY is provided and is exactly 32 bytes, it will be
// tried as a fallback when the primary key fails to decrypt a value.
// Add LEGACY_ENCRYPTION_KEY=<old 32-char key> to .env to enable migration.
const LEGACY_KEY_RAW = process.env.LEGACY_ENCRYPTION_KEY;
const LEGACY_ENCRYPTION_KEY =
  LEGACY_KEY_RAW && Buffer.byteLength(LEGACY_KEY_RAW, 'utf8') === 32
    ? LEGACY_KEY_RAW
    : null;

if (LEGACY_KEY_RAW && !LEGACY_ENCRYPTION_KEY) {
  console.warn(
    '[encryption.utils] LEGACY_ENCRYPTION_KEY is set but is not exactly 32 bytes — it will be ignored.',
    `Current length: ${Buffer.byteLength(LEGACY_KEY_RAW, 'utf8')}`
  );
}

// Tracks ciphertext prefixes already warned about so logs don't flood on repeat fetches
const _warnedPrefixes = new Set();

/**
 * Attempt to decrypt text with a given key. Returns null on any failure.
 * @param {string} text Format iv:hexEncrypted
 * @param {string} key  32-byte key string
 * @returns {string|null}
 */
function tryDecrypt(text, key) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return null;
  }
}

/**
 * Encrypt sensitive data with the current primary key.
 * @param {string} text
 * @returns {string} Encrypted text in format iv:encrypted
 */
export function encrypt(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('[encryption.utils] Encryption failed:', error);
    return text;
  }
}

/**
 * Decrypt data — tries primary key first, then legacy key if available.
 * Never throws: returns the raw value as-is if decryption is impossible.
 * @param {string} text Format iv:encrypted
 * @returns {string} Decrypted text, or original value on failure
 */
export function decrypt(text) {
  if (!text || !text.includes(':')) return text;

  // 1. Try current primary key
  const primary = tryDecrypt(text, ENCRYPTION_KEY);
  if (primary !== null) return primary;

  // 2. Try legacy key (if configured)
  if (LEGACY_ENCRYPTION_KEY) {
    const legacy = tryDecrypt(text, LEGACY_ENCRYPTION_KEY);
    if (legacy !== null) {
      console.warn('[encryption.utils] Decrypted with LEGACY_ENCRYPTION_KEY — consider re-encrypting this record.');
      return legacy;
    }
  }

  // 3. Cannot decrypt — return raw value. Warn once per unique ciphertext prefix
  // to avoid flooding logs when the same record is fetched repeatedly.
  const warnKey = text.slice(0, 32);
  if (!_warnedPrefixes.has(warnKey)) {
    _warnedPrefixes.add(warnKey);
    console.warn('[encryption.utils] Key mismatch on legacy record — returning raw value (add LEGACY_ENCRYPTION_KEY to .env to fix)');
  }
  return text;
}
