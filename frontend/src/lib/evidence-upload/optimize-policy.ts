/**
 * Gate evidence image policy — shared by the Web Worker encoder and the main-thread fallback
 * (`encodeEvidenceImageOnMainThread`) so both produce the same output.
 *
 * 1600px on the longest edge keeps scratch / swirl / film-edge detail legible when the QC or the
 * customer zooms in, while WebP at ~0.8 lands typical 12MP phone photos in the 200–500 KB range.
 */

export const EVIDENCE_MAX_EDGE_PX = 1600;
export const EVIDENCE_TARGET_MAX_BYTES = 500 * 1024;
/** Already-small JPEG/PNG/WebP files are uploaded as-is; re-encoding would only lose quality. */
export const EVIDENCE_SKIP_BELOW_BYTES = 300 * 1024;
export const EVIDENCE_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type EvidenceEncodeStep = { maxEdge: number; quality: number };

/** Tried in order until the encoded image fits `EVIDENCE_TARGET_MAX_BYTES`; the last result wins otherwise. */
export const EVIDENCE_ENCODE_STEPS: readonly EvidenceEncodeStep[] = Object.freeze([
  { maxEdge: EVIDENCE_MAX_EDGE_PX, quality: 0.82 },
  { maxEdge: EVIDENCE_MAX_EDGE_PX, quality: 0.76 },
  { maxEdge: EVIDENCE_MAX_EDGE_PX, quality: 0.7 },
  { maxEdge: EVIDENCE_MAX_EDGE_PX, quality: 0.64 },
  { maxEdge: 1400, quality: 0.7 },
]);

export function fitWithinEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when the file should be decoded and re-encoded before upload. */
export function shouldOptimizeEvidence(file: { size: number; type: string }): boolean {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return false;
  if (EVIDENCE_UPLOAD_MIME_TYPES.has(file.type) && file.size < EVIDENCE_SKIP_BELOW_BYTES) return false;
  return true;
}
