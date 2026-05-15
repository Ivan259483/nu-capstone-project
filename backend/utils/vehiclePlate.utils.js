import { decrypt } from './encryption.utils.js';

/**
 * Plain plate for PDFs / invoices / staff UIs.
 * Handles Mongoose-encrypted `vehiclePlate`, undecryptable blobs, and mistaken ObjectId / hash values.
 */
export function resolvePlainVehiclePlate(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const safeDecrypt = (val) => {
    if (!val || typeof val !== 'string') return val;
    if (/^[0-9a-f]{32}:[0-9a-f]+$/i.test(val)) {
      try {
        return decrypt(val);
      } catch {
        return val;
      }
    }
    return val;
  };
  const decrypted = safeDecrypt(raw);
  const encBlobPattern = /^[0-9a-f]{32}:[0-9a-f]+$/i;
  const couldNotDecrypt = encBlobPattern.test(String(decrypted || ''));
  const plain = couldNotDecrypt ? '' : String(decrypted || '').trim();
  // ObjectId, MD5, or other hex-only internal ids (31-char hashes were slipping past a 32-char-only check)
  if (plain.length >= 24 && /^[a-f0-9]+$/i.test(plain)) return '';
  return plain;
}
