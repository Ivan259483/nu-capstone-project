export const USER_PROFILE_IMAGE_FIELDS = [
  'avatar',
  'photoURL',
  'profileImage',
  'profilePhoto',
  'image',
  'photo',
];

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

  const profileImage = resolveProfileImageForClient(userDoc, userPayload);
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
