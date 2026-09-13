const PROFILE_PHOTO_PATH = /^\/api\/users\/profile\/photo\/[a-f0-9]{24}\/?$/i;
/** Signed tracker evidence photo; its `v`/`sig` query is the credential and must be kept. */
const TRACKER_MEDIA_PHOTO_PATH = /^\/api\/orders\/[a-f0-9]{24}\/tracker-media\/[a-f0-9]{24}\/photo\/?$/i;

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

    const isTrackerPhoto = TRACKER_MEDIA_PHOTO_PATH.test(mediaUrl.pathname);
    if (!isTrackerPhoto && !PROFILE_PHOTO_PATH.test(mediaUrl.pathname)) return value;

    try {
        const pageOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
        const backendOrigin = new URL(backendApiUrl, pageOrigin).origin;
        return `${backendOrigin}${mediaUrl.pathname}${isTrackerPhoto ? mediaUrl.search : ''}`;
    } catch {
        return value;
    }
}
