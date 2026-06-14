const PROFILE_IMAGE_FIELDS = [
    'avatar',
    'photoURL',
    'profileImage',
    'profilePhoto',
    'image',
    'photo',
] as const;

export function resolveProfileImage(...sources: Array<Record<string, unknown> | null | undefined>): string {
    for (const field of PROFILE_IMAGE_FIELDS) {
        for (const source of sources) {
            const value = source?.[field];
            if (typeof value !== 'string') continue;
            const normalized = value.trim();
            if (normalized && !normalized.startsWith('blob:')) return normalized;
        }
    }
    return '';
}
