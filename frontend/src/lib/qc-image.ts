const thumbnailUrlCache = new Map<string, string>();

const CLOUDINARY_IMAGE_UPLOAD_MARKER = '/image/upload/';
const QC_THUMBNAIL_TRANSFORM = 'c_fill,w_640,h_480,f_auto,q_auto:eco';

/**
 * Cloudinary generates this derivative on first request and serves subsequent
 * requests from its CDN/browser cache. Non-Cloudinary and local preview URLs are
 * returned unchanged because rewriting an unknown media host is unsafe.
 */
export function getQCThumbnailUrl(source: string): string {
  const original = String(source || '').trim();
  if (!original || original.startsWith('blob:') || original.startsWith('data:')) return original;

  const cached = thumbnailUrlCache.get(original);
  if (cached) return cached;

  let thumbnail = original;
  try {
    const url = new URL(original);
    const markerIndex = url.pathname.indexOf(CLOUDINARY_IMAGE_UPLOAD_MARKER);
    if (url.hostname.endsWith('res.cloudinary.com') && markerIndex >= 0) {
      const insertAt = markerIndex + CLOUDINARY_IMAGE_UPLOAD_MARKER.length;
      url.pathname = `${url.pathname.slice(0, insertAt)}${QC_THUMBNAIL_TRANSFORM}/${url.pathname.slice(insertAt)}`;
      thumbnail = url.toString();
    }
  } catch {
    // Relative URLs rely on the backend/browser cache and remain unchanged.
  }

  thumbnailUrlCache.set(original, thumbnail);
  return thumbnail;
}

