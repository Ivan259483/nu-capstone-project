export const USER_PROFILE_IMAGE_FIELDS = [
  'avatar',
  'photoURL',
  'profileImage',
  'profilePhoto',
  'image',
  'photo',
];

const PROFILE_PHOTO_PATH = /^\/api\/users\/profile\/photo\/[a-f0-9]{24}\/?$/i;

export function normalizeProfilePhotoReference(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return '';

  try {
    const parsed = new URL(value, 'https://relative.invalid');
    if (PROFILE_PHOTO_PATH.test(parsed.pathname)) return parsed.pathname;
  } catch {
    // Preserve non-URL legacy provider values for the existing resolver.
  }

  return value;
}

const readField = (source, field) => {
  if (!source) return undefined;
  if (typeof source.get === 'function') return source.get(field);
  return source[field];
};

export function resolveProfileImageForClient(...sources) {
  for (const field of USER_PROFILE_IMAGE_FIELDS) {
    for (const source of sources) {
      const value = readField(source, field);
      if (typeof value !== 'string') continue;
      const normalized = value.trim();
      if (normalized && !normalized.startsWith('blob:')) return normalized;
    }
  }
  return '';
}

export function attachProfileImageForClient(userDoc, userPayload) {
  if (!userDoc || !userPayload) return;

  const profileImage = normalizeProfilePhotoReference(
    resolveProfileImageForClient(userDoc, userPayload)
  );
  for (const field of USER_PROFILE_IMAGE_FIELDS) {
    if (field !== 'avatar') delete userPayload[field];
  }

  if (profileImage) {
    userPayload.avatar = profileImage;
    userPayload.photoURL = profileImage;
  } else {
    delete userPayload.avatar;
    delete userPayload.photoURL;
  }
}
