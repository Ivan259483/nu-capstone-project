'use client';

/**
 * Customer scan entrypoint.
 *
 * Flow responsibility:
 * 1. Let the customer choose or drop one vehicle photo.
 * 2. POST it to the Express AI scan endpoint as multipart/form-data.
 * 3. Store the returned scan payload briefly so the results page can render
 *    immediately while it revalidates from the API.
 * 4. Navigate to /scan/results/[scanId].
 */

import { type DragEvent, type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { getPublicApiOrigin, normalizeApiOrigin } from '@/lib/publicApiOrigin';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type UploadState = 'idle' | 'ready' | 'uploading' | 'analyzing' | 'success' | 'error';

type SelectedPhoto = {
  file: File;
  previewUrl: string;
};

type ScanApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    scanId?: string | null;
    damages?: unknown[];
    estimate?: unknown;
    modelUrl?: string;
    repairedModelUrl?: string;
    [key: string]: unknown;
  };
};

const apiOrigin = getPublicApiOrigin();

function buildApiUrl(path: string) {
  // Relative fallback keeps local reverse-proxy setups working, but production
  // WebAR should set NEXT_PUBLIC_API_URL to the HTTPS Express origin.
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

function postScanImage(formData: FormData, onProgress: (progress: number) => void) {
  return new Promise<ScanApiResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildApiUrl('/api/ai/scan'));
    xhr.timeout = 90_000;

    const token = getStoredAuthToken();
    if (token && token !== 'undefined' && token !== 'null') {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    // Upload progress only covers the file transfer. The UI continues with a
    // simulated analysis progress while the AI endpoint finishes its work.
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const uploaded = Math.round((event.loaded / event.total) * 35);
      onProgress(Math.max(8, Math.min(35, uploaded)));
    };

    xhr.onload = () => {
      let payload: ScanApiResponse = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.success !== false) {
        resolve(payload);
        return;
      }

      reject(new Error(payload?.message || `AI scan failed with status ${xhr.status}.`));
    };

    xhr.onerror = () => reject(new Error('Network error while uploading the vehicle photo.'));
    xhr.ontimeout = () => reject(new Error('The AI scan took too long. Please try again.'));
    xhr.send(formData);
  });
}

export default function VehicleScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const showHttpsWarning = isInsecureRemoteHttp(apiOrigin);
  const isBusy = state === 'uploading' || state === 'analyzing';

  const progressLabel = useMemo(() => {
    if (state === 'uploading') return 'Uploading vehicle photo...';
    if (state === 'analyzing') return 'AI is detecting damage and building the estimate...';
    if (state === 'success') return 'Scan complete. Opening results...';
    return 'Ready to scan';
  }, [state]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const acceptPhoto = (file: File | undefined) => {
    setError('');

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setState('error');
      setError('Please upload a JPG, PNG, HEIC, or WebP vehicle photo.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setState('error');
      setError(`Please choose an image under ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setPhoto({ file, previewUrl });
    setProgress(0);
    setState('ready');
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptPhoto(event.target.files?.[0]);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    acceptPhoto(event.dataTransfer.files?.[0]);
  };

  const startAnalysisProgress = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        const next = current < 35 ? 38 : current + Math.max(1, Math.round((92 - current) * 0.08));
        return Math.min(92, next);
      });
    }, 700);
  };

  const submitScan = async () => {
    if (!photo || isBusy) return;

    setError('');
    setProgress(4);
    setState('uploading');

    const formData = new FormData();
    formData.append('images', photo.file);
    formData.append('angles', JSON.stringify(['close_up']));

    try {
      const response = await postScanImage(formData, (uploadProgress) => {
        setProgress(uploadProgress);
        if (uploadProgress >= 35) {
          setState('analyzing');
          startAnalysisProgress();
        }
      });

      setState('analyzing');
      startAnalysisProgress();

      const scanId = response.data?.scanId;
      if (!scanId) {
        throw new Error('The scan completed, but the API did not return a scanId.');
      }

      sessionStorage.setItem(`autospf:scan:${scanId}`, JSON.stringify(response.data));
      setProgress(100);
      setState('success');
      router.push(`/scan/results/${encodeURIComponent(scanId)}`);
    } catch (err) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setState('error');
      setProgress(0);
      setError(err instanceof Error ? err.message : 'Unable to complete the AI scan.');
    }
  };

  const clearPhoto = () => {
    if (isBusy) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPhoto(null);
    setProgress(0);
    setState('idle');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-8 pt-6 sm:px-6">
        <header className="mb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            AutoSPF+ AI Damage Scan
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Scan your vehicle</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Upload a clear photo of the damaged area. The AI will detect damage, estimate repair cost, and prepare your AR preview.
          </p>
        </header>

        {showHttpsWarning ? (
          <div className="mb-4 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p>
              Your API origin is using HTTP. Mobile browsers require HTTPS for camera-based AR unless you are on localhost.
            </p>
          </div>
        ) : null}

        <section className="flex-1">
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={onDrop}
            className={`relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-5 text-center transition ${
              dragActive
                ? 'border-orange-300 bg-orange-300/10'
                : photo
                  ? 'border-white/10 bg-white/[0.04]'
                  : 'border-white/15 bg-white/[0.03] hover:border-orange-300/60 hover:bg-orange-300/[0.06]'
            } ${isBusy ? 'pointer-events-none opacity-80' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onFileInputChange}
              disabled={isBusy}
            />

            {photo ? (
              <>
                <img
                  src={photo.previewUrl}
                  alt="Selected vehicle damage"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/20" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    clearPhoto();
                  }}
                  className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black"
                  aria-label="Remove selected photo"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="relative mt-auto w-full text-left">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    Photo ready
                  </div>
                  <p className="line-clamp-1 text-sm font-medium text-white">{photo.file.name}</p>
                  <p className="mt-1 text-xs text-slate-300">{(photo.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-orange-400/15 text-orange-200">
                  <UploadCloud className="h-9 w-9" />
                </div>
                <h2 className="text-xl font-semibold text-white">Upload damage photo</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
                  Drag and drop an image here, or tap to use your camera or photo library.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
                  <Camera className="h-4 w-4" />
                  Choose photo
                </div>
              </div>
            )}
          </label>

          {error ? (
            <div className="mt-4 flex gap-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              <p>{error}</p>
            </div>
          ) : null}

          {(isBusy || state === 'success') && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-white">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-300" />
                  {progressLabel}
                </span>
                <span className="text-slate-300">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-orange-400 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <footer className="sticky bottom-0 mt-6 bg-gradient-to-t from-[#07090f] via-[#07090f] to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
          <button
            type="button"
            onClick={submitScan}
            disabled={!photo || isBusy || state === 'success'}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-orange-400 px-5 text-base font-semibold text-slate-950 shadow-lg shadow-orange-950/30 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            {isBusy || state === 'success' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
            {isBusy || state === 'success' ? 'Analyzing...' : 'Start AI scan'}
          </button>
        </footer>
      </div>
    </main>
  );
}
