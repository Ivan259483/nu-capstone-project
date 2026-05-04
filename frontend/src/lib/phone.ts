/** Philippine mobile — accept 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX */
export function isValidPhilippineMobileInput(raw: string): boolean {
  const s = raw.trim().replace(/\s/g, '');
  return /^09\d{9}$/.test(s) || /^\+639\d{9}$/.test(s) || /^639\d{9}$/.test(s);
}

export function normalizePhilippineMobileInput(raw: string): string {
  const s = raw.trim().replace(/\s/g, '');
  if (/^09\d{9}$/.test(s)) return s;
  if (/^\+639\d{9}$/.test(s)) return `0${s.slice(3)}`;
  if (/^639\d{9}$/.test(s)) return `0${s.slice(2)}`;
  return s;
}

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

/** Booking Step 2 — PH mobiles accepted in 09 / +63 / 639 forms (spacing ignored). */
export function isValidPhilippineBookingContact(raw: string): boolean {
  return isValidPhilippineMobileInput(raw);
}

/** Prefer 09XXXXXXXXX in UI when the value is a Philippine mobile. */
export const normalizePhilippineMobileForBooking = normalizePhilippineMobileInput;

/**
 * Default Contact No. from profile/auth — PH numbers shown as 09… for placeholder parity.
 */
export function formatContactNoInputFromProfile(phone?: string): string {
  if (!phone?.trim()) return '';
  const compact = phone.replace(/\s/g, '');
  if (isValidPhilippineMobileInput(compact)) return normalizePhilippineMobileInput(compact);
  return phone.trim();
}
