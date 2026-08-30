const PROFILE_PHOTO_PATH = /^\/api\/users\/profile\/photo\/[a-f0-9]{24}\/?$/i;

/**
 * Resolve backend-hosted media without trusting an environment-specific host
 * that may have been persisted by an older API response.
 */
export function resolveMediaUrl(rawValue: string, backendApiUrl: string): string {
    const value = rawValue.trim();
    if (!value || value.startsWith('blob:')) return value;

    let mediaUrl: URL;
    try {
        mediaUrl = new URL(value, 'https://relative.invalid');
    } catch {
        return value;
    }

    if (!PROFILE_PHOTO_PATH.test(mediaUrl.pathname)) return value;

    try {
        const backendOrigin = new URL(backendApiUrl).origin;
        return `${backendOrigin}${mediaUrl.pathname}`;
    } catch {
        return value;
    }
}
