/**
 * Registration phone helpers — parity with frontend/src/lib/phone.ts (subset used at signup).
 */

export function iso2ToFlagEmoji(iso2: string): string {
  const u = iso2.toUpperCase();
  if (u.length !== 2) return '🏳️';
  return [...u].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
}

/** National digits only (no country code). dialDigits is numeric string e.g. "63". */
export function validateRegisterNationalDigits(
  dialDigits: string,
  nationalRaw: string
): { ok: boolean; message?: string } {
  let digits = nationalRaw.replace(/\D/g, '');
  if (dialDigits === '63') {
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^9\d{9}$/.test(digits)) {
      return { ok: false, message: 'Philippine mobile must be 10 digits starting with 9.' };
    }
    return { ok: true };
  }
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, message: 'Enter a valid phone number (7–15 digits).' };
  }
  return { ok: true };
}

export function buildRegisterE164(dialDigits: string, nationalRaw: string): string {
  let digits = nationalRaw.replace(/\D/g, '');
  if (dialDigits === '63' && digits.startsWith('0')) digits = digits.slice(1);
  return `+${dialDigits}${digits}`;
}
