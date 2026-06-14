/**
 * Philippine mobile normalization & validation.
 * Accepts: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX / 639XXXXXXXXX
 * Stored form: 09XXXXXXXXX
 */
const compactPhoneInput = (input) => String(input).trim().replace(/[\s().-]/g, '');

export function normalizePhilippineMobile(input) {
  if (input == null || typeof input !== 'string') {
    return { ok: false, phone: '', message: 'Invalid phone number.' };
  }
  const compact = compactPhoneInput(input);
  if (!compact) {
    return { ok: false, phone: '', message: 'Phone number is required.' };
  }
  if (/^09\d{9}$/.test(compact)) {
    return { ok: true, phone: compact };
  }
  if (/^\+639\d{9}$/.test(compact)) {
    return { ok: true, phone: `0${compact.slice(3)}` };
  }
  if (/^639\d{9}$/.test(compact)) {
    return { ok: true, phone: `0${compact.slice(2)}` };
  }
  return {
    ok: false,
    phone: compact,
    message: 'Invalid phone. Use 09XXXXXXXXX or +639XXXXXXXXX.',
  };
}

/** Empty / omitted → ok with undefined phone (e.g. legacy mobile register). */
export function parseOptionalPhilippineMobile(input) {
  if (input == null || String(input).trim() === '') {
    return { ok: true, phone: undefined };
  }
  return normalizePhilippineMobile(String(input));
}

/**
 * Customer self-registration — Philippine mobile (strict) or general E.164.
 * Stored form: +639XXXXXXXXX (PH) or +[country][subscriber] (others, ITU max 15 digits).
 */
export function parseRegisterPhone(input) {
  if (input == null || String(input).trim() === '') {
    return { ok: false, phone: '', message: 'Phone number is required.' };
  }
  const compact = compactPhoneInput(input);

  if (/^\+639\d{9}$/.test(compact)) {
    return { ok: true, phone: compact };
  }
  if (/^09\d{9}$/.test(compact)) {
    return { ok: true, phone: `+639${compact.slice(2)}` };
  }
  if (/^639\d{9}$/.test(compact)) {
    return { ok: true, phone: `+639${compact.slice(3)}` };
  }

  if (compact.startsWith('+63')) {
    return {
      ok: false,
      phone: compact,
      message: 'Philippine mobile must be 10 digits starting with 9 (9XXXXXXXXX).',
    };
  }

  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    return { ok: true, phone: compact };
  }

  return {
    ok: false,
    phone: compact,
    message: 'Invalid phone number format.',
  };
}

/** Optional profile/admin updates — blank means "leave the existing phone unchanged". */
export function parseOptionalProfilePhone(input) {
  if (input == null || String(input).trim() === '') {
    return { ok: true, phone: undefined };
  }
  return parseRegisterPhone(input);
}
