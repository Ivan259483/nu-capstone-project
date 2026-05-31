/** Keys and helpers for auth/session persistence — avoids localStorage quota blowups. */

export const AVATAR_STORAGE_PREFIX = 'autospf_avatar_';
export const BACKEND_USER_KEY = 'autospf_backend_user';
export const TOKEN_KEY = 'autospf_token';

export function isDataImage(value: unknown): value is string {
    if (typeof value !== 'string' || !value) return false;
    return value.startsWith('data:image/') || (value.length > 200 && !value.startsWith('http'));
}

/** Drop inline/base64 avatars before writing to localStorage; keep http(s) URLs only. */
export function stripAvatarForStorage<T extends Record<string, unknown>>(record: T): T {
    if (!isDataImage(record.avatar)) return record;
    const { avatar: _removed, ...rest } = record;
    return rest as T;
}

/** Legacy avatar blobs can fill the entire ~5MB quota — remove them on startup and on quota errors. */
export function purgeAvatarLocalStorage(): number {
    const keysToRemove: string[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(AVATAR_STORAGE_PREFIX)) keysToRemove.push(key);
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
        /* ignore */
    }
    return keysToRemove.length;
}

export function safeLocalStorageSet(key: string, value: string): boolean {
    const trySet = () => {
        localStorage.setItem(key, value);
        return true;
    };

    try {
        trySet();
        return true;
    } catch (error) {
        const isQuota =
            error instanceof DOMException &&
            (error.name === 'QuotaExceededError' || error.code === 22);
        if (!isQuota) return false;

        purgeAvatarLocalStorage();

        try {
            trySet();
            return true;
        } catch {
            return false;
        }
    }
}

export function persistBackendUser(me: Record<string, unknown>, role?: string): boolean {
    const payload = stripAvatarForStorage({
        ...me,
        ...(role !== undefined ? { role } : {}),
    });
    return safeLocalStorageSet(BACKEND_USER_KEY, JSON.stringify(payload));
}

export function readBackendUserRaw(): Record<string, unknown> | null {
    try {
        const raw = localStorage.getItem(BACKEND_USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export function patchBackendUser(patch: Record<string, unknown>): void {
    const current = readBackendUserRaw();
    if (!current) return;
    persistBackendUser({ ...current, ...patch });
}

/** One-time cleanup when auth provider mounts — frees quota from old avatar caches. */
export function repairAuthLocalStorage(): void {
    purgeAvatarLocalStorage();
    const raw = localStorage.getItem(BACKEND_USER_KEY);
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (isDataImage(parsed.avatar)) {
            persistBackendUser(parsed);
        }
    } catch {
        localStorage.removeItem(BACKEND_USER_KEY);
    }
}
