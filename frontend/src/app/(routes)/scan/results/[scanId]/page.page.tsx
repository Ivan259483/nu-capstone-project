'use client';

/**
 * Customer scan results page.
 *
 * 3D flow (explicit):
 * 1. Load scan + WebAR session (estimate, damages, optional resume of in-progress Meshy job).
 * 2. User taps "Generate 3D Model" → POST /api/ai/generate-3d { scanId } → poll GET /api/ai/generate-3d/:taskId.
 * 3. While polling: loading UI ("Generating 3D model via Meshy AI…").
 * 4. On success: <model-viewer> shows the proxied GLB + damages overlay; "View in AR →" enables after model `load`.
 * 5. "View in AR →" opens ARModal (MindAR iframe) with modelUrl + repairedModelUrl from the session.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarCheck,
  Car,
  CheckCircle2,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import ARModal from '@/components/webar/ARModal';
import { getPublicApiOrigin, normalizeApiOrigin } from '@/lib/publicApiOrigin';

type Severity = 'high' | 'medium' | 'low';

type WebARDamage = {
  id: string;
  type: string;
  severity: Severity;
  description: string;
  confidence: number;
  affectedArea: string;
  urgency?: string;
};

type WebARSession = {
  scanId: string;
  title: string;
  modelStatus?: string;
  modelTaskId?: string;
  modelSource?: string;
  modelUrl: string;
  repairedModelUrl?: string;
  fallbackModelUrl?: string;
  targetUrl?: string;
  targetImageUrl?: string;
  vehicleDetected?: boolean;
  overallCondition?: string;
  recommendedPackage?: string;
  urgency?: string;
  summary?: string;
  damages: WebARDamage[];
  createdAt?: string;
};

type ScanLineItem = {
  id?: string;
  serviceName?: string;
  affectedArea?: string;
  damageType?: string;
  severity?: Severity;
  formattedSubtotal?: string;
  subtotalMin?: number;
  subtotalMax?: number;
};

type ScanEstimate = {
  formattedTotal?: string;
  formattedSubtotal?: string;
  totalEstimate?: number;
  subtotal?: number;
  subtotalMax?: number;
  lineItems?: ScanLineItem[];
  recommendedPackage?: {
    name?: string;
    formattedPrice?: string;
    description?: string;
  };
  assumptions?: string[];
};

type ScanDetails = {
  scanId: string;
  damages?: WebARDamage[];
  estimate?: ScanEstimate;
  summary?: string;
  recommendedPackage?: string;
  urgency?: string;
  overallCondition?: string;
  modelTaskId?: string;
  modelStatus?: string;
  modelUrl?: string;
  repairedModelUrl?: string;
  imageUrls?: string[];
  createdAt?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type Start3DResponse = {
  success?: boolean;
  status?: string;
  message?: string;
  task_id?: string;
  scanId?: string;
};

type Poll3DResponse = {
  success?: boolean;
  status?: string;
  message?: string;
  task_id?: string;
  progress?: number;
  model_url?: string;
  repaired_model_url?: string;
};

type ThreeDPhase = 'idle' | 'generating' | 'ready' | 'failed';

const apiOrigin = getPublicApiOrigin();

function buildApiUrl(path: string) {
  return apiOrigin ? `${apiOrigin}${path}` : path;
}

function isInsecureRemoteHttp(origin: string) {
  try {
    const url = new URL(normalizeApiOrigin(origin));
    const localHosts = ['localhost', '127.0.0.1', '::1'];
    return url.protocol === 'http:' && !localHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function getStoredAuthToken() {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('autospf_token') ||
    sessionStorage.getItem('autospf_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('authToken') ||
    ''
  );
}

async function fetchJson<T>(path: string, options: RequestInit = {}, tolerateHttpError = false): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getStoredAuthToken();

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && token !== 'undefined' && token !== 'null') {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as T & { message?: string; success?: boolean };

  if (!tolerateHttpError && (!response.ok || payload?.success === false)) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

function readCachedScan(scanId: string): ScanDetails | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`autospf:scan:${scanId}`);
    return raw ? (JSON.parse(raw) as ScanDetails) : null;
  } catch {
    return null;
  }
}

function cacheScan(scan: ScanDetails | null) {
  if (!scan?.scanId || typeof window === 'undefined') return;
  sessionStorage.setItem(`autospf:scan:${scan.scanId}`, JSON.stringify(scan));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPhp(value: number) {
  return `₱${Math.max(0, Math.round(value || 0)).toLocaleString('en-PH')}`;
}

function fallbackEstimate(damages: WebARDamage[]) {
  const bands: Record<Severity, [number, number]> = {
    high: [12000, 23000],
    medium: [8000, 18000],
    low: [3500, 9000],
  };

  const totals = damages.reduce(
    (acc, damage) => {
      const [min, max] = bands[damage.severity || 'medium'] || bands.medium;
      return { min: acc.min + min, max: acc.max + max };
    },
    { min: 0, max: 0 }
  );

  if (!damages.length) return 'Pending shop estimate';
  return `${formatPhp(totals.min)} - ${formatPhp(totals.max)}`;
}

function severityClass(severity: string | undefined) {
  if (severity === 'high') return 'border-red-400/30 bg-red-500/12 text-red-100';
  if (severity === 'low') return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100';
  return 'border-amber-400/30 bg-amber-500/12 text-amber-100';
}

function severityLabel(severity: string | undefined) {
  if (severity === 'high') return 'High';
  if (severity === 'low') return 'Low';
  return 'Medium';
}

function ensureModelViewerScript() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (customElements.get('model-viewer') || document.querySelector('[data-model-viewer-script]')) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
    script.setAttribute('data-model-viewer-script', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load model-viewer.'));
    document.head.appendChild(script);
  });
}

function ModelPreviewSection({
  phase,
  previewImageUrl,
  modelUrl,
  damages,
  isGenerating,
  progress,
  message,
  onGenerateClick,
  generateDisabled,
  onModelViewerLoad,
}: {
  phase: ThreeDPhase;
  previewImageUrl?: string | null;
  modelUrl?: string | null;
  damages: WebARDamage[];
  isGenerating: boolean;
  progress: number;
  message: string;
  onGenerateClick: () => void;
  generateDisabled: boolean;
  onModelViewerLoad: () => void;
}) {
  const [viewerReady, setViewerReady] = useState(false);
  const modelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureModelViewerScript()
      .then(() => {
        if (mounted) setViewerReady(true);
      })
      .catch(() => {
        if (mounted) setViewerReady(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const el = modelRef.current;
    if (!el || phase !== 'ready' || !modelUrl) return;

    const onLoad = () => onModelViewerLoad();
    el.addEventListener('load', onLoad);
    return () => {
      el.removeEventListener('load', onLoad);
    };
  }, [modelUrl, onModelViewerLoad, phase, viewerReady]);

  const showModelViewer = phase === 'ready' && Boolean(modelUrl) && viewerReady;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-white">3D damage model (Meshy)</h2>
          <p className="text-xs text-slate-400">
            {phase === 'ready' ? 'Interactive GLB preview — then open WebAR on your phone.' : 'Generate a GLB from your scan photo before opening AR.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-slate-200">
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-300" /> : <Sparkles className="h-3.5 w-3.5 text-orange-200" />}
          {isGenerating ? `${Math.round(progress)}%` : phase === 'ready' ? 'Ready' : phase === 'failed' ? 'Failed' : 'Not generated'}
        </span>
      </div>

      <div className="relative min-h-[340px] bg-[#050506] sm:min-h-[440px]">
        {showModelViewer ? (
          <>
            {createElement('model-viewer' as any, {
              ref: modelRef,
              src: modelUrl,
              alt: 'Generated vehicle damage model',
              'camera-controls': true,
              'auto-rotate': true,
              'shadow-intensity': '1.2',
              'environment-image': 'neutral',
              exposure: '1',
              loading: 'eager',
              style: {
                width: '100%',
                height: '100%',
                minHeight: 340,
                background: 'radial-gradient(circle at center, #171923 0%, #050506 72%)',
              },
            })}
            {damages.length ? (
              <div className="pointer-events-none absolute left-3 top-3 z-[1] max-h-[min(52%,280px)] w-[min(92%,280px)] overflow-y-auto rounded-xl border border-white/15 bg-black/70 p-3 text-left shadow-lg backdrop-blur-md sm:left-4 sm:top-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-200">Damages</p>
                <ul className="space-y-2">
                  {damages.slice(0, 8).map((d, i) => (
                    <li key={d.id || i} className="text-xs leading-snug text-slate-100">
                      <span className="font-medium text-white">{d.type || 'Damage'}</span>
                      <span className="text-slate-400"> — {d.affectedArea || 'Body'}</span>
                      {d.description ? <p className="mt-0.5 text-[11px] text-slate-400">{d.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="relative flex min-h-[340px] flex-col sm:min-h-[440px]">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Scan reference" className="h-full w-full flex-1 object-cover opacity-40" />
            ) : (
              <div className="flex-1 bg-gradient-to-b from-[#12141c] to-[#050506]" />
            )}
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                {isGenerating ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-300" /> : <Sparkles className="mx-auto h-10 w-10 text-orange-200/80" />}
                <p className="mt-4 text-sm font-medium text-white">
                  {isGenerating ? 'Generating 3D model via Meshy AI…' : phase === 'failed' ? '3D generation did not complete' : '3D model not generated yet'}
                </p>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
                  {isGenerating
                    ? message || 'This usually takes 1–3 minutes. You can keep this screen open.'
                    : phase === 'failed'
                      ? message || 'Try again, or continue with the estimate below.'
                      : 'Tap the button to build an interactive GLB from your uploaded scan image.'}
                </p>
                {!isGenerating ? (
                  <button
                    type="button"
                    onClick={onGenerateClick}
                    disabled={generateDisabled}
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-orange-400 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-950/30 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 disabled:shadow-none"
                  >
                    {phase === 'failed' ? 'Retry 3D generation' : 'Generate 3D Model'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {isGenerating ? (
          <div className="absolute inset-x-4 bottom-4 z-[2] rounded-xl border border-white/10 bg-black/80 p-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-200">
              <span>{message || 'Meshy AI is building your GLB…'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-orange-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function ScanResultsPage() {
  const router = useRouter();
  const params = useParams<{ scanId?: string | string[] }>();
  const scanId = Array.isArray(params.scanId) ? params.scanId[0] : params.scanId || '';

  const pollingLockRef = useRef(false);
  const initialResumeRef = useRef(false);

  const [session, setSession] = useState<WebARSession | null>(null);
  const [scan, setScan] = useState<ScanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [arOpen, setArOpen] = useState(false);

  const [threeDPhase, setThreeDPhase] = useState<ThreeDPhase>('idle');
  const [generating3D, setGenerating3D] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelMessage, setModelMessage] = useState('');
  const [modelViewerLoaded, setModelViewerLoaded] = useState(false);

  const showHttpsWarning = isInsecureRemoteHttp(apiOrigin);

  const refreshData = useCallback(
    async (quiet = false) => {
      if (!scanId) {
        setError('Missing scan id.');
        setLoading(false);
        return;
      }
      if (!quiet) {
        setLoading(true);
        setError('');
      }

      const cached = readCachedScan(scanId);
      if (cached) setScan(cached);

      try {
        const sessionPayload = await fetchJson<ApiEnvelope<WebARSession>>(`/api/ai/webar-session/${encodeURIComponent(scanId)}`);
        if (!sessionPayload.data) throw new Error('WebAR session payload was empty.');
        setSession(sessionPayload.data);

        try {
          const scanPayload = await fetchJson<ApiEnvelope<ScanDetails>>(`/api/ai/scan/${encodeURIComponent(scanId)}`);
          if (scanPayload.data) {
            setScan(scanPayload.data);
            cacheScan(scanPayload.data);
          }
        } catch {
          if (cached) setScan(cached);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load scan results.');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [scanId]
  );

  useEffect(() => {
    initialResumeRef.current = false;
    void refreshData(false);
  }, [refreshData]);

  const runPollTask = useCallback(
    async (taskId: string) => {
      if (pollingLockRef.current) return;
      pollingLockRef.current = true;
      const startedAt = Date.now();

      try {
        setGenerating3D(true);
        setThreeDPhase('generating');
        setModelMessage('Generating 3D model via Meshy AI…');

        while (Date.now() - startedAt < 240_000) {
          await delay(4_000);

          const poll = await fetchJson<Poll3DResponse>(`/api/ai/generate-3d/${encodeURIComponent(taskId)}`, {}, true);
          const status = String(poll.status || '').toLowerCase();
          const progress = status === 'ar_ready' ? 100 : Math.max(0, Math.min(98, Number(poll.progress) || 0));

          setModelProgress(progress);
          setModelMessage(poll.message || 'Meshy is refining geometry and textures…');

          if (status === 'ar_ready' && poll.model_url) {
            setModelProgress(100);
            setModelMessage('3D model ready.');
            await refreshData(true);
            setThreeDPhase('ready');
            setModelViewerLoaded(false);
            return;
          }

          if (status === 'failed' || poll.success === false) {
            setModelMessage(poll.message || '3D generation failed.');
            setThreeDPhase('failed');
            return;
          }

          if (status === 'unavailable') {
            setModelMessage(poll.message || '3D generation is unavailable.');
            setThreeDPhase('failed');
            return;
          }
        }

        setModelMessage('3D generation is taking longer than expected. Try again in a moment.');
        setThreeDPhase('failed');
      } finally {
        setGenerating3D(false);
        pollingLockRef.current = false;
      }
    },
    [refreshData]
  );

  /** Derive phase from server when session/scan refresh (Meshy already ready, or resume an in-flight job). */
  useEffect(() => {
    if (!session) return;

    if (session.modelSource === 'meshy') {
      setThreeDPhase('ready');
      setModelViewerLoaded(false);
      return;
    }

    if (generating3D) return;

    if (scan?.modelStatus === 'processing' && scan.modelTaskId && !initialResumeRef.current) {
      initialResumeRef.current = true;
      void runPollTask(scan.modelTaskId);
    }
  }, [generating3D, runPollTask, scan?.modelStatus, scan?.modelTaskId, session]);

  const handleGenerate3D = useCallback(async () => {
    if (!scanId || pollingLockRef.current) return;
    setModelViewerLoaded(false);
    setError('');

    try {
      setGenerating3D(true);
      setThreeDPhase('generating');
      setModelProgress(6);
      setModelMessage('Starting Meshy AI…');

      const start = await fetchJson<Start3DResponse>(
        '/api/ai/generate-3d',
        {
          method: 'POST',
          body: JSON.stringify({ scanId }),
        },
        true
      );

      if (String(start.status || '').toLowerCase() !== 'processing' || !start.task_id) {
        setModelMessage(start.message || 'Unable to start 3D generation.');
        setThreeDPhase('failed');
        setGenerating3D(false);
        return;
      }

      setModelProgress(12);
      await runPollTask(start.task_id);
    } catch (err) {
      setModelMessage(err instanceof Error ? err.message : 'Unable to start 3D generation.');
      setThreeDPhase('failed');
    } finally {
      setGenerating3D(false);
    }
  }, [runPollTask, scanId]);

  useEffect(() => {
    setModelViewerLoaded(false);
  }, [session?.modelUrl]);

  const damages = useMemo(() => {
    const fromScan = Array.isArray(scan?.damages) ? scan?.damages : [];
    const fromSession = Array.isArray(session?.damages) ? session?.damages : [];
    return (fromScan.length ? fromScan : fromSession) || [];
  }, [scan?.damages, session?.damages]);

  const estimateText = useMemo(() => {
    const estimate = scan?.estimate;
    if (estimate?.formattedTotal) return estimate.formattedTotal;
    if (estimate?.formattedSubtotal) return estimate.formattedSubtotal;
    if (estimate?.recommendedPackage?.formattedPrice) return estimate.recommendedPackage.formattedPrice;
    if (estimate?.totalEstimate) return formatPhp(estimate.totalEstimate);
    return fallbackEstimate(damages);
  }, [damages, scan?.estimate]);

  const lineItems = useMemo(() => {
    if (scan?.estimate?.lineItems?.length) {
      return scan.estimate.lineItems.map((line, index) => ({
        id: line.id || `line_${index + 1}`,
        title: line.serviceName || line.damageType || 'Repair service',
        area: line.affectedArea || 'Vehicle Body',
        severity: line.severity || 'medium',
        amount: line.formattedSubtotal || fallbackEstimate([{ ...damages[index], severity: line.severity || 'medium' } as WebARDamage]),
      }));
    }

    return damages.map((damage, index) => ({
      id: damage.id || `damage_${index + 1}`,
      title: `${severityLabel(damage.severity)} ${damage.type || 'damage'} repair`,
      area: damage.affectedArea || 'Vehicle Body',
      severity: damage.severity || 'medium',
      amount: fallbackEstimate([damage]),
    }));
  }, [damages, scan?.estimate?.lineItems]);

  const previewImageUrl = scan?.imageUrls?.[0] || null;

  const meshyViewerUrl = threeDPhase === 'ready' && session?.modelSource === 'meshy' ? session.modelUrl || '' : '';

  const displayModelUrl = session?.modelUrl || scan?.modelUrl || '';
  const displayRepairedModelUrl = session?.repairedModelUrl || scan?.repairedModelUrl || displayModelUrl;

  const generateDisabled = !scanId || generating3D || !Array.isArray(scan?.imageUrls) || scan.imageUrls.length === 0;

  const canViewAr = Boolean(session) && threeDPhase === 'ready' && modelViewerLoaded && Boolean(meshyViewerUrl);

  const showArFooterSpinner = generating3D || (threeDPhase === 'ready' && !modelViewerLoaded);

  const summary =
    scan?.summary ||
    session?.summary ||
    (damages.length ? 'The AI found visible vehicle damage and prepared a repair estimate.' : 'No major damage findings were returned.');

  const onModelViewerLoad = useCallback(() => {
    setModelViewerLoaded(true);
  }, []);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090f] px-4 text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-300" />
          <p className="mt-3 text-sm text-slate-300">Loading scan results...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#07090f] px-4 py-8 text-white">
        <div className="mx-auto max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
          <AlertTriangle className="h-7 w-7 text-red-300" />
          <h1 className="mt-4 text-xl font-semibold">Unable to load scan</h1>
          <p className="mt-2 text-sm leading-6 text-red-100">{error}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => router.push('/scan')}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              New scan
            </button>
            <button
              type="button"
              onClick={() => refreshData(false)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push('/scan')}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          New scan
        </button>

        <header className="mb-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100">
              <BadgeCheck className="h-3.5 w-3.5" />
              Analysis complete
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200">
              <Car className="h-3.5 w-3.5" />
              {scan?.overallCondition || session?.overallCondition || 'Fair'} condition
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white">Repair estimate ready</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{summary}</p>
        </header>

        {showHttpsWarning ? (
          <div className="mb-5 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="font-medium text-white">Camera / WebAR needs HTTPS on mobile</p>
              <p className="mt-1">
                Point <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_API_URL</code> at an HTTPS API origin (ngrok, Cloudflare Tunnel, or Express
                with mkcert — see <code className="rounded bg-black/30 px-1">frontend/.env.local.example</code>).
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <ModelPreviewSection
            phase={threeDPhase}
            previewImageUrl={previewImageUrl}
            modelUrl={meshyViewerUrl}
            damages={damages}
            isGenerating={generating3D}
            progress={modelProgress}
            message={modelMessage}
            onGenerateClick={handleGenerate3D}
            generateDisabled={generateDisabled}
            onModelViewerLoad={onModelViewerLoad}
          />

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Estimated repair cost</h2>
                <p className="mt-1 text-xs text-slate-400">Final quote is confirmed after shop inspection.</p>
              </div>
              <Wrench className="h-5 w-5 text-orange-200" />
            </div>

            <div className="mt-5 rounded-2xl bg-white p-4 text-slate-950">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recommended estimate</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{estimateText}</p>
              <p className="mt-2 text-sm text-slate-600">
                {scan?.estimate?.recommendedPackage?.name || scan?.recommendedPackage || session?.recommendedPackage || 'AutoSPF+ repair package'}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {lineItems.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.area}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${severityClass(item.severity)}`}>
                      {severityLabel(item.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-orange-100">{item.amount}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Detected damage</h2>
              <p className="mt-1 text-xs text-slate-400">{damages.length} finding{damages.length === 1 ? '' : 's'} from the AI scan</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-200" />
          </div>

          {damages.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {damages.map((damage, index) => (
                <article key={damage.id || index} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{damage.type || 'Damage'}</p>
                      <p className="mt-1 text-xs text-slate-400">{damage.affectedArea || 'Vehicle Body'}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${severityClass(damage.severity)}`}>
                      {severityLabel(damage.severity)}
                    </span>
                  </div>
                  {damage.description ? <p className="mt-3 text-sm leading-6 text-slate-300">{damage.description}</p> : null}
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    {Math.round((damage.confidence || 0) * 100)}% confidence
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">No damage items were returned for this scan.</div>
          )}
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#07090f]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setArOpen(true)}
            disabled={!canViewAr}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showArFooterSpinner ? <Loader2 className="h-4 w-4 animate-spin text-orange-300" /> : <Eye className="h-4 w-4" />}
            {threeDPhase !== 'ready' ? 'Generate 3D first' : !modelViewerLoaded ? 'Loading 3D preview…' : 'View in AR →'}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/booking/confirmation?scanId=${encodeURIComponent(scanId)}`)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-400 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-950/30 transition active:scale-[0.99]"
          >
            <CalendarCheck className="h-4 w-4" />
            Confirm
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>

      {session && arOpen ? (
        <ARModal
          open={arOpen}
          onClose={() => setArOpen(false)}
          apiOrigin={apiOrigin}
          scanId={scanId}
          modelUrl={displayModelUrl}
          repairedModelUrl={displayRepairedModelUrl}
          targetUrl={session.targetUrl}
          targetImageUrl={session.targetImageUrl}
          title={session.title || 'Vehicle Damage AR View'}
          onBridgeMessage={(msg) => console.log('AR message:', msg)}
        />
      ) : null}
    </main>
  );
}
