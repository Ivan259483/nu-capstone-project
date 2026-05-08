/**
 * Image URLs that work in <img src> but browsers often refuse as link targets
 * (Chrome may open an empty tab for long data: URLs with target=_blank).
 */
export function isNonNavigableImageSrc(url: string): boolean {
  const u = typeof url === 'string' ? url.trim() : '';
  return u.startsWith('data:image/') || u.startsWith('blob:');
}
