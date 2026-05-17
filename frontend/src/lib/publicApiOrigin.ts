/**
 * Public Express API origin for browser fetches and WebAR iframe (`apiOrigin`).
 * Prefer NEXT_PUBLIC_API_URL (Next). Vite exposes the same name when `envPrefix` includes NEXT_PUBLIC_.
 */

function stripQuotes(s: string) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** If user pasted a full "KEY=value" line into the value field, keep only the value part. */
function stripKeyValueNoise(s: string): string {
  const t = s.trim();
  if (/^NEXT_PUBLIC_API_URL\s*=/i.test(t)) return t.replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '').trim();
  if (/^VITE_PUBLIC_API_URL\s*=/i.test(t)) return t.replace(/^VITE_PUBLIC_API_URL\s*=\s*/i, '').trim();
  if (/^env/i.test(t) && t.includes('=')) return t.split('=').slice(1).join('=').trim();
  return t;
}

export function normalizeApiOrigin(raw: string | undefined): string {
  let s = stripKeyValueNoise(stripQuotes(String(raw || '')));
  if (/^envnext_public_api_url=/i.test(s)) s = s.split('=').slice(1).join('=').trim();

  return s
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

function readVitePublicApiUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_PUBLIC_API_URL || env?.NEXT_PUBLIC_API_URL;
}

/** Fixed per dev server / build — restart dev after changing .env.local */
export function getPublicApiOrigin(): string {
  const fromNext = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
  if (fromNext) return fromNext;
  return normalizeApiOrigin(readVitePublicApiUrl());
}
