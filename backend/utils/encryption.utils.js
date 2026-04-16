import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ── Fail-fast: validate key at module load time ─────────────────────────────
// aes-256-cbc requires exactly 32 bytes (256 bits). A missing or wrong-length
// key would otherwise silently produce a cryptic `Buffer.from(undefined)` crash
// deep inside a request handler, which is very hard to trace.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || Buffer.byteLength(ENCRYPTION_KEY, 'utf8') !== 32) {
  throw new Error(
    '[encryption.utils] ENCRYPTION_KEY environment variable must be set to exactly 32 characters (256 bits). ' +
    `Current length: ${ENCRYPTION_KEY ? Buffer.byteLength(ENCRYPTION_KEY, 'utf8') : 0}. ` +
    'Set a valid key in your .env file and restart the server.'
  );
}



/**
 * Encrypt sensitive data
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
    console.error('Encryption failed:', error);
    return text;
  }
}

/**
 * Decrypt data
 * @param {string} text Format iv:encrypted
 * @returns {string} Decrypted text
 */
export function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    // Expected for legacy records encrypted with a different key — handled gracefully by safeDecrypt callers
    if (process.env.NODE_ENV === 'development') {
      console.debug('[decrypt] Key mismatch on legacy record — returning raw value:', error.message);
    }
    return text; // Return as-is if decryption fails
  }
}
