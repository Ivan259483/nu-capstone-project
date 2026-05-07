/**
 * Resize + JPEG-encode tracker photos in the browser so uploads finish faster
 * and customers see updates sooner (smaller payload to API → Cloudinary).
 */
const MAX_EDGE_PX = 1600;
const TARGET_MAX_BYTES = 900 * 1024;
const INITIAL_JPEG_QUALITY = 0.86;
const MIN_JPEG_QUALITY = 0.52;

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-decode-failed'));
    };
    img.src = url;
  });
}

/**
 * Returns a JPEG File (usually much smaller than phone screenshots / PNGs).
 * On failure or if output would be larger than input, returns the original file.
 */
export async function compressImageForTrackerUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (file.size < 200 * 1024) return file;

  let bitmap: ImageBitmap | null = null;
  let htmlImg: HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      htmlImg = await loadHtmlImage(file);
    }
  } catch {
    try {
      htmlImg = await loadHtmlImage(file);
    } catch {
      return file;
    }
  }

  const srcW = bitmap?.width ?? htmlImg!.naturalWidth;
  const srcH = bitmap?.height ?? htmlImg!.naturalHeight;
  if (!srcW || !srcH) {
    bitmap?.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap?.close();
    return file;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
  } else {
    ctx.drawImage(htmlImg!, 0, 0, w, h);
  }

  const toBlob = (q: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', q);
    });

  let quality = INITIAL_JPEG_QUALITY;
  let blob = await toBlob(quality);
  while (blob && blob.size > TARGET_MAX_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= 0.07;
    blob = await toBlob(quality);
  }

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'tracker-photo';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
