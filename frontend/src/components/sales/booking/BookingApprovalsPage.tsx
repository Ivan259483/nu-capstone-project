import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Filter,
  Hash,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Phone,
  ReceiptText,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { OrderService, normalizeBooking } from '@/lib/order-service';
import { isEncryptedPlateToken } from '@/lib/salesData';
import { isLikelyInternalVehiclePlate } from '@/lib/vehicle-display';
import SalesStatCard from '@/components/sales/ui/SalesStatCard';
import { SALES_ACCENTS } from '@/components/sales/ui/salesTheme';
import {
  isInlinePaymentProof,
  paymentProofDataUrlToBlob,
} from '@/lib/sales-payment-proof';

const DOWNPAYMENT = 500;
const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

function getToken() {
  const token = localStorage.getItem('autospf_token') || '';
  return token && token !== 'undefined' && token !== 'null' ? token : '';
}

async function apiPatch(url: string, body?: object) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

const formatMoney = (amount: number) => moneyFormatter.format(Number.isFinite(amount) ? amount : 0);

const formatDateTime = (value: unknown, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    ...options,
  }).format(date);
};

const toTitleCase = (str: string) =>
  str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

const formatTitle = (value: unknown, fallback = '—') => {
  const formatted = toTitleCase(String(value ?? '').trim());
  return formatted || fallback;
};

const formatPlate = (value: unknown, fallback = '—') => {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  // Stored ciphertext (socket/lean) or internal id — never show hex blobs as a plate
  if (isEncryptedPlateToken(s) || isLikelyInternalVehiclePlate(s)) return fallback;
  return s.toUpperCase();
};

const getProofUrl = (booking: any) => booking.paymentProofUrl || booking.downpaymentProof || '';

const getReservationPayment = (booking: any) => {
  const stored = Number(
    booking?.latestPayment?.amountSubmitted
      ?? booking?.latestPayment?.amount
      ?? booking?.downPaymentAmount
  );
  return Number.isFinite(stored) && stored > 0 ? stored : DOWNPAYMENT;
};

const getReference = (booking: any) =>
  booking.bookingReference || booking.orderNumber || String(booking._id || booking.id || '').slice(-8) || '—';

function isPastAppointmentDate(booking: any): boolean {
  const raw = String(booking.bookingDate || booking.date || '').trim();
  if (!raw) return false;

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    todayParts.find((part) => part.type === type)?.value || '';
  const today = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw < today;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return false;
  const parsedDate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return parsedDate < today;
}

/** Stable Mongo ObjectId string for API paths (avoids `[object Object]` from EJSON `$oid` shapes). */
function mongoOrderIdString(booking: { _id?: unknown; id?: unknown }): string {
  const raw = booking._id ?? booking.id;
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const s = raw.trim();
    return /^[a-f0-9]{24}$/i.test(s) ? s : '';
  }
  if (typeof raw === 'object' && raw !== null && '$oid' in (raw as Record<string, unknown>)) {
    const oid = String((raw as { $oid?: string }).$oid || '').trim();
    return /^[a-f0-9]{24}$/i.test(oid) ? oid : '';
  }
  try {
    const s = String((raw as { toString?: () => string }).toString?.() ?? '').trim();
    return /^[a-f0-9]{24}$/i.test(s) ? s : '';
  } catch {
    return '';
  }
}

/** Fetch approval preview + GCash proof fields for the proof review modal. */
async function loadBookingWithProof(
  orderId: string,
  options?: { signal?: AbortSignal }
): Promise<{ merged: Record<string, unknown> | null; error?: string }> {
  const id = String(orderId).trim();
  if (!id) return { merged: null, error: 'Invalid booking id.' };

  const signal = options?.signal;
  const [s0, s1] = await Promise.allSettled([
    OrderService.getOrderApprovalPreview(id, { signal }),
    OrderService.getOrderGcashProofFields(id, { signal }),
  ]);

  if (signal?.aborted) return { merged: null };

  if (s0.status === 'rejected') {
    if (axios.isCancel(s0.reason)) return { merged: null };
    throw s0.reason;
  }
  if (s1.status === 'rejected' && axios.isCancel(s1.reason)) return { merged: null };

  const res = s0.value;
  const pr = s1.status === 'fulfilled' ? s1.value : { success: false as const, data: undefined };
  const proofLoadFailed = s1.status === 'rejected' || !pr?.success;
  const d = res?.data as Record<string, unknown> | undefined;
  const pd = (pr?.success && pr?.data ? pr.data : {}) as {
    downpaymentProof?: string;
    paymentProofUrl?: string;
  };

  if (!res?.success || !res.data) {
    return { merged: null, error: res?.message || 'Failed to load booking proof.' };
  }

  const merged = {
    ...res.data,
    downpaymentProof: pd?.downpaymentProof ?? (d?.downpaymentProof as string | undefined),
    paymentProofUrl: pd?.paymentProofUrl ?? (d?.paymentProofUrl as string | undefined),
    hasPaymentProof: Boolean(
      pd?.downpaymentProof ||
        pd?.paymentProofUrl ||
        d?.downpaymentProof ||
        d?.paymentProofUrl
    ),
  };
  return { merged, error: proofLoadFailed ? 'Unable to load payment proof.' : undefined };
}
const APPROVAL_PENDING_STATUSES = ['pending_confirmation'];
const APPROVAL_APPROVED_STATUSES = ['approved', 'confirmed'];
const APPROVAL_REJECTED_STATUSES = ['rejected'];
const APPROVAL_VISIBLE_STATUSES = [...APPROVAL_PENDING_STATUSES, ...APPROVAL_APPROVED_STATUSES, ...APPROVAL_REJECTED_STATUSES];

const isPendingApprovalStatus = (status: unknown) => APPROVAL_PENDING_STATUSES.includes(String(status || '').toLowerCase());
const isApprovedApprovalStatus = (status: unknown) => APPROVAL_APPROVED_STATUSES.includes(String(status || '').toLowerCase());
const isRejectedApprovalStatus = (status: unknown) => APPROVAL_REJECTED_STATUSES.includes(String(status || '').toLowerCase());
const isApprovalVisibleStatus = (status: unknown) => APPROVAL_VISIBLE_STATUSES.includes(String(status || '').toLowerCase());

const toApprovalListBooking = (raw: any) => {
  const normalized = normalizeBooking(raw);
  return {
    ...normalized,
    paymentProofUrl: undefined,
    downpaymentProof: undefined,
  };
};

const applyApprovalScope = (rows: any[]) =>
  rows
    .map(toApprovalListBooking)
    .filter((booking) => isApprovalVisibleStatus(booking.status));

const getTotal = (booking: any) => Number(booking.totalPrice || booking.totalAmount || 0);

const getVehicleLabel = (booking: any) =>
  [
    booking.vehicleYear ? String(booking.vehicleYear).trim() : '',
    formatTitle(booking.vehicleMake, ''),
    formatTitle(booking.vehicleModel, ''),
  ].filter(Boolean).join(' ') || formatTitle(booking.vehicleInfo, '—');

const getScheduleLabel = (booking: any) =>
  [booking.bookingDate || booking.date || '—', booking.bookingTime || booking.time || ''].filter(Boolean).join(' ');

const getInitials = (name: string) => {
  const parts = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'C') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
};

/** Earlier submission → lower queue number (FIFO). */
function approvalFifoTimestamp(booking: Record<string, unknown>): number {
  const raw =
    booking.createdAt ??
    booking.created_at ??
    (booking as { bookedAt?: unknown }).bookedAt ??
    (booking as { submittedAt?: unknown }).submittedAt;
  if (raw != null && raw !== '') {
    const t = new Date(raw as string).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const id = String((booking as { _id?: unknown })._id ?? (booking as { id?: unknown }).id ?? '');
  if (/^[a-f0-9]{24}$/i.test(id)) {
    return parseInt(id.slice(0, 8), 16) * 1000;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortPendingApprovalsFifo(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const d = approvalFifoTimestamp(a) - approvalFifoTimestamp(b);
    if (d !== 0) return d;
    return String(a._id || a.id).localeCompare(String(b._id || b.id));
  });
}

type PendingSort = 'oldest' | 'newest' | 'appointment' | 'amount' | 'method';

function sortPendingApprovals(list: any[], sort: PendingSort): any[] {
  const fifo = sortPendingApprovalsFifo(list);
  if (sort === 'oldest') return fifo;

  return [...fifo].sort((a, b) => {
    if (sort === 'newest') return approvalFifoTimestamp(b) - approvalFifoTimestamp(a);
    if (sort === 'appointment') {
      const aValue = `${a.bookingDate || a.date || '9999-12-31'} ${a.bookingTime || a.time || ''}`;
      const bValue = `${b.bookingDate || b.date || '9999-12-31'} ${b.bookingTime || b.time || ''}`;
      return aValue.localeCompare(bValue) || approvalFifoTimestamp(a) - approvalFifoTimestamp(b);
    }
    if (sort === 'amount') {
      return getReservationPayment(b) - getReservationPayment(a) || approvalFifoTimestamp(a) - approvalFifoTimestamp(b);
    }
    const aMethod = String(a.paymentMethod || a.paymentProvider || 'GCash');
    const bMethod = String(b.paymentMethod || b.paymentProvider || 'GCash');
    return aMethod.localeCompare(bMethod) || approvalFifoTimestamp(a) - approvalFifoTimestamp(b);
  });
}

// ─── Status badge ───────────────────────────────────────────────────────────
function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
      </span>
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Awaiting verification</span>
    </span>
  );
}

// ─── Payment breakdown ───────────────────────────────────────────────────────
function PayBreakdown({ total, paid = DOWNPAYMENT }: { total: number; paid?: number }) {
  const balance = Math.max(0, total - paid);
  return (
    <div className="booking-payment-ledger overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
      <div className="flex items-center justify-between bg-slate-50/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm shadow-blue-600/12">
            <WalletCards size={16} strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Payment</p>
            <p className="text-xs font-bold text-slate-800">Reservation fee</p>
          </div>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
          GCash
        </span>
      </div>

      <div className="space-y-2 px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-slate-500">Service total</span>
          <span className="font-black tabular-nums text-slate-950">{formatMoney(total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-emerald-700">Amount paid</span>
          <span className="font-black tabular-nums text-emerald-600">{formatMoney(paid)}</span>
        </div>
        <div className="h-px bg-slate-100" />
        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-950 px-3 py-2 text-white">
          <span className="font-black">Remaining balance</span>
          <span className="font-black tabular-nums">{formatMoney(balance)}</span>
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div className="booking-approval-detail min-w-0 rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-100">
      <div className="mb-1 flex items-center gap-1.5">
        {Icon ? <Icon size={12} strokeWidth={2.4} className="text-slate-400" /> : null}
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      </div>
      <div className="min-w-0 truncate text-[13px] font-extrabold text-slate-800">{value}</div>
    </div>
  );
}

type ProofLoadState = 'idle' | 'loading' | 'loaded' | 'error';

function ViewerControl({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function ProofViewer({ proofUrl, loading, error, onRetry, onReadyChange }: {
  proofUrl: string;
  loading?: boolean;
  error?: string;
  onRetry: () => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [imageState, setImageState] = useState<ProofLoadState>(proofUrl ? 'loading' : 'idle');
  const [displayUrl, setDisplayUrl] = useState(() => isInlinePaymentProof(proofUrl) ? '' : proofUrl);
  const [retryKey, setRetryKey] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setImageState(proofUrl ? 'loading' : 'idle');
    onReadyChange?.(false);

    if (!proofUrl) {
      setDisplayUrl('');
      return undefined;
    }

    if (!isInlinePaymentProof(proofUrl)) {
      setDisplayUrl(proofUrl);
      return undefined;
    }

    const blob = paymentProofDataUrlToBlob(proofUrl);
    if (!blob) {
      setDisplayUrl('');
      setImageState('error');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(blob);
    setDisplayUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [proofUrl, retryKey, onReadyChange]);

  useEffect(() => {
    if (!displayUrl) return undefined;
    const image = imageRef.current;
    if (!image) return undefined;

    let active = true;
    const markLoaded = () => {
      if (!active) return;
      setImageState('loaded');
      onReadyChange?.(true);
    };
    const markFailed = () => {
      if (!active) return;
      setImageState('error');
      onReadyChange?.(false);
    };

    if (image.complete) {
      if (image.naturalWidth > 0) markLoaded();
      else markFailed();
    } else if (typeof image.decode === 'function') {
      void image.decode().then(markLoaded).catch(() => {
        // Keep the native load/error handlers as a fallback for Safari.
      });
    }

    const timeout = window.setTimeout(() => {
      if (image.complete && image.naturalWidth > 0) markLoaded();
      else markFailed();
    }, 8_000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [displayUrl, retryKey, onReadyChange]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const fit = () => {
    setZoom(1);
    setRotation(0);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, left: 0 }));
  };

  const retry = () => {
    onReadyChange?.(false);
    setImageState(proofUrl ? 'loading' : 'idle');
    setRetryKey((value) => value + 1);
    onRetry();
  };

  const failed = Boolean(error) || imageState === 'error';
  const isLoading = (!proofUrl && Boolean(loading))
    || (Boolean(proofUrl) && imageState === 'loading');

  const viewer = (isExpanded: boolean) => (
    <div className={isExpanded
      ? 'fixed inset-0 z-[10050] flex flex-col bg-slate-950 p-3 sm:p-5'
      : 'relative h-full min-h-[260px] overflow-hidden rounded-2xl bg-slate-950'}>
      <div className="absolute right-3 top-3 z-20 flex flex-wrap justify-end gap-1.5">
        <ViewerControl label="Zoom out" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))} disabled={zoom <= 0.75 || !proofUrl}>
          <ZoomOut size={16} />
        </ViewerControl>
        <span className="flex h-9 min-w-12 items-center justify-center rounded-xl bg-white/10 px-2 text-[10px] font-black text-white ring-1 ring-white/15 backdrop-blur">
          {Math.round(zoom * 100)}%
        </span>
        <ViewerControl label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} disabled={zoom >= 3 || !proofUrl}>
          <ZoomIn size={16} />
        </ViewerControl>
        <ViewerControl label="Fit to screen" onClick={fit} disabled={!proofUrl}>
          <ImageIcon size={16} />
        </ViewerControl>
        <ViewerControl label="Rotate clockwise" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!proofUrl}>
          <RotateCw size={16} />
        </ViewerControl>
        <ViewerControl label={isExpanded ? 'Exit full-screen proof view' : 'Full-screen proof view'} onClick={() => setExpanded(!isExpanded)} disabled={!proofUrl}>
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </ViewerControl>
      </div>

      <div
        ref={scrollRef}
        className={`h-full min-h-0 flex-1 overflow-auto overscroll-contain ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={(event) => {
          if (zoom <= 1 || !scrollRef.current) return;
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: scrollRef.current.scrollLeft,
            top: scrollRef.current.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || !scrollRef.current) return;
          scrollRef.current.scrollLeft = drag.left - (event.clientX - drag.x);
          scrollRef.current.scrollTop = drag.top - (event.clientY - drag.y);
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        {failed && !isLoading ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center text-white">
            <AlertTriangle size={30} className="mb-3 text-amber-400" />
            <p className="text-sm font-black">Unable to load payment proof</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-white/55">Check the connection or retry the receipt request.</p>
            <button type="button" onClick={retry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-slate-950">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : !proofUrl && !isLoading ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center text-white/60">
            <ImageIcon size={30} className="mb-3 opacity-60" />
            <p className="text-sm font-black text-white">No proof available</p>
            <p className="mt-1 text-xs">This reservation has no receipt image to inspect.</p>
          </div>
        ) : (
          <div
            className="relative flex min-h-full min-w-full items-center justify-center p-4 pt-16 sm:p-6 sm:pt-16"
            style={{ width: `${Math.max(1, zoom) * 100}%`, height: `${Math.max(1, zoom) * 100}%` }}
          >
            {displayUrl ? (
              <img
                ref={imageRef}
                key={`${proofUrl.slice(-32)}-${retryKey}`}
                src={displayUrl}
                alt="Uploaded GCash payment proof"
                draggable={false}
                decoding="async"
                fetchPriority="high"
                onLoad={() => {
                  setImageState('loaded');
                  onReadyChange?.(true);
                }}
                onError={() => {
                  setImageState('error');
                  onReadyChange?.(false);
                }}
                className={`h-full w-full select-none object-contain transition-opacity duration-200 ${imageState === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: `rotate(${rotation}deg) scale(${zoom < 1 ? zoom : 1})` }}
              />
            ) : null}
            {isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/75">Loading proof</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {proofUrl && !failed ? (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-[10px] font-semibold text-white/65 backdrop-blur">
          {zoom > 1 ? 'Drag or scroll to pan' : 'Use controls to inspect small receipt text'}
        </div>
      ) : null}
    </div>
  );

  return expanded ? createPortal(viewer(true), document.body) : viewer(false);
}

const VERIFICATION_CHECKS = [
  { id: 'amount', label: 'Amount paid matches reservation' },
  { id: 'identity', label: 'Customer / sender identity checked' },
  { id: 'timestamp', label: 'Payment date and time checked' },
  { id: 'reference', label: 'GCash reference number checked' },
] as const;

const REJECTION_REASONS = [
  'Incorrect payment amount',
  'Invalid payment proof',
  'Screenshot is unclear',
  'Sender information does not match',
  'Duplicate payment',
  'Wrong transaction',
  'Other',
] as const;

function getPaymentMetadata(booking: any): Array<{ label: string; value: string }> {
  const entries: Array<{ label: string; value: string }> = [];
  const method = booking.paymentMethod || booking.paymentProvider || (booking.hasPaymentProof || getProofUrl(booking) ? 'GCash' : '');
  if (method) {
    const methodLabel = String(method).trim().toLowerCase() === 'gcash' ? 'GCash' : formatTitle(method);
    entries.push({ label: 'Payment method', value: methodLabel });
  }

  const submittedAmount = Number(
    booking.latestPayment?.amountSubmitted
      ?? booking.latestPayment?.amount
      ?? booking.downPaymentAmount
  );
  if (Number.isFinite(submittedAmount) && submittedAmount > 0) {
    entries.push({ label: 'Amount submitted', value: formatMoney(submittedAmount) });
  }

  const paymentReference = booking.latestPayment?.paymentReference || booking.gcashReferenceNumber || booking.paymentReference || booking.transactionReference || booking.referenceNumber;
  if (paymentReference) entries.push({ label: 'GCash reference number', value: String(paymentReference) });

  const paymentAt = booking.latestPayment?.submittedAt || booking.paymentDateTime || booking.paymentSubmittedAt || booking.paidAt;
  if (paymentAt) {
    const date = formatDateTime(paymentAt, { year: 'numeric', month: 'short', day: 'numeric' });
    const time = formatDateTime(paymentAt, { hour: 'numeric', minute: '2-digit' });
    if (date) entries.push({ label: 'Payment date', value: date });
    if (time) entries.push({ label: 'Payment time', value: time });
  }

  const proofUploadedAt = booking.proofUploadedAt || booking.paymentProofUploadedAt;
  if (proofUploadedAt) {
    const value = formatDateTime(proofUploadedAt, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    if (value) entries.push({ label: 'Proof uploaded', value });
  }
  return entries;
}

// ─── GCash Proof Modal ───────────────────────────────────────────────────────
function ProofModal({ booking, loading, error, onRetry, onClose, onApprove, onReject, acting }: {
  booking: any;
  loading?: boolean;
  error?: string;
  onRetry: () => void;
  onClose: () => void;
  onApprove: (verificationChecklist: Record<string, boolean>) => Promise<boolean>;
  onReject: (reason: string) => Promise<boolean>;
  acting: boolean;
}) {
  const total = getTotal(booking);
  const paid = getReservationPayment(booking);
  const balance = Math.max(0, total - paid);
  const proofUrl = getProofUrl(booking);
  const ref = getReference(booking);
  const metadata = getPaymentMetadata(booking);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [proofReady, setProofReady] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');
  const allVerified = VERIFICATION_CHECKS.every((check) => checks[check.id]);
  const canApprove = allVerified && proofReady && Boolean(proofUrl) && !loading && !error && !acting;
  const canReject = Boolean(rejectionReason) && (rejectionReason !== 'Other' || Boolean(rejectionNote.trim())) && !acting;
  const handleProofReadyChange = useCallback((ready: boolean) => setProofReady(ready), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || acting) return;
      if (decision) setDecision(null);
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [acting, decision, onClose]);

  const rejectText = rejectionReason === 'Other'
    ? rejectionNote.trim()
    : rejectionNote.trim()
      ? `${rejectionReason}: ${rejectionNote.trim()}`
      : rejectionReason;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="proof-review-title">
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm" onClick={() => { if (!acting && !decision) onClose(); }} />

      <div className="relative grid h-[min(94dvh,900px)] w-full max-w-[1380px] grid-rows-[minmax(260px,40dvh)_minmax(0,1fr)] overflow-hidden rounded-[24px] bg-white shadow-[0_34px_100px_rgba(15,23,42,0.38)] animate-in fade-in zoom-in-95 duration-200 lg:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)] lg:grid-rows-1">
        <div className="min-h-0 bg-slate-950 p-2.5 sm:p-3">
          <ProofViewer proofUrl={proofUrl} loading={loading} error={error} onRetry={onRetry} onReadyChange={handleProofReadyChange} />
        </div>

        <aside className="flex min-h-0 flex-col bg-white shadow-[inset_16px_0_32px_-28px_rgba(15,23,42,0.12)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                <ShieldCheck size={12} /> Payment verification
              </span>
              <h2 id="proof-review-title" className="mt-2 text-lg font-black tracking-tight text-slate-950">GCash proof review</h2>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">Reference #{ref}</p>
            </div>
            <button type="button" onClick={onClose} disabled={acting} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50" aria-label="Close proof review">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid grid-cols-2 gap-2">
              <DetailTile label="Customer" value={booking.customerName || '—'} icon={UserRound} />
              <DetailTile label="Phone" value={booking.customerPhone || '—'} icon={Phone} />
              <DetailTile label="Vehicle" value={getVehicleLabel(booking)} icon={Car} />
              <DetailTile label="Plate" value={formatPlate(booking.vehiclePlate)} icon={Hash} />
              <DetailTile label="Service" value={booking.serviceType || booking.serviceName || '—'} icon={ClipboardCheck} />
              <DetailTile label="Schedule" value={getScheduleLabel(booking)} icon={Calendar} />
            </div>

            <section className="mt-4 rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-100" aria-labelledby="payment-details-title">
              <div className="flex items-center justify-between gap-3">
                <h3 id="payment-details-title" className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Payment details</h3>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">GCash</span>
              </div>
              {metadata.length > 0 ? (
                <dl className="mt-3 grid gap-2 text-xs">
                  {metadata.map((entry) => (
                    <div key={entry.label} className="flex items-start justify-between gap-4">
                      <dt className="font-semibold text-slate-500">{entry.label}</dt>
                      <dd className="max-w-[58%] break-words text-right font-extrabold text-slate-800">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs leading-5 text-slate-500">No additional transaction metadata was submitted with this proof.</p>
              )}
            </section>

            <section className="mt-4" aria-labelledby="verification-checklist-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="verification-checklist-title" className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Verification checklist</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Complete all checks before approval.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${allVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {VERIFICATION_CHECKS.filter((check) => checks[check.id]).length}/{VERIFICATION_CHECKS.length}
                </span>
              </div>
              <div className="mt-2 grid gap-1.5">
                {VERIFICATION_CHECKS.map((check) => {
                  const verified = Boolean(checks[check.id]);
                  return (
                    <label key={check.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${verified ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                      <input
                        type="checkbox"
                        checked={verified}
                        onChange={() => setChecks((current) => ({ ...current, [check.id]: !verified }))}
                        className="sr-only"
                      />
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${verified ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-transparent ring-slate-300'}`}>
                        <Check size={13} strokeWidth={3} />
                      </span>
                      {check.label}
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2.5 border-t border-slate-100 bg-white/95 p-3.5 backdrop-blur sm:p-4">
            <button type="button" onClick={() => setDecision('reject')} disabled={acting || loading} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
              <XCircle size={16} /> Reject proof
            </button>
            <button type="button" onClick={() => setDecision('approve')} disabled={!canApprove} title={!allVerified ? 'Complete all four verification checks first' : undefined} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
              <CheckCircle2 size={16} /> Approve reservation
            </button>
            {!allVerified ? <p className="col-span-2 text-center text-[10px] font-semibold text-slate-400">Approval unlocks after all verification checks are complete.</p> : null}
          </div>
        </aside>
      </div>

      {decision === 'approve' ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="approve-confirm-title">
          <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={22} /></div>
            <h3 id="approve-confirm-title" className="mt-4 text-xl font-black text-slate-950">Approve this reservation?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600"><strong>{formatMoney(paid)}</strong> will be recorded as the reservation payment and the booking will become active.</p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-sm">
              <span className="font-semibold text-slate-500">Remaining balance</span>
              <strong className="tabular-nums text-slate-950">{formatMoney(balance)}</strong>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setDecision(null)} disabled={acting} className="h-11 rounded-xl bg-slate-100 text-sm font-black text-slate-600 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={async () => { const ok = await onApprove(checks); if (!ok) setDecision(null); }} disabled={acting} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60">
                {acting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Processing…</> : 'Confirm approval'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decision === 'reject' ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="reject-confirm-title">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-600">Destructive action</p>
                <h3 id="reject-confirm-title" className="mt-1 text-xl font-black text-slate-950">Why is this proof being rejected?</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">The reason is saved with the booking and shown in its rejection record.</p>
              </div>
              <button type="button" onClick={() => setDecision(null)} disabled={acting} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500" aria-label="Cancel rejection"><X size={17} /></button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {REJECTION_REASONS.map((reason) => (
                <button key={reason} type="button" onClick={() => setRejectionReason(reason)} disabled={acting} className={`min-h-10 rounded-xl px-3 py-2 text-left text-xs font-bold ring-1 transition ${rejectionReason === reason ? 'bg-rose-50 text-rose-700 ring-rose-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                  {reason}
                </button>
              ))}
            </div>
            {rejectionReason ? (
              <div className="mt-4">
                <label htmlFor="rejection-note" className="text-xs font-black text-slate-700">
                  {rejectionReason === 'Other' ? 'Explanation (required)' : 'Additional note (optional)'}
                </label>
                <textarea id="rejection-note" value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} rows={3} disabled={acting} placeholder={rejectionReason === 'Other' ? 'Explain why the payment proof cannot be accepted.' : 'Add any helpful detail for the customer or audit record.'} className="mt-2 w-full resize-none rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-300" />
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setDecision(null)} disabled={acting} className="h-11 rounded-xl bg-slate-100 text-sm font-black text-slate-600 disabled:opacity-50">Back to proof</button>
              <button type="button" onClick={async () => { const ok = await onReject(rejectText); if (!ok) setDecision(null); }} disabled={!canReject} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">
                {acting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Rejecting…</> : <><XCircle size={16} /> Confirm rejection</>}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

// ─── Single booking card ─────────────────────────────────────────────────────
function BookingCard({ booking, onApprove, onReject, idx }: {
  booking: any; idx: number;
  onApprove: (id: string, name: string, total: number, verificationChecklist: Record<string, boolean>) => Promise<boolean>;
  onReject: (id: string, name: string, reason: string) => Promise<boolean>;
}) {
  const [acting, setActing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  /** Bumps when a new load starts or modal closes so stale async work cannot clear state after abort. */
  const detailLoadGenRef = useRef(0);
  const proofFetchAbortRef = useRef<AbortController | null>(null);
  const mongoId = mongoOrderIdString(booking);
  const id = mongoId || String(booking._id ?? booking.id ?? '').trim();
  const total = getTotal(booking);
  const paid = getReservationPayment(booking);
  const ref = getReference(booking);
  const customerName = booking.customerName || 'Customer';
  const serviceLabel = booking.serviceType || booking.serviceName || '—';
  const modalBooking = detailBooking || booking;
  const pastAppointment = isPastAppointmentDate(booking);

  const loadBookingDetail = useCallback(async () => {
    if (!id) return;
    const myGen = ++detailLoadGenRef.current;
    proofFetchAbortRef.current?.abort();
    proofFetchAbortRef.current = new AbortController();
    const signal = proofFetchAbortRef.current.signal;
    setDetailLoading(true);
    setDetailError('');
    try {
      const { merged, error } = await loadBookingWithProof(id, { signal });
      if (signal.aborted || detailLoadGenRef.current !== myGen) return;
      if (!merged) {
        setDetailError(error || 'Failed to load booking proof.');
        return;
      }
      setDetailBooking(merged);
    } catch (e) {
      if (axios.isCancel(e) || detailLoadGenRef.current !== myGen) return;
      setDetailError('Failed to load booking proof.');
    } finally {
      if (detailLoadGenRef.current !== myGen) return;
      setDetailLoading(false);
    }
  }, [id]);

  const openProofReview = useCallback(() => {
    setShowModal(true);
    if (getProofUrl(booking)) {
      setDetailBooking(booking);
      setDetailLoading(false);
      setDetailError('');
      return;
    }
    void loadBookingDetail();
  }, [booking, loadBookingDetail]);

  const doApprove = async (verificationChecklist: Record<string, boolean>): Promise<boolean> => {
    if (acting) return false;
    setActing(true);
    try {
      const ok = await onApprove(id, customerName, total, verificationChecklist);
      if (ok) setShowModal(false);
      return ok;
    } finally {
      setActing(false);
    }
  };

  const doReject = async (reason: string): Promise<boolean> => {
    if (acting) return false;
    setActing(true);
    try {
      const ok = await onReject(id, customerName, reason);
      if (ok) setShowModal(false);
      return ok;
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      {showModal && (
        <ProofModal
          booking={modalBooking}
          loading={detailLoading}
          error={detailError}
          onRetry={() => { void loadBookingDetail(); }}
          onClose={() => {
            if (acting) return;
            proofFetchAbortRef.current?.abort();
            detailLoadGenRef.current += 1;
            setShowModal(false);
            setDetailBooking(null);
            setDetailError('');
          }}
          onApprove={doApprove}
          onReject={doReject}
          acting={acting}
        />
      )}
      <article className="booking-approval-card relative overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-200/70 shadow-[0_10px_30px_rgba(15,23,42,0.055)]" style={{ animationDelay: `${idx * 0.04}s` }}>
        <div className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
        <div className="p-4 pl-5 sm:p-5 sm:pl-6">
          <header className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                <span className="text-sm font-black uppercase">{getInitials(customerName)}</span>
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white"><Smartphone size={9} strokeWidth={3} /></span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-black tracking-tight text-slate-950">{customerName}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Queue {idx + 1}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-1"><Hash size={11} />{ref}</span>
                  <span className="text-slate-300">•</span>
                  <span>{booking.createdAt ? formatDateTime(booking.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Submission time unavailable'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PendingBadge />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-blue-700"><Smartphone size={11} /> GCash</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600"><ReceiptText size={11} /> Proof attached</span>
              {pastAppointment ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700"><AlertTriangle size={11} /> Past appointment date</span> : null}
            </div>
          </header>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,.7fr)]">
            <section aria-label="Booking information">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Booking information</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <DetailTile label="Plate number" value={formatPlate(booking.vehiclePlate)} icon={Car} />
                <DetailTile label="Vehicle" value={getVehicleLabel(booking)} icon={Car} />
                <DetailTile label="Service" value={serviceLabel} icon={ClipboardCheck} />
                <DetailTile label="Appointment date" value={booking.bookingDate || booking.date || '—'} icon={Calendar} />
                <DetailTile label="Appointment time" value={booking.bookingTime || booking.time || '—'} icon={Clock} />
                <DetailTile label="Phone number" value={booking.customerPhone || '—'} icon={Phone} />
              </div>
            </section>
            <section aria-label="Payment summary">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Payment summary</p>
              <PayBreakdown total={total} paid={paid} />
            </section>
          </div>

          <footer className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-slate-100"><BadgeCheck size={17} /></span>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800">Four verification checks required</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Inspect the receipt before approving or rejecting this payment.</p>
              </div>
            </div>
            <button type="button" onClick={openProofReview} disabled={acting} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60">
              <Eye size={15} /> Review payment proof
            </button>
          </footer>
        </div>
      </article>
    </>
  );
}

// ─── Approved / Rejected history row ────────────────────────────────────────
function HistoryRow({ b, type }: { b: any; type: 'approved' | 'rejected' }) {
  const total = getTotal(b);
  const isApproved = type === 'approved';

  return (
    <div className="booking-approval-history-row bg-white rounded-[18px] border-0 p-4 flex items-center gap-4 shadow-[0_2px_10px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] transition-all duration-200 group">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
        isApproved
          ? 'bg-emerald-50 text-emerald-600 shadow-emerald-600/15'
          : 'bg-red-50 text-red-600 shadow-red-600/15'
      }`}>
        {isApproved ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <XCircle size={20} strokeWidth={2.5} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-slate-900 truncate mb-0.5">{b.customerName || '—'}</div>
        <div className="text-[11px] font-medium text-slate-500 truncate flex items-center gap-1.5">
          <span>{b.serviceType || b.serviceName || '—'}</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono bg-slate-100 px-1 rounded">{formatPlate(b.vehiclePlate)}</span>
          <span className="text-slate-300">•</span>
          <span>{b.bookingDate || b.date || '—'}</span>
        </div>
        {!isApproved && b.rejectionReason ? (
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-rose-600">{b.rejectionReason}</p>
        ) : null}
      </div>
      <div className="text-right shrink-0">
        <div className={`font-black text-xs uppercase tracking-wider ${isApproved ? 'text-emerald-600' : 'text-red-600'}`}>
          {isApproved ? 'Approved' : 'Rejected'}
        </div>
        <div className="text-[11px] font-bold text-slate-500 mt-0.5">{formatMoney(total)}</div>
      </div>
    </div>
  );
}

type ForcedProofReviewState = {
  stub: any;
  detail: any | null;
  loading: boolean;
  error: string;
  acting: boolean;
};

type BookingApprovalsPageProps = {
  /** From sales bell — auto-open GCash proof modal for this order */
  preloadOrderId?: string | null;
  onPreloadConsumed?: () => void;
};

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BookingApprovalsPage({
  preloadOrderId = null,
  onPreloadConsumed,
}: BookingApprovalsPageProps = {}) {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingSort, setPendingSort] = useState<PendingSort>('oldest');
  const [forcedReview, setForcedReview] = useState<ForcedProofReviewState | null>(null);
  const forcedProofAbortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const res = await OrderService.getAllOrders({
        suppressErrorToast: true,
        fresh: true,
        limit: 100,
        status: 'pending_confirmation,approved,rejected',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      if (res.success && Array.isArray(res.data)) {
        setAllBookings(applyApprovalScope(res.data));
        setLoadError('');
      } else if (!silent) {
        setLoadError(res.message || 'Unable to load booking approvals.');
      }
    } catch {
      if (!silent) setLoadError('Unable to load booking approvals. Check the connection and try again.');
    }
    finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // ── 60s backup polling — true last-resort if socket is silent ────────
    const interval = setInterval(() => {
      void fetchAll({ silent: true });
    }, 60_000);

    const socket = getSharedSocket();
    socket.emit('join_room', 'booking:approvals');

    const upsertScopedBooking = (incoming: any) => {
      const booking = toApprovalListBooking(incoming);
      const docId = String(booking._id || booking.id || '');
      if (!docId) return;

      setAllBookings((prev) => {
        const existsAt = prev.findIndex((b) => String(b._id || b.id) === docId);

        if (!isApprovalVisibleStatus(booking.status)) {
          return existsAt >= 0 ? prev.filter((_, i) => i !== existsAt) : prev;
        }

        if (existsAt >= 0) {
          const next = [...prev];
          next[existsAt] = { ...next[existsAt], ...booking };
          return next;
        }

        return [booking, ...prev];
      });
    };

    const handleApprovalQueueUpdate = (payload: any) => {
      const docId = String(payload?.bookingId || payload?.booking?._id || payload?.booking?.id || '');
      const nextStatus = payload?.booking?.status ?? payload?.status;

      if (!docId) return;

      if (payload?.type === 'remove') {
        setAllBookings((prev) => prev.filter((b) => String(b._id || b.id) !== docId));
        return;
      }

      if (payload?.booking) {
        upsertScopedBooking(payload.booking);
        return;
      }

      if (!isApprovalVisibleStatus(nextStatus)) {
        setAllBookings((prev) => prev.filter((b) => String(b._id || b.id) !== docId));
        return;
      }

      void fetchAll({ silent: true });
    };

    // ── Shared socket fallback: patch from fullDocument when available ────
    const handleDbChange = (payload: any) => {
      if (payload.collection !== 'orders') return;

      const { operationType, documentKey, fullDocument } = payload;

      // Fallback to HTTP only if fullDocument is absent
      if (!fullDocument && operationType !== 'delete') {
        console.warn('[BookingApprovals] db_change missing fullDocument — fallback HTTP fetch');
        void fetchAll({ silent: true });
        return;
      }

      const docId = String(fullDocument?._id || documentKey?._id || '');

      if (operationType === 'delete') {
        setAllBookings(prev => prev.filter(b => String(b._id || b.id) !== docId));
        console.log('[BookingApprovals] db_change delete → removed', docId);
        return;
      }

      upsertScopedBooking(fullDocument);
      console.log('[BookingApprovals] db_change', operationType, '→ patched', docId);
    };
    socket.on('booking:approval-updated', handleApprovalQueueUpdate);
    socket.on('db_change', handleDbChange);

    // ── Tab visibility / focus refresh ───────────────────────────────────
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(() => {
          console.log('[BookingApprovals] Tab visible → silent refetch');
          void fetchAll({ silent: true });
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      socket.off('booking:approval-updated', handleApprovalQueueUpdate);
      socket.off('db_change', handleDbChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [fetchAll]);

  const pending = useMemo(
    () => sortPendingApprovalsFifo(allBookings.filter((b) => isPendingApprovalStatus(b.status))),
    [allBookings]
  );
  const visiblePending = useMemo(() => sortPendingApprovals(pending, pendingSort), [pending, pendingSort]);
  const approved = useMemo(() => allBookings.filter((b) => isApprovedApprovalStatus(b.status)), [allBookings]);
  const rejected = useMemo(() => allBookings.filter((b) => isRejectedApprovalStatus(b.status)), [allBookings]);

  const patchBookingDecision = useCallback((id: string, responseBooking: any, fallback: Record<string, unknown>) => {
    const normalizedResponse = responseBooking ? toApprovalListBooking(responseBooking) : null;
    setAllBookings((current) => current.map((booking) => {
      const bookingId = mongoOrderIdString(booking) || String(booking._id || booking.id || '');
      if (bookingId !== id) return booking;
      return normalizedResponse ? { ...booking, ...normalizedResponse } : { ...booking, ...fallback };
    }));
  }, []);

  const handleApprove = async (
    id: string,
    _name: string,
    total: number,
    verificationChecklist: Record<string, boolean>
  ): Promise<boolean> => {
    try {
      const data = await apiPatch(`/api/orders/${id}/approve`, { verificationChecklist });
      if (!data.success) {
        toast.error('Approval failed', { description: data.message });
        return false;
      }
      patchBookingDecision(id, data.data, { status: 'approved', approvedAt: new Date().toISOString() });
      const approvedAmount = Number(data.data?.downPaymentAmount) || DOWNPAYMENT;
      const balance = Math.max(0, total - approvedAmount);
      toast.success(`Reservation approved — ${formatMoney(approvedAmount)} recorded. ${formatMoney(balance)} remains due on arrival.`);
      return true;
    } catch {
      toast.error('Approval failed', { description: 'The request could not be completed. Please try again.' });
      return false;
    }
  };

  const handleReject = async (id: string, _name: string, reason: string): Promise<boolean> => {
    try {
      const data = await apiPatch(`/api/orders/${id}/reject`, { reason });
      if (!data.success) {
        toast.error('Rejection failed', { description: data.message });
        return false;
      }
      patchBookingDecision(id, data.data, {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
      });
      toast.success('Payment proof rejected successfully.');
      return true;
    } catch {
      toast.error('Rejection failed', { description: 'The request could not be completed. Please try again.' });
      return false;
    }
  };

  const closeForcedReview = useCallback(() => {
    forcedProofAbortRef.current?.abort();
    setForcedReview(null);
  }, []);

  useEffect(() => {
    const orderId = String(preloadOrderId || '').trim();
    if (!orderId) return;

    let cancelled = false;
    forcedProofAbortRef.current?.abort();
    forcedProofAbortRef.current = new AbortController();
    const signal = forcedProofAbortRef.current.signal;

    void (async () => {
      setTab('pending');

      let stub = allBookings.find((b) => mongoOrderIdString(b) === orderId);
      if (!stub) {
        try {
          const preview = await OrderService.getOrderApprovalPreview(orderId, { signal });
          if (signal.aborted || cancelled) return;
          if (preview.success && preview.data) {
            stub = toApprovalListBooking(preview.data);
          }
        } catch (e) {
          if (axios.isCancel(e) || signal.aborted || cancelled) return;
        }
      }

      if (!stub) {
        toast.error('Could not open GCash proof review for this booking');
        onPreloadConsumed?.();
        return;
      }

      setForcedReview({
        stub,
        detail: null,
        loading: true,
        error: '',
        acting: false,
      });

      try {
        const { merged, error } = await loadBookingWithProof(orderId, { signal });
        if (signal.aborted || cancelled) return;
        setForcedReview((fr) =>
          fr
            ? {
                ...fr,
                detail: merged || fr.stub,
                loading: false,
                error: error || '',
              }
            : null
        );
      } catch {
        if (signal.aborted || cancelled) return;
        setForcedReview((fr) =>
          fr ? { ...fr, loading: false, error: 'Failed to load booking proof.' } : null
        );
      } finally {
        onPreloadConsumed?.();
      }
    })();

    return () => {
      cancelled = true;
      forcedProofAbortRef.current?.abort();
    };
  }, [preloadOrderId, onPreloadConsumed]);

  const forcedModalBooking = forcedReview ? forcedReview.detail || forcedReview.stub : null;
  const forcedOrderId = forcedReview ? mongoOrderIdString(forcedModalBooking || forcedReview.stub) : '';
  const forcedCustomerName = forcedModalBooking?.customerName || 'Customer';

  const retryForcedProof = useCallback(() => {
    if (!forcedOrderId) return;
    forcedProofAbortRef.current?.abort();
    forcedProofAbortRef.current = new AbortController();
    const signal = forcedProofAbortRef.current.signal;
    setForcedReview((current) => current ? { ...current, loading: true, error: '' } : null);
    void loadBookingWithProof(forcedOrderId, { signal })
      .then(({ merged, error }) => {
        if (signal.aborted) return;
        setForcedReview((current) => current ? {
          ...current,
          detail: merged || current.detail || current.stub,
          loading: false,
          error: error || '',
        } : null);
      })
      .catch((requestError) => {
        if (axios.isCancel(requestError) || signal.aborted) return;
        setForcedReview((current) => current ? { ...current, loading: false, error: 'Failed to load booking proof.' } : null);
      });
  }, [forcedOrderId]);

  const TABS = [
    { key: 'pending', label: 'Pending', count: pending.length, pulse: true },
    { key: 'approved', label: 'Approved', count: approved.length },
    { key: 'rejected', label: 'Rejected', count: rejected.length },
  ] as const;

  return (
    <div className="booking-approvals-shell flex min-h-0 flex-col space-y-5 page-enter pb-6">
      {forcedReview && forcedModalBooking && (
        <ProofModal
          booking={forcedModalBooking}
          loading={forcedReview.loading}
          error={forcedReview.error}
          onRetry={retryForcedProof}
          onClose={closeForcedReview}
          onApprove={async (verificationChecklist) => {
            if (!forcedOrderId || forcedReview.acting) return false;
            setForcedReview((fr) => (fr ? { ...fr, acting: true } : null));
            const ok = await handleApprove(
              forcedOrderId,
              forcedCustomerName,
              getTotal(forcedModalBooking),
              verificationChecklist
            );
            if (ok) closeForcedReview();
            else setForcedReview((fr) => (fr ? { ...fr, acting: false } : null));
            return ok;
          }}
          onReject={async (reason) => {
            if (!forcedOrderId || forcedReview.acting) return false;
            setForcedReview((fr) => (fr ? { ...fr, acting: true } : null));
            const ok = await handleReject(forcedOrderId, forcedCustomerName, reason);
            if (ok) closeForcedReview();
            else setForcedReview((fr) => (fr ? { ...fr, acting: false } : null));
            return ok;
          }}
          acting={forcedReview.acting}
        />
      )}

      {/* Header */}
      <div className="booking-approvals-header shrink-0 overflow-hidden rounded-[28px] border-0 bg-white px-5 py-5 shadow-[0_4px_24px_-10px_rgba(15,23,42,0.08),0_18px_48px_-18px_rgba(15,23,42,0.09)] sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border-0 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm shadow-blue-600/15">
              <ShieldCheck size={13} />
              GCash Payment Command Center
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Booking Approvals</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Verify the GCash receipt, lock the reservation, and hand the remaining balance to onsite collection with a clean audit trail.
            </p>
          </div>
          <button
            onClick={() => { void fetchAll(); }}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border-0 bg-white px-4 text-xs font-black text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.05),0_10px_28px_-10px_rgba(15,23,42,0.1)] transition-all hover:-translate-y-0.5 hover:bg-blue-50/90 hover:text-blue-700 hover:shadow-[0_6px_20px_-8px_rgba(37,99,235,0.15)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <SalesStatCard
            title="Pending"
            metric={String(pending.length)}
            label="Awaiting payment proof review"
            icon={<Clock size={17} className="hidden text-amber-600 sm:block" />}
            accent={SALES_ACCENTS.amber}
            className="booking-approval-stat bg-amber-50/80 px-3 py-4 ring-amber-100/90 [&>div:nth-child(2)]:mb-3 sm:px-5 sm:py-5 sm:[&>div:nth-child(2)]:mb-5"
            metricClassName="text-amber-700"
            labelClassName="hidden text-amber-700/70 sm:block"
          />
          <SalesStatCard
            title="Approved"
            metric={String(approved.length)}
            label="Reservations cleared"
            icon={<TrendingUp size={17} className="hidden text-green-600 sm:block" />}
            accent={SALES_ACCENTS.green}
            className="booking-approval-stat bg-green-50/80 px-3 py-4 ring-green-100/90 [&>div:nth-child(2)]:mb-3 sm:px-5 sm:py-5 sm:[&>div:nth-child(2)]:mb-5"
            metricClassName="text-green-700"
            labelClassName="hidden text-green-700/70 sm:block"
          />
          <SalesStatCard
            title="Rejected"
            metric={String(rejected.length)}
            label="Proofs declined"
            icon={<XCircle size={17} className="hidden text-red-600 sm:block" />}
            accent={SALES_ACCENTS.red}
            className="booking-approval-stat bg-red-50/80 px-3 py-4 ring-red-100/90 [&>div:nth-child(2)]:mb-3 sm:px-5 sm:py-5 sm:[&>div:nth-child(2)]:mb-5"
            metricClassName="text-red-700"
            labelClassName="hidden text-red-700/70 sm:block"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="booking-approvals-tabs flex max-w-full shrink-0 gap-1.5 overflow-x-auto rounded-full bg-slate-100/70 p-1.5 shadow-[inset_0_1px_3px_rgba(15,23,42,0.05)] scrollbar-thin">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex h-10 min-w-[116px] items-center justify-center gap-2 rounded-full px-3 text-sm transition-all duration-200 sm:min-w-[150px] sm:px-4 ${
                active
                  ? 'bg-gray-900 text-white font-bold shadow-[0_10px_22px_rgba(15,23,42,0.15)]'
                  : 'text-slate-500 font-semibold hover:bg-white hover:text-slate-800'
              }`}
            >
              {t.label}
              <span className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] font-black text-center relative ${
                active
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {t.count}
                {(t as any).pulse && t.count > 0 && active && (
                  <span className="absolute inset-0 rounded-full bg-amber-500 opacity-40 animate-ping" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="booking-approvals-content rounded-[22px] border-0 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.06),0_16px_44px_-16px_rgba(15,23,42,0.09)]">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl bg-slate-50/70">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="text-sm font-semibold text-slate-500">Loading booking approvals…</p>
          </div>
        ) : loadError ? (
          <div className="booking-approvals-empty flex min-h-[320px] flex-col items-center justify-center rounded-[20px] bg-slate-50/75 px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><AlertTriangle size={26} /></div>
            <p className="text-lg font-black text-slate-900">Booking approvals could not be loaded</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{loadError}</p>
            <button type="button" onClick={() => { void fetchAll(); }} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black text-white">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : tab === 'pending' ? (
          pending.length === 0 ? (
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border-0 bg-slate-50/75 px-6 text-center shadow-inner">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.2)]">
                <CheckCircle2 size={30} strokeWidth={2.5} />
              </div>
              <p className="text-xl font-extrabold text-slate-900 mb-1">All caught up</p>
              <p className="max-w-md text-sm text-slate-500">No GCash payment proofs are waiting for confirmation right now.</p>
            </div>
          ) : (
            <div className="pb-2">
              {pending.length > 1 ? (
                <div className="mb-3 flex flex-col gap-2 rounded-2xl bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <Filter size={14} className="text-blue-600" />
                    {pending.length} reservations awaiting review
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    Sort by
                    <select value={pendingSort} onChange={(event) => setPendingSort(event.target.value as PendingSort)} className="h-9 rounded-xl bg-white px-3 pr-8 text-xs font-bold text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <option value="oldest">Oldest submitted</option>
                      <option value="newest">Newest submitted</option>
                      <option value="appointment">Appointment date</option>
                      <option value="amount">Payment amount</option>
                      <option value="method">Payment method</option>
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="flex flex-col gap-3">
                {visiblePending.map((b) => {
                  const bookingId = mongoOrderIdString(b) || String(b._id || b.id || '');
                  const queueIndex = pending.findIndex((queued) => (mongoOrderIdString(queued) || String(queued._id || queued.id || '')) === bookingId);
                  return (
                    <BookingCard key={b._id || b.id} booking={b} idx={Math.max(0, queueIndex)} onApprove={handleApprove} onReject={handleReject} />
                  );
                })}
              </div>
            </div>
          )
        ) : tab === 'approved' ? (
          approved.length === 0 ? (
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border-0 bg-slate-50/75 px-6 text-center shadow-inner">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-[0_4px_16px_-6px_rgba(15,23,42,0.1)]">
                <CheckCircle2 size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No approved bookings yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
              {approved.map(b => <HistoryRow key={b._id || b.id} b={b} type="approved" />)}
            </div>
          )
        ) : (
          rejected.length === 0 ? (
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border-0 bg-slate-50/75 px-6 text-center shadow-inner">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-[0_4px_16px_-6px_rgba(15,23,42,0.1)]">
                <XCircle size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No rejected bookings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
              {rejected.map(b => <HistoryRow key={b._id || b.id} b={b} type="rejected" />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
