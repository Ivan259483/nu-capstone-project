import { decrypt } from './encryption.utils.js';

/**
 * Attach decrypted, client-safe phone to API user payloads.
 * Clears phone when ciphertext cannot be decrypted to a valid number.
 */
export function attachPhoneForClient(userDoc, userPayload) {
  if (!userDoc || !userPayload) return;
  const raw = userDoc.phone;
  if (raw == null || raw === '') return;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!s) return;
  try {
    const decrypted = decrypt(s);
    const compact = decrypted.replace(/[\s.-]/g, '');
    if (decrypted && /^\+?\d{7,15}$/.test(compact)) {
      userPayload.phone = decrypted;
    } else {
      console.error(
        '[Phone] Decryption returned invalid value (len=%s, hasColon=%s)',
        decrypted?.length,
        decrypted?.includes?.(':'),
      );
      userPayload.phone = '';
    }
  } catch (err) {
    console.error('[Phone] Decrypt error:', err);
    userPayload.phone = '';
  }
}

/** Plain object for JSON responses after profile/user updates. */
export function serializeUserForClient(userDoc) {
  if (!userDoc) return null;
  const userObject = typeof userDoc.toObject === 'function'
    ? userDoc.toObject({ virtuals: true })
    : { ...userDoc };
  delete userObject.password;
  attachPhoneForClient(userDoc, userObject);
  return userObject;
}
