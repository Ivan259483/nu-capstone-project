import { decrypt, looksLikeEncryptedValue } from './encryption.utils.js';

/**
 * Decrypt order PII fields when Mongoose post-init hooks did not run (for
 * example, a `.lean()` query). Unreadable ciphertext is never returned to a
 * client as if it were valid plaintext.
 */
export function safeDecryptOrderField(value, _fieldName = 'orderField') {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value).trim();

  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!looksLikeEncryptedValue(trimmed)) return trimmed;

  return String(decrypt(trimmed) || '').trim();
}
