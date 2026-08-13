import { decrypt, looksLikeEncryptedValue } from './encryption.utils.js';

/**
 * Plain plate for PDFs / invoices / staff UIs.
 * Handles Mongoose-encrypted `vehiclePlate`, undecryptable blobs, and mistaken ObjectId / hash values.
 */
export function resolvePlainVehiclePlate(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const safeDecrypt = (val) => {
    if (!val || typeof val !== 'string') return val;
    if (looksLikeEncryptedValue(val)) {
      try {
        return decrypt(val);
      } catch {
        return null;
      }
    }
    return val;
  };
  const decrypted = safeDecrypt(raw);
  const plain = String(decrypted || '').trim();
  // ObjectId, MD5, or other hex-only internal ids (31-char hashes were slipping past a 32-char-only check)
  if (plain.length >= 24 && /^[a-f0-9]+$/i.test(plain)) return '';
  return plain;
}
