'use client';

/**
 * MindAR WebAR viewer (iframe to Express static `/webar/index.html`).
 *
 * Next.js App Router — always load client-only (MindAR + three@0.151 live inside the iframe, not in Next):
 *
 *   import dynamic from 'next/dynamic';
 *   const ARViewer = dynamic(
 *     () => import('@/components/webar/ARViewer').then((m) => m.ARViewer),
 *     { ssr: false, loading: () => <p>Loading AR…</p> }
 *   );
 *
 * Main app may use React Three Fiber + three@0.168 — do not import MindAR or three@0.151 in the same bundle.
 *
 * Iframe `postMessage` protocol (parent → child):
 *   WEBAR_INIT | SET_STATE | START_AR | STOP_AR
 *
 * Child → parent (see `post()` in `backend/public/webar/index.html`):
 *   WEBAR_READY | WEBAR_INIT_APPLIED | MODEL_LOADED | AR_STARTED | AR_STOPPED | WEBAR_ERROR | …
 *
 * `next.config.js`: for iframe embed you do **not** need `transpilePackages: ['mind-ar']`.
 * Add it only if you bundle `mind-ar` directly in Next (not recommended alongside R3F r168).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ARViewerMode = 'before' | 'after';

export type ARViewerProps = {
  /** e.g. `https://api.yourdomain.com` — must serve `/webar/index.html` */
  apiOrigin: string;
  /** Optional — loads `/api/ai/webar-session/:scanId` inside the iframe when set */
  scanId?: string | null;
  /**
   * Optional absolute GLB URLs (e.g. Meshy or `/api/ai/proxy-glb?url=…` on the same host as the iframe).
   * Sent as WEBAR_INIT after the iframe posts WEBAR_READY.
   */
  modelUrl?: string | null;
  repairedModelUrl?: string | null;
  targetUrl?: string | null;
  targetImageUrl?: string | null;
  title?: string | null;
  embed?: boolean;
  className?: string;
  onBridgeMessage?: (msg: Record<string, unknown>) => void;
};

function trimApiOrigin(apiOrigin: string) {
  return String(apiOrigin || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

function buildWebarUrl(apiOrigin: string, scanId?: string | null, embed = true) {
  const origin = trimApiOrigin(apiOrigin);
  if (!origin) return '';
  const base = `${origin}/webar/index.html`;
  const q = new URLSearchParams();
  if (scanId) q.set('scanId', scanId);
  if (embed) q.set('embed', '1');
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

function isInsecureHttp(origin: string) {
  if (!String(origin || '').trim()) return false;
  try {
    const u = new URL(trimApiOrigin(origin));
    return u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

export function ARViewer({
  apiOrigin,
  scanId,
  modelUrl,
  repairedModelUrl,
  targetUrl,
  targetImageUrl,
  title,
  embed = true,
  className,
  onBridgeMessage,
}: ARViewerProps) {
  const resolvedOrigin = useMemo(() => trimApiOrigin(apiOrigin), [apiOrigin]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  /** Child boot finished (MindAR page ran initial session load). */
  const [childReady, setChildReady] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const src = useMemo(() => buildWebarUrl(resolvedOrigin, scanId, embed), [resolvedOrigin, scanId, embed]);
  const showHttpWarning = isInsecureHttp(resolvedOrigin);

  const postToFrame = useCallback((payload: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(payload, '*');
  }, []);

  const sendWebArInit = useCallback(() => {
    const payload: Record<string, unknown> = {};
    if (modelUrl) payload.modelUrl = modelUrl;
    if (repairedModelUrl != null && repairedModelUrl !== '') payload.repairedModelUrl = repairedModelUrl;
    if (targetUrl) payload.targetUrl = targetUrl;
    if (targetImageUrl) payload.targetImageUrl = targetImageUrl;
    if (title) payload.title = title;
    if (Object.keys(payload).length === 0) return;
    postToFrame({ type: 'WEBAR_INIT', payload });
  }, [modelUrl, repairedModelUrl, postToFrame, targetImageUrl, targetUrl, title]);

  useEffect(() => {
    setIframeLoaded(false);
    setChildReady(false);
    setIframeError(false);
  }, [src]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data =
        typeof ev.data === 'string' ? parseWebArPostMessageData(ev.data) : (ev.data as Record<string, unknown> | null);
      if (!data || typeof data !== 'object') return;
      if (onBridgeMessage) onBridgeMessage(data);
      if (data.type === 'WEBAR_READY') {
        setChildReady(true);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onBridgeMessage, src]);

  useEffect(() => {
    if (!childReady) return;
    sendWebArInit();
  }, [childReady, sendWebArInit]);

  const setMode = useCallback(
    (mode: ARViewerMode) => {
      postToFrame({ type: 'SET_STATE', state: mode });
    },
    [postToFrame]
  );

  const startAr = useCallback(() => postToFrame({ type: 'START_AR' }), [postToFrame]);
  const stopAr = useCallback(() => postToFrame({ type: 'STOP_AR' }), [postToFrame]);

  const onIframeLoad = useCallback(() => {
    setIframeLoaded(true);
  }, []);

  const showOverlay = !iframeLoaded || !childReady;

  if (!resolvedOrigin) {
    return (
      <div className={className} style={{ position: 'relative', width: '100%', minHeight: 420, padding: 16 }}>
        <div
          style={{
            borderRadius: 12,
            border: '1px solid rgba(248,113,113,0.45)',
            background: 'rgba(69,10,10,0.88)',
            color: '#fecaca',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: '#fff' }}>WebAR needs an API origin.</strong>
          <p style={{ margin: '10px 0 0' }}>
            Set <code style={{ color: '#fff' }}>NEXT_PUBLIC_API_URL</code> in <code style={{ color: '#fff' }}>frontend/.env.local</code> to your
            HTTPS API base (no <code style={{ color: '#fff' }}>/api</code> suffix), e.g. your ngrok URL, then restart{' '}
            <code style={{ color: '#fff' }}>next dev</code> / <code style={{ color: '#fff' }}>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', width: '100%', minHeight: 420 }}>
      {showHttpWarning ? (
        <div
          style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(248,113,113,0.45)',
            background: 'rgba(69,10,10,0.88)',
            color: '#fecaca',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: '#fff' }}>Camera may be blocked:</strong> the iframe origin uses{' '}
          <strong>HTTP</strong> (not localhost). Mobile browsers require <strong>HTTPS</strong> (or localhost) for
          camera access.
        </div>
      ) : null}

      {showOverlay && !iframeError ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            zIndex: 2,
            background: 'rgba(5,5,6,0.55)',
            color: '#fff',
            fontSize: 14,
            textAlign: 'center',
            padding: 16,
          }}
        >
          {!iframeLoaded ? 'Loading WebAR page…' : 'Initializing AR session (waiting for WEBAR_READY)…'}
        </div>
      ) : null}

      {iframeError ? (
        <div style={{ padding: 16, color: '#fecaca' }}>WebAR iframe failed to load. Check `apiOrigin` and network.</div>
      ) : null}

      <iframe
        ref={iframeRef}
        title="MindAR vehicle repair preview"
        src={src}
        allow="camera; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
        style={{
          width: '100%',
          height: 'min(72vh, 720px)',
          border: 0,
          borderRadius: 12,
          background: '#050506',
        }}
        onLoad={onIframeLoad}
        onError={() => setIframeError(true)}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('before')}>
          Damaged
        </button>
        <button type="button" onClick={() => setMode('after')}>
          Repaired
        </button>
        <button type="button" onClick={startAr}>
          Start AR
        </button>
        <button type="button" onClick={stopAr}>
          Stop AR
        </button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
        Prefer tapping <strong>Start Camera</strong> inside the iframe (user gesture on mobile). Parent buttons use
        the same <code>postMessage</code> bridge.
      </p>
    </div>
  );
}

export function parseWebArPostMessageData(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
