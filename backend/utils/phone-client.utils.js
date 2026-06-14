import { decrypt } from './encryption.utils.js';
import { parseOptionalProfilePhone } from './phone.utils.js';
import { attachProfileImageForClient } from './profile-image.utils.js';

export const USER_PHONE_FIELDS = ['phone', 'phoneNumber', 'contactNumber', 'mobileNumber', 'contactNo'];
export const USER_PHONE_SELECT_FIELDS = USER_PHONE_FIELDS.join(' ');

const RECEIPT_PHONE_CONTAINERS = ['customer', 'user', 'booking', 'payment', 'receipt'];

const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

const readField = (source, field) => {
  if (!source) return undefined;
  if (typeof source.get === 'function') return source.get(field);
  return source[field];
};

const normalizeClientPhoneValue = (raw) => {
  if (raw == null) return '';
  const value = String(raw).trim();
  if (!value) return '';

  const decrypted = decrypt(value);
  const candidate = String(decrypted || '').trim();
  if (!candidate || ENCRYPTED_VALUE_PATTERN.test(candidate)) return '';

  const parsed = parseOptionalProfilePhone(candidate);
  return parsed.ok && parsed.phone ? parsed.phone : '';
};

export function resolvePhoneForClient(...sources) {
  for (const field of USER_PHONE_FIELDS) {
    for (const source of sources) {
      const normalized = normalizeClientPhoneValue(readField(source, field));
      if (normalized) return normalized;
    }
  }
  return '';
}

export function resolveReceiptPhoneForClient(...sources) {
  const seen = new Set();

  const visit = (source) => {
    if (!source || typeof source !== 'object' || seen.has(source)) return '';
    seen.add(source);

    const direct = resolvePhoneForClient(
      { phone: readField(source, 'customerPhone') },
      source
    );
    if (direct) return direct;

    for (const field of RECEIPT_PHONE_CONTAINERS) {
      const nested = visit(readField(source, field));
      if (nested) return nested;
    }

    return '';
  };

  for (const source of sources) {
    const phone = visit(source);
    if (phone) return phone;
  }

  return '';
}

export function stripLegacyPhoneFields(userPayload) {
  if (!userPayload) return;
  for (const field of USER_PHONE_FIELDS) {
    if (field !== 'phone') delete userPayload[field];
  }
}

/**
 * Attach decrypted, client-safe phone to API user payloads.
 * Resolves canonical and legacy fields, then exposes one canonical `phone`.
 */
export function attachPhoneForClient(userDoc, userPayload) {
  if (!userDoc || !userPayload) return;
  const phone = resolvePhoneForClient(userDoc, userPayload);
  stripLegacyPhoneFields(userPayload);
  if (phone) userPayload.phone = phone;
  else delete userPayload.phone;
}

/** Plain object for JSON responses after profile/user updates. */
export function serializeUserForClient(userDoc) {
  if (!userDoc) return null;
  const userObject = typeof userDoc.toObject === 'function'
    ? userDoc.toObject({ virtuals: true })
    : { ...userDoc };
  delete userObject.password;
  attachPhoneForClient(userDoc, userObject);
  attachProfileImageForClient(userDoc, userObject);
  return userObject;
}
