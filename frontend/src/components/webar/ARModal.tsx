'use client';

/**
 * Full-screen WebAR overlay.
 *
 * Important: ARViewer touches browser-only iframe/camera behavior, so it is
 * loaded through next/dynamic with ssr:false every time this overlay is used.
 */

import { useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronsLeftRight, Loader2, X } from 'lucide-react';
import { normalizeApiOrigin } from '@/lib/publicApiOrigin';

type BridgeMessage = Record<string, unknown>;

type ARModalProps = {
  open: boolean;
  onClose: () => void;
  apiOrigin: string;
  scanId: string;
  modelUrl?: string | null;
  repairedModelUrl?: string | null;
  targetUrl?: string | null;
  targetImageUrl?: string | null;
  title?: string | null;
  onBridgeMessage?: (msg: BridgeMessage) => void;
};

const ARViewer = dynamic(
  () => import('@/components/webar/ARViewer').then((module) => module.ARViewer),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[420px] place-items-center rounded-xl bg-black text-sm text-slate-300">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-orange-300" />
          Loading AR viewer...
        </span>
      </div>
    ),
  }
);

function isInsecureRemoteHttp(origin: string) {
  try {
    const url = new URL(normalizeApiOrigin(origin));
    const localHosts = ['localhost', '127.0.0.1', '::1'];
    return url.protocol === 'http:' && !localHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

export default function ARModal({
  open,
  onClose,
  apiOrigin,
  scanId,
  modelUrl,
  repairedModelUrl,
  targetUrl,
  targetImageUrl,
  title = 'Vehicle Damage AR View',
  onBridgeMessage,
}: ARModalProps) {
  const resolvedApiOrigin = useMemo(() => normalizeApiOrigin(apiOrigin), [apiOrigin]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const showHttpsWarning = isInsecureRemoteHttp(resolvedApiOrigin);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050506] text-white">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-white/10 bg-black/80 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-orange-200">AR repair simulation</p>
              <h2 className="truncate text-base font-semibold text-white">{title || 'Vehicle Damage AR View'}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close AR viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {showHttpsWarning ? (
              <div className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <p>
                  Camera AR may be blocked because the API origin is HTTP. Use HTTPS on phones, or localhost for development.
                </p>
              </div>
            ) : null}

            <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-slate-200">
              <ChevronsLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-orange-200" />
              <p>
                Tap <span className="font-semibold text-white">Damaged</span> and{' '}
                <span className="font-semibold text-white">Repaired</span> inside the viewer to compare before and after.
                Use Start AR when the target image is visible.
              </p>
            </div>

            {!resolvedApiOrigin ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                Set <code className="rounded bg-black/40 px-1.5 py-0.5">NEXT_PUBLIC_API_URL</code> to the Express API origin
                that serves <code className="rounded bg-black/40 px-1.5 py-0.5">/webar/index.html</code>.
              </div>
            ) : (
              <ARViewer
                apiOrigin={resolvedApiOrigin}
                scanId={scanId}
                modelUrl={modelUrl}
                repairedModelUrl={repairedModelUrl}
                targetUrl={targetUrl || '/webar/targets/autospf-vehicle.mind'}
                targetImageUrl={targetImageUrl || '/webar/targets/autospf-vehicle.png'}
                title={title || 'Vehicle Damage AR View'}
                onBridgeMessage={onBridgeMessage || ((msg) => console.log('AR message:', msg))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
