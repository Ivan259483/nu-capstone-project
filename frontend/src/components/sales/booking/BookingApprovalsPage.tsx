import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Calendar,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Hash,
  Image as ImageIcon,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { normalizeBooking } from '@/lib/order-service';
import { isEncryptedPlateToken } from '@/lib/salesData';
import { isLikelyInternalVehiclePlate } from '@/lib/vehicle-display';

const DOWNPAYMENT = 500;
const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

function getToken() {
  return (
    localStorage.getItem('autospf_token') ||
    sessionStorage.getItem('autospf_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  );
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

// ─── Status badge ───────────────────────────────────────────────────────────
function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1.5 shadow-sm shadow-amber-100/60">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
      </span>
      <span className="text-[10px] font-black text-amber-700 uppercase tracking-[0.16em]">Payment Review</span>
    </span>
  );
}

// ─── Payment breakdown ───────────────────────────────────────────────────────
function PayBreakdown({ total }: { total: number }) {
  const balance = Math.max(0, total - DOWNPAYMENT);
  return (
    <div className="booking-payment-ledger overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <WalletCards size={16} strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Payment Ledger</p>
            <p className="text-xs font-bold text-slate-800">GCash reservation fee</p>
          </div>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 ring-1 ring-blue-100">
          GCash
        </span>
      </div>

      <div className="space-y-2.5 px-4 py-3.5 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-slate-500">Service total</span>
          <span className="font-black tabular-nums text-slate-950">{formatMoney(total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold text-emerald-700">Paid now</span>
          <span className="font-black tabular-nums text-emerald-600">− {formatMoney(DOWNPAYMENT)}</span>
        </div>
        <div className="h-px bg-slate-100" />
        <div className="flex items-center justify-between gap-4 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-100">
          <span className="font-black text-rose-700">Balance on arrival</span>
          <span className="font-black tabular-nums text-rose-700">{formatMoney(balance)}</span>
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div className="booking-approval-detail rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/30">
      <div className="mb-1.5 flex items-center gap-1.5">
        {Icon ? <Icon size={12} strokeWidth={2.4} className="text-slate-400" /> : null}
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      </div>
      <div className="min-w-0 truncate text-sm font-black text-slate-800">{value}</div>
    </div>
  );
}

function ProofPreview({
  proofUrl,
  onOpen,
  compact = false,
  interactive = true,
}: {
  proofUrl: string;
  onOpen?: () => void;
  compact?: boolean;
  interactive?: boolean;
}) {
  if (!proofUrl) {
    return (
      <div className={`${compact ? 'h-[220px]' : 'h-[360px]'} flex flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-slate-200 bg-slate-50/80 text-slate-400`}>
        <ImageIcon size={32} className="mb-2 opacity-50" />
        <span className="text-xs font-black uppercase tracking-[0.16em]">No proof uploaded</span>
      </div>
    );
  }

  const frameClass = `${compact ? 'h-[240px]' : 'h-[calc(100vh-220px)] max-h-[680px] min-h-[420px]'} group/proof relative w-full overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950 text-left shadow-[0_24px_60px_rgba(15,23,42,0.18)] transition-all duration-300 ${
    interactive ? 'hover:-translate-y-0.5 hover:shadow-[0_30px_80px_rgba(15,23,42,0.24)]' : 'cursor-default'
  }`;

  const content = (
    <>
      <img src={proofUrl} alt="GCash proof" className="h-full w-full object-contain bg-slate-950" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white ring-1 ring-white/15 backdrop-blur-md">
          <Smartphone size={12} />
          GCash proof
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-800 shadow-sm">
          {interactive ? <Eye size={12} /> : <ImageIcon size={12} />}
          {interactive ? 'Open' : 'Full proof'}
        </span>
      </div>
      {interactive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-4 py-4 opacity-0 transition-opacity duration-300 group-hover/proof:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur-md">
            <Search size={13} />
            Click to inspect receipt
          </span>
        </div>
      )}
    </>
  );

  if (!interactive) {
    return <div className={frameClass}>{content}</div>;
  }

  return (
    <button type="button" onClick={onOpen} className={frameClass}>
      {content}
    </button>
  );
}

// ─── GCash Proof Modal ───────────────────────────────────────────────────────
function ProofModal({ booking, onClose, onApprove, onReject, acting }: {
  booking: any; onClose: () => void;
  onApprove: () => void; onReject: () => void; acting: boolean;
}) {
  const total = getTotal(booking);
  const balance = Math.max(0, total - DOWNPAYMENT);
  const proofUrl = getProofUrl(booking);
  const ref = booking.bookingReference || booking.orderNumber || (booking._id || booking.id || '').slice(-8) || '—';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative grid max-h-[92vh] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[28px] bg-white shadow-[0_34px_100px_rgba(15,23,42,0.34)] animate-in fade-in zoom-in-95 duration-200 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-h-0 bg-slate-950 p-3 sm:p-4">
          <ProofPreview proofUrl={proofUrl} interactive={false} />
        </div>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 ring-1 ring-blue-100">
                <ShieldCheck size={12} />
                Payment verification
              </span>
              <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">GCash proof review</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Reference #{ref}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Close proof modal"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-4 grid grid-cols-2 gap-3">
              <DetailTile label="Customer" value={booking.customerName || '—'} icon={UserRound} />
              <DetailTile label="Phone" value={booking.customerPhone || '—'} icon={Phone} />
              <DetailTile label="Vehicle" value={getVehicleLabel(booking)} icon={Car} />
              <DetailTile label="Plate" value={formatPlate(booking.vehiclePlate)} icon={Hash} />
              <DetailTile label="Service" value={booking.serviceType || booking.serviceName || '—'} icon={ClipboardCheck} />
              <DetailTile label="Schedule" value={getScheduleLabel(booking)} icon={Calendar} />
            </div>

            <PayBreakdown total={total} />

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
              <div className="mb-2 flex items-center gap-2 font-black">
                <AlertTriangle size={16} className="text-amber-600" />
                Before approving
              </div>
              Confirm the receipt amount, timestamp, and sender details match this reservation. Approving enables live tracking for the customer and leaves <strong>{formatMoney(balance)}</strong> for onsite collection.
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/80 p-5">
            <button
              onClick={onApprove}
              disabled={acting}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {acting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Processing approval…
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} strokeWidth={2.6} />
                  Approve reservation
                </>
              )}
            </button>
            <button
              onClick={onReject}
              disabled={acting}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={17} strokeWidth={2.5} />
              Reject proof
            </button>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

// ─── Single booking card ─────────────────────────────────────────────────────
function BookingCard({ booking, onApprove, onReject, idx }: {
  booking: any; idx: number;
  onApprove: (id: string, name: string) => Promise<void>;
  onReject: (id: string, name: string, reason: string) => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const id = booking._id || booking.id;
  const total = getTotal(booking);
  const balance = Math.max(0, total - DOWNPAYMENT);
  const proofUrl = getProofUrl(booking);
  const ref = booking.bookingReference || booking.orderNumber || id?.slice(-8) || '—';
  const customerName = booking.customerName || 'Customer';
  const serviceLabel = booking.serviceType || booking.serviceName || '—';

  const doApprove = async () => {
    setActing(true);
    await onApprove(id, customerName);
    setLeaving(true);
    setActing(false);
    setShowModal(false);
  };

  const doReject = async () => {
    setActing(true);
    await onReject(id, customerName, reason || 'Payment proof could not be verified.');
    setLeaving(true);
    setActing(false);
    setShowModal(false);
  };

  return (
    <>
      {showModal && (
        <ProofModal booking={booking} onClose={() => setShowModal(false)}
          onApprove={doApprove} onReject={() => { setShowModal(false); setRejectMode(true); }} acting={acting} />
      )}
      <div
        className={`booking-approval-card overflow-hidden rounded-[28px] border border-slate-200 bg-white transition-all duration-300 relative group
          ${leaving ? 'opacity-0 translate-x-12 scale-95 pointer-events-none' : 'opacity-100 translate-x-0 scale-100'}
        `}
        style={{ animationDelay: `${idx * 0.05}s` }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-blue-500 to-emerald-500" />

        <div className="p-4 sm:p-5 lg:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15 ring-4 ring-slate-100">
                <span className="text-lg font-black uppercase tracking-tight">{getInitials(customerName)}</span>
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white">
                  <Smartphone size={11} strokeWidth={3} />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-black tracking-tight text-slate-950">{customerName}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Queue {idx + 1}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} className="opacity-70" />
                    {booking.createdAt ? new Date(booking.createdAt).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                  </span>
                  <span className="text-slate-300">/</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 font-mono text-slate-600 ring-1 ring-slate-200">
                    <Hash size={11} />
                    {ref}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PendingBadge />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                <ReceiptText size={12} />
                Proof attached
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                <DetailTile label="Plate" value={formatPlate(booking.vehiclePlate)} icon={Car} />
                <DetailTile label="Vehicle" value={getVehicleLabel(booking)} icon={Car} />
                <DetailTile label="Service" value={serviceLabel} icon={ClipboardCheck} />
                <DetailTile label="Date" value={booking.bookingDate || booking.date || '—'} icon={Calendar} />
                <DetailTile label="Time" value={booking.bookingTime || booking.time || '—'} icon={Clock} />
                <DetailTile label="Phone" value={booking.customerPhone || '—'} icon={Phone} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(280px,1fr)]">
                <PayBreakdown total={total} />

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <BadgeCheck size={17} className="text-blue-600" />
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Review checklist</p>
                  </div>
                  <div className="grid gap-2 text-xs font-semibold text-slate-600">
                    <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Confirm amount paid: {formatMoney(DOWNPAYMENT)}</div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Check customer name or GCash sender match</div>
                    <div className="flex items-center gap-2"><Banknote size={14} className="text-rose-500" /> Collect balance: {formatMoney(balance)}</div>
                  </div>
                </div>
              </div>

              {!rejectMode ? (
                <div className="booking-approval-action-bar flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 active:scale-[0.99]"
                  >
                    <CheckCircle2 size={18} strokeWidth={2.6} />
                    Approve reservation
                  </button>
                  <button
                    onClick={() => setRejectMode(true)}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 text-sm font-black text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-[0.99]"
                  >
                    <XCircle size={17} strokeWidth={2.5} />
                    Reject
                  </button>
                </div>
              ) : (
                <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-rose-700">
                    <AlertTriangle size={15} />
                    Reason for rejection
                  </div>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    placeholder="Example: screenshot is unclear, amount does not match, or sender reference cannot be verified."
                    className="mb-3 w-full resize-none rounded-2xl border border-rose-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm transition-all placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-500/10"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={doReject}
                      disabled={acting}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-sm shadow-rose-600/20 transition-all hover:bg-rose-700 disabled:opacity-70"
                    >
                      {acting ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <XCircle size={16} strokeWidth={2.5} />
                      )}
                      {acting ? 'Rejecting…' : 'Confirm rejection'}
                    </button>
                    <button
                      onClick={() => setRejectMode(false)}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition-all hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="booking-proof-rail rounded-[26px] border border-slate-200 bg-slate-50/70 p-3 shadow-inner shadow-slate-200/40">
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">GCash proof</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-700">Receipt screenshot</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 ring-1 ring-slate-200">
                  Tap to zoom
                </span>
              </div>
              <ProofPreview proofUrl={proofUrl} onOpen={() => setShowModal(true)} compact />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Approved / Rejected history row ────────────────────────────────────────
function HistoryRow({ b, type }: { b: any; type: 'approved' | 'rejected' }) {
  const total = getTotal(b);
  const isApproved = type === 'approved';

  return (
    <div className="booking-approval-history-row bg-white rounded-[18px] border border-slate-100 p-4 flex items-center gap-4 hover:-translate-y-0.5 transition-all duration-200 group">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ${
        isApproved
          ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/20'
          : 'bg-red-50 text-red-600 ring-red-600/20'
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

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BookingApprovalsPage() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { OrderService } = await import('@/lib/order-service');
      const res = await OrderService.getAllOrders({ suppressErrorToast: true });
      if (res.success && Array.isArray(res.data)) {
        setAllBookings(res.data.filter((o: any) =>
          ['pending_confirmation', 'approved', 'rejected'].includes(o.status)
        ));
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const APPROVAL_STATUSES = ['pending_confirmation', 'approved', 'rejected'];

  useEffect(() => {
    fetchAll();

    // ── 60s backup polling — true last-resort if socket is silent ────────
    const interval = setInterval(() => {
      import('@/lib/order-service').then(({ OrderService }) =>
        OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
          if (res.success && Array.isArray(res.data)) {
            setAllBookings(res.data.filter((o: any) =>
              APPROVAL_STATUSES.includes(o.status)
            ));
          }
        })
      ).catch(() => {});
    }, 60_000);

    // ── Shared socket: instant state patch from fullDocument ──────────────
    // No HTTP call — we use the document already embedded in the socket event.
    const socket = getSharedSocket();
    const handleDbChange = (payload: any) => {
      if (payload.collection !== 'orders') return;

      const { operationType, documentKey, fullDocument } = payload;

      // Fallback to HTTP only if fullDocument is absent
      if (!fullDocument && operationType !== 'delete') {
        console.warn('[BookingApprovals] db_change missing fullDocument — fallback HTTP fetch');
        import('@/lib/order-service').then(({ OrderService }) =>
          OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
            if (res.success && Array.isArray(res.data)) {
              setAllBookings(res.data.filter((o: any) => APPROVAL_STATUSES.includes(o.status)));
            }
          })
        ).catch(() => {});
        return;
      }

      const docId = String(fullDocument?._id || documentKey?._id || '');

      if (operationType === 'delete') {
        setAllBookings(prev => prev.filter(b => String(b._id || b.id) !== docId));
        console.log('[BookingApprovals] db_change delete → removed', docId);
        return;
      }

      const normalized = normalizeBooking(fullDocument);
      const inScope = APPROVAL_STATUSES.includes(normalized.status ?? '');

      setAllBookings(prev => {
        const existsAt = prev.findIndex(b => String(b._id || b.id) === docId);
        if (!inScope) {
          // Status moved out of approval scope (e.g. confirmed) — remove it
          return existsAt >= 0 ? prev.filter((_, i) => i !== existsAt) : prev;
        }
        if (existsAt >= 0) {
          // Update existing
          const next = [...prev];
          next[existsAt] = { ...normalized, _id: fullDocument._id };
          return next;
        }
        // New document in scope — prepend
        return [{ ...normalized, _id: fullDocument._id }, ...prev];
      });
      console.log('[BookingApprovals] db_change', operationType, '→ patched', docId);
    };
    socket.on('db_change', handleDbChange);

    // ── Tab visibility / focus refresh ───────────────────────────────────
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(() => {
          console.log('[BookingApprovals] Tab visible → silent refetch');
          import('@/lib/order-service').then(({ OrderService }) =>
            OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
              if (res.success && Array.isArray(res.data)) {
                setAllBookings(res.data.filter((o: any) =>
                  ['pending_confirmation', 'approved', 'rejected'].includes(o.status)
                ));
              }
            })
          ).catch(() => {});
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      socket.off('db_change', handleDbChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [fetchAll]);

  const pending = allBookings.filter(b => b.status === 'pending_confirmation');
  const approved = allBookings.filter(b => b.status === 'approved');
  const rejected = allBookings.filter(b => b.status === 'rejected');

  const handleApprove = async (id: string, name: string) => {
    const data = await apiPatch(`/api/orders/${id}/approve`);
    if (data.success) {
      toast.success(`${name} — reservation APPROVED. Live tracking enabled.`);
      await fetchAll();
    } else {
      toast.error('Approval failed', { description: data.message });
    }
  };

  const handleReject = async (id: string, name: string, reason: string) => {
    const data = await apiPatch(`/api/orders/${id}/reject`, { reason });
    if (data.success) {
      toast.error(`${name} — booking REJECTED.`);
      await fetchAll();
    } else {
      toast.error('Rejection failed', { description: data.message });
    }
  };

  const TABS = [
    { key: 'pending', label: 'Pending', count: pending.length, pulse: true },
    { key: 'approved', label: 'Approved', count: approved.length },
    { key: 'rejected', label: 'Rejected', count: rejected.length },
  ] as const;

  return (
    <div className="booking-approvals-shell flex min-h-0 flex-col space-y-5 page-enter pb-6">
      {/* Header */}
      <div className="booking-approvals-header shrink-0 overflow-hidden rounded-[28px] border bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-blue-700">
              <ShieldCheck size={13} />
              GCash Payment Command Center
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Booking Approvals</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Verify the GCash receipt, lock the reservation, and hand the remaining balance to onsite collection with a clean audit trail.
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 shadow-sm shadow-slate-200/50 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="booking-approval-stat rounded-2xl border bg-amber-50/90 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700">Pending Review</span>
              <Clock size={16} className="text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-700 tabular-nums">{pending.length}</p>
          </div>
          <div className="booking-approval-stat rounded-2xl border bg-emerald-50/90 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700">Approved</span>
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-700 tabular-nums">{approved.length}</p>
          </div>
          <div className="booking-approval-stat rounded-2xl border bg-rose-50/90 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700">Rejected</span>
              <XCircle size={16} className="text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-rose-700 tabular-nums">{rejected.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="booking-approvals-tabs flex max-w-full shrink-0 gap-2 overflow-x-auto rounded-[18px] border bg-white p-1.5 scrollbar-thin">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex h-11 min-w-[150px] items-center justify-center gap-2 rounded-xl px-4 text-sm transition-all duration-200 ${
                active
                  ? 'bg-slate-950 text-white font-bold shadow-[0_10px_22px_rgba(15,23,42,0.15)]'
                  : 'text-slate-500 font-semibold hover:text-slate-800 hover:bg-slate-50'
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
      <div className="booking-approvals-content rounded-[22px] border bg-white p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-2xl bg-slate-50/70">
            <div className="w-10 h-10 border-4 border-amber-100 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-400">Loading bookings…</p>
          </div>
        ) : tab === 'pending' ? (
          pending.length === 0 ? (
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border bg-slate-50/70 px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm shadow-slate-200/60 ring-1 ring-emerald-100">
                <CheckCircle2 size={30} strokeWidth={2.5} />
              </div>
              <p className="text-xl font-extrabold text-slate-900 mb-1">All caught up</p>
              <p className="max-w-md text-sm text-slate-500">No GCash payment proofs are waiting for confirmation right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-6">
              {pending.map((b, i) => (
                <BookingCard key={b._id || b.id} booking={b} idx={i}
                  onApprove={handleApprove} onReject={handleReject} />
              ))}
            </div>
          )
        ) : tab === 'approved' ? (
          approved.length === 0 ? (
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border bg-slate-50/70 px-6 text-center">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 ring-1 ring-slate-200 shadow-sm">
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
            <div className="booking-approvals-empty flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border bg-slate-50/70 px-6 text-center">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 ring-1 ring-slate-200 shadow-sm">
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
