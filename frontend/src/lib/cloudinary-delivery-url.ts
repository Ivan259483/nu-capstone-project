/**
 * Adjust Cloudinary **image** delivery URLs for sharper fullscreen viewing.
 * Upload presets or older stored URLs may omit quality / max dimension; the lightbox
 * upscales small assets and looks soft — request a high-quality, capped-width variant.
 *
 * Skips non-Cloudinary URLs, data/blob, raw upload, and signed paths (`/s--…--/`) where
 * changing the path would invalidate the signature.
 */
const IMAGE_UPLOAD = '/image/upload/';

function buildHiResTransform(devicePixelRatio: number): string {
  const dpr = devicePixelRatio >= 2 ? ',dpr_2' : '';
  return `q_auto:best,f_auto,c_limit,w_2560${dpr}`;
}

/** Crisper grid thumbnails without pulling full 2.5k assets. */
function buildEvidenceThumbTransform(devicePixelRatio: number): string {
  const dpr = devicePixelRatio >= 2 ? ',dpr_2' : '';
  return `c_limit,w_900,h_900,q_auto:good,f_auto${dpr}`;
}

function insertImageUploadTransform(url: string, transform: string): string {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u || u.startsWith('data:') || u.startsWith('blob:')) return u;
  if (!/res\.cloudinary\.com/i.test(u) && !/cloudinary\.com/i.test(u)) return u;
  const lower = u.toLowerCase();
  if (!lower.includes(IMAGE_UPLOAD) || lower.includes('/raw/upload/')) return u;
  if (u.includes('/s--')) return u;

  const idx = u.indexOf(IMAGE_UPLOAD);
  const rest = u.slice(idx + IMAGE_UPLOAD.length);
  const segments = rest.split('/');
  if (!segments[0]) return u;

  const first = segments[0];
  const isVersion = /^v\d+/i.test(first);

  if (isVersion) {
    return `${u.slice(0, idx + IMAGE_UPLOAD.length)}${transform}/${rest}`;
  }

  segments[0] = transform;
  return `${u.slice(0, idx + IMAGE_UPLOAD.length)}${segments.join('/')}`;
}

export function toCloudinaryHighResDeliveryUrl(url: string, devicePixelRatio = 1): string {
  return insertImageUploadTransform(url, buildHiResTransform(devicePixelRatio));
}

export function toCloudinaryEvidenceThumbUrl(url: string, devicePixelRatio = 1): string {
  return insertImageUploadTransform(url, buildEvidenceThumbTransform(devicePixelRatio));
}
