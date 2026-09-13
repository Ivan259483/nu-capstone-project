/**
 * Fetchable URLs for tracker evidence that is still stored inline (`data:` URI) on the order.
 *
 * Tracker media responses never carry base64. When a row has no public https URL yet, the
 * customer receives a signed API path instead and loads the image bytes in a separate request.
 * `<img>` and React Native `Image` cannot attach the Authorization header, so the path carries
 * an HMAC bound to the order, the media row, and its upload time — replacing the photo changes
 * `uploadedAt`, which invalidates the old URL.
 */
import crypto from 'node:crypto';

const INLINE_IMAGE_DATA_URL = /^data:(image\/(?:jpeg|jpg|png|webp));base64,/i;

function signingSecret() {
  const secret = process.env.TRACKER_MEDIA_URL_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required to sign tracker media photo URLs');
  return secret;
}

/** Version component of the signature: the row's upload time in epoch milliseconds. */
export function trackerMediaPhotoVersion(uploadedAt) {
  const ms = new Date(uploadedAt || 0).getTime();
  return Number.isFinite(ms) ? String(ms) : '0';
}

export function signTrackerMediaPhoto({ orderId, mediaId, version }) {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`tracker-media-photo:${orderId}:${mediaId}:${version}`)
    .digest('base64url');
}

export function verifyTrackerMediaPhotoSignature({ orderId, mediaId, version, signature }) {
  const expected = Buffer.from(signTrackerMediaPhoto({ orderId, mediaId, version }));
  const received = Buffer.from(String(signature || ''));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Root-relative API path; clients resolve it against their configured backend origin. */
export function buildTrackerMediaPhotoPath({ orderId, mediaId, uploadedAt }) {
  const version = trackerMediaPhotoVersion(uploadedAt);
  const sig = signTrackerMediaPhoto({ orderId, mediaId, version });
  return `/api/orders/${encodeURIComponent(orderId)}/tracker-media/${encodeURIComponent(mediaId)}/photo?v=${version}&sig=${sig}`;
}

/**
 * Gives every inline-only media row (`photoPending` with no public URL) a signed photo URL.
 * Rows that already carry an https URL, and rows without a stored photo, are returned as-is.
 */
export function withFetchableTrackerPhotoUrls(orderId, media) {
  const id = String(orderId || '');
  return (Array.isArray(media) ? media : []).map((entry) => {
    if (!entry || !entry.photoPending || entry.photoUrl || !entry.id || !id) return entry;
    return {
      ...entry,
      photoUrl: buildTrackerMediaPhotoPath({ orderId: id, mediaId: entry.id, uploadedAt: entry.uploadedAt }),
    };
  });
}

/** Decodes a stored `data:image/...;base64,` value, or returns null for anything else. */
export function parseInlineImageDataUrl(value) {
  const raw = typeof value === 'string' ? value : '';
  const match = raw.match(INLINE_IMAGE_DATA_URL);
  if (!match) return null;
  const buffer = Buffer.from(raw.slice(match[0].length), 'base64');
  if (!buffer.length) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { mimeType, buffer };
}
