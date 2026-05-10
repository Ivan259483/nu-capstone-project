/**
 * User phone/address may be stored as AES iv:ciphertext hex (see backend encrypt()).
 * When the client still receives ciphertext (e.g. decrypt skipped / key mismatch), avoid
 * showing it as a "phone number" in POS/admin UIs — prefer email or a neutral placeholder.
 */

/** Matches backend `encrypt()` output: `ivHex + ':' + ciphertextHex` (single colon). */
export function isLikelyEncryptedCipherText(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  const [iv, cipherHex] = parts;
  return (
    iv.length === 32 &&
    /^[a-f0-9]+$/i.test(iv) &&
    cipherHex.length >= 32 &&
    /^[a-f0-9]+$/i.test(cipherHex)
  );
}

/** Empty string if value looks like ciphertext; otherwise trimmed plain value. */
export function sanitizePhoneForDisplay(phone: string | undefined | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const t = phone.trim();
  if (isLikelyEncryptedCipherText(t)) return '';
  return t;
}

/** One line for directory/search rows: readable mobile, else email, else em dash. */
export function contactDirectorySubtitle(phone: string, email: string): string {
  const p = sanitizePhoneForDisplay(phone);
  if (p) return p;
  const e = (email || '').trim();
  if (e) return e;
  return '—';
}
