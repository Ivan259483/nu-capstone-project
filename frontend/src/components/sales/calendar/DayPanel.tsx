/**
 * DayPanel.tsx
 * Slide-in right panel showing all bookings for a clicked date.
 * Approve / Reject actions are ONLY available here (not on calendar cells).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  X, Clock, Car, CheckCircle, XCircle, Loader2,
  Calendar, AlertCircle, Package, Banknote, GripVertical,
} from 'lucide-react';
import {
  approveBooking,
  createAvailabilityClosure,
  deleteAvailabilityClosure,
  fetchAvailabilityClosures,
  rejectBooking,
  type AvailabilityClosure,
} from './calendarService';
import { invalidateDateCache } from './useBookingsByDate';
import { syncAvailabilityCaches } from '@/lib/availabilitySync';
import type { CalendarBooking } from './calendarTypes';
import { EXCLUDED_STATUSES } from './calendarTypes';
import type { DayMapEntry } from './useCalendarSlots';
import DraggableBooking from './DraggableBooking';

const CALENDAR_BLOCK_NOTE = 'Blocked from appointments calendar';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  pending: { label: 'Pending', dot: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
  pending_confirmation: { label: 'Pending Review', dot: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
  confirmed:            { label: 'Confirmed',       dot: '#3b82f6', bg: '#eff6ff', text: '#1e40af' },
  approved:             { label: 'Approved',        dot: '#10b981', bg: '#ecfdf5', text: '#065f46' },
  assigned:             { label: 'Assigned',        dot: '#8b5cf6', bg: '#f5f3ff', text: '#4c1d95' },
  received:             { label: 'Received',        dot: '#14b8a6', bg: '#f0fdfa', text: '#134e4a' },
  in_progress:          { label: 'In Progress',     dot: '#f97316', bg: '#fff7ed', text: '#9a3412' },
  'in-progress':        { label: 'In Progress',     dot: '#f97316', bg: '#fff7ed', text: '#9a3412' },
  completed:            { label: 'Completed',       dot: '#22c55e', bg: '#f0fdf4', text: '#14532d' },
  paid:                 { label: 'Paid',            dot: '#059669', bg: '#ecfdf5', text: '#065f46' },
  released:             { label: 'Released',        dot: '#0891b2', bg: '#ecfeff', text: '#155e75' },
  cancelled:            { label: 'Cancelled',       dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280' },
  rejected:             { label: 'Rejected',        dot: '#ef4444', bg: '#fef2f2', text: '#7f1d1d' },
  queued:               { label: 'Queued',          dot: '#6366f1', bg: '#eef2ff', text: '#3730a3' },
  processing:           { label: 'Processing',      dot: '#f97316', bg: '#fff7ed', text: '#9a3412' },
};

function getMeta(status: string) {
  return STATUS_META[status] ?? { label: status, dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280' };
}

// ── Booking Card ──────────────────────────────────────────────────────────────
function BookingCard({
  booking, onActionComplete,
}: {
  booking: CalendarBooking;
  onActionComplete: (id: string) => void;
}) {
  const [actioning, setActioning] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const id = booking._id || booking.id!;
  const meta = getMeta(booking.status);
  const isPending = booking.status === 'pending_confirmation';

  const handleApprove = async () => {
    setActioning(true);
    try {
      const data = await approveBooking(id);
      if (data.success) {
        toast.success('Booking approved ✅', { description: 'Customer has been notified.' });
        invalidateDateCache(booking.bookingDate || '');
        onActionComplete(id);
      } else {
        const msg = data.message || 'Approval failed';
        if (msg.toLowerCase().includes('slot')) {
          toast.error('Slot is no longer available', {
            description: 'Another booking already occupies this time slot.',
          });
        } else {
          toast.error('Approval failed', { description: msg });
        }
      }
    } catch {
      toast.error('Network error — could not approve booking');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    setActioning(true);
    try {
      const data = await rejectBooking(id, rejectReason);
      if (data.success) {
        toast.success('Booking rejected', { description: 'Customer has been notified.' });
        invalidateDateCache(booking.bookingDate || '');
        setRejectMode(false);
        setRejectReason('');
        onActionComplete(id);
      } else {
        toast.error('Reject failed', { description: data.message });
      }
    } catch {
      toast.error('Network error — could not reject booking');
    } finally {
      setActioning(false);
    }
  };

  const refShort =
    booking.bookingReference && booking.bookingReference.length > 18
      ? `${booking.bookingReference.slice(0, 10)}…${booking.bookingReference.slice(-4)}`
      : booking.bookingReference;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_32px_-14px_rgba(15,23,42,0.12),0_0_0_1px_rgba(226,232,240,0.45)]">
      {/* Header strip */}
      <div className="bg-gradient-to-br from-slate-50/90 to-white px-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md"
            style={{ background: `linear-gradient(145deg, ${meta.dot}, ${meta.dot}cc)` }}
          >
            {(booking.customerName || 'C').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-slate-900">{booking.customerName}</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  boxShadow: `0 1px 6px -3px rgba(15,23,42,0.08), 0 0 0 1px ${meta.dot}38`,
                  background: meta.bg,
                  color: meta.text,
                }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.dot }} />
                {meta.label}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-slate-600">
              {booking.bookingTime && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-400" strokeWidth={2.5} />
                  {booking.bookingTime}
                </span>
              )}
              {booking.vehiclePlate && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                  <Car size={13} className="text-slate-400" strokeWidth={2.5} />
                  {booking.vehiclePlate}
                </span>
              )}
            </div>
            {booking.bookingReference && (
              <p
                className="mt-2 font-mono text-[10px] font-medium tracking-wide text-slate-400"
                title={`#${booking.bookingReference}`}
              >
                Ref · #{refShort}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-3 px-4 py-4">
        <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-blue-50/50 via-slate-50/40 to-white p-3.5 shadow-[0_2px_12px_-6px_rgba(37,99,235,0.08)] ring-1 ring-blue-100/40">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-blue-100/60">
            <Package size={16} className="text-blue-600" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Service</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
              {booking.serviceName || booking.serviceType || '—'}
            </p>
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-slate-50/90 to-emerald-50/25 p-3.5 shadow-[0_2px_12px_-6px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/35">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-emerald-100/70">
            <Banknote size={16} className="text-emerald-600" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Total</p>
            <p className="mt-0.5 text-lg font-black tabular-nums tracking-tight text-slate-900">
              ₱{Number(booking.totalPrice || booking.totalAmount || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {(booking.vehicleMake || booking.vehicleModel) && (
          <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-slate-50/90 to-sky-50/30 p-3.5 shadow-[0_2px_12px_-6px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/35">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-sky-100/70">
              <Car size={16} className="text-blue-600" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Vehicle</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {[booking.vehicleMake, booking.vehicleModel, booking.vehicleType].filter(Boolean).join(' ')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Payment proof image */}
      {isPending && booking.paymentProofUrl && (
        <div className="border-t border-slate-100/60 px-4 pb-4 pt-3">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">GCash Proof</p>
          <img
            src={booking.paymentProofUrl}
            alt="Payment proof"
            className="h-32 w-full cursor-zoom-in rounded-xl object-cover shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/40 transition-opacity hover:opacity-90"
            onClick={() => window.open(booking.paymentProofUrl, '_blank')}
          />
        </div>
      )}
      {isPending && !booking.paymentProofUrl && Boolean(booking.hasPaymentProof) && (
        <div className="border-t border-slate-100/60 px-4 pb-4 pt-3">
          <div className="flex items-center gap-2 rounded-xl bg-blue-50/90 px-3 py-2.5 shadow-[0_1px_8px_-4px_rgba(59,130,246,0.15)] ring-1 ring-blue-200/40">
            <AlertCircle size={12} className="flex-shrink-0 text-blue-600" />
            <span className="text-[11px] font-medium text-blue-800">Payment proof is available in Booking Approvals</span>
          </div>
        </div>
      )}
      {isPending && !booking.paymentProofUrl && !booking.hasPaymentProof && (
        <div className="border-t border-slate-100/60 px-4 pb-4 pt-3">
          <div className="flex items-center gap-2 rounded-xl bg-amber-50/90 px-3 py-2.5 shadow-[0_1px_8px_-4px_rgba(245,158,11,0.15)] ring-1 ring-amber-200/40">
            <AlertCircle size={12} className="flex-shrink-0 text-amber-600" />
            <span className="text-[11px] font-medium text-amber-800">No payment proof uploaded yet</span>
          </div>
        </div>
      )}

      {/* Action buttons — ONLY for pending_confirmation */}
      {isPending && (
        <div className="border-t border-slate-100/60 px-4 pb-4 pt-2">
          {rejectMode ? (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                rows={2}
                className="w-full resize-none rounded-xl border-0 bg-red-50/80 px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(252,165,165,0.5)] focus:outline-none focus:ring-2 focus:ring-red-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectMode(false); setRejectReason(''); }}
                  disabled={actioning}
                  className="flex-1 rounded-xl border-0 bg-white py-2 text-xs font-semibold text-slate-600 shadow-[0_0_0_1px_rgba(226,232,240,0.9)] transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actioning}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-colors"
                  style={{ background: actioning ? '#fca5a5' : '#ef4444' }}>
                  {actioning
                    ? <Loader2 size={12} className="animate-spin" />
                    : <XCircle size={12} />}
                  Confirm Reject
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setRejectMode(true)}
                disabled={actioning}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border-0 bg-white py-2 text-xs font-semibold text-red-600 shadow-[0_0_0_1px_rgba(254,202,202,0.9)] transition-colors hover:bg-red-50"
              >
                <XCircle size={12} /> Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={actioning}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-colors shadow-[0_2px_10px_-4px_rgba(16,185,129,0.4)]"
                style={{ background: actioning ? '#6ee7b7' : '#10b981' }}>
                {actioning
                  ? <Loader2 size={12} className="animate-spin" />
                  : <CheckCircle size={12} />}
                Approve
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Day Panel ─────────────────────────────────────────────────────────────────
interface DayPanelProps {
  date: Date;
  bookings: CalendarBooking[];
  loading: boolean;
  dayInfo?: DayMapEntry;
  onClose: () => void;
  onRefresh: () => void;
}

export default function DayPanel({ date, bookings, loading, dayInfo, onClose, onRefresh }: DayPanelProps) {
  const dateIso = date.toLocaleDateString('en-CA');
  const label = date.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const [closures, setClosures] = useState<AvailabilityClosure[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closureActioning, setClosureActioning] = useState(false);

  const active = bookings.filter(b => !EXCLUDED_STATUSES.has(b.status));
  const excluded = bookings.filter(b => EXCLUDED_STATUSES.has(b.status));
  const selectedClosures = closures.filter((closure) => {
    const from = new Date(closure.fromDate).toLocaleDateString('en-CA');
    const to = new Date(closure.toDate).toLocaleDateString('en-CA');
    return from <= dateIso && to >= dateIso;
  });
  const isBlocked = selectedClosures.length > 0;
  const isClosedOnCalendar = dayInfo?.isClosed ?? false;
  const closedReason = dayInfo?.closedReason ?? null;
  const isWeeklyDayOff = closedReason === 'recurring';
  const isEmergencyClosed = closedReason === 'emergency';
  const closedLabel = dayInfo?.closureLabel
    || (isWeeklyDayOff ? 'Weekly day off (Sat/Sun or schedule in Availability Controls)' : null)
    || (isEmergencyClosed ? 'Emergency closure is on for today' : null);

  const handleActionComplete = (_id: string) => {
    onRefresh();
  };

  const loadClosures = useCallback(async () => {
    setClosuresLoading(true);
    try {
      const rows = await fetchAvailabilityClosures();
      setClosures(rows);
    } catch (error) {
      toast.error('Could not load blocked dates', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setClosuresLoading(false);
    }
  }, []);

  const handleBlockDate = async () => {
    const confirmed = window.confirm(
      `Block ${label} for new customer bookings?\n\nThis adds a scheduled closure (same as Availability Controls). Existing bookings stay on the calendar. Use Unblock date to reopen.`,
    );
    if (!confirmed) return;

    setClosureActioning(true);
    try {
      await createAvailabilityClosure(dateIso, CALENDAR_BLOCK_NOTE);
      toast.success('Date blocked', { description: `${label} is no longer available for bookings.` });
      await loadClosures();
      onRefresh();
    } catch (error) {
      toast.error('Could not block date', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setClosureActioning(false);
    }
  };

  const handleUnblockDate = async () => {
    if (!selectedClosures.length) return;
    setClosureActioning(true);
    try {
      await Promise.all(selectedClosures.map((closure) => deleteAvailabilityClosure(closure._id)));
      toast.success('Date unblocked', { description: `${label} is available again.` });
      await loadClosures();
      syncAvailabilityCaches();
      onRefresh();
    } catch (error) {
      toast.error('Could not unblock date', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setClosureActioning(false);
    }
  };

  /** Lock scroll while drawer is open (portal renders above Admin Hub). */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    loadClosures();
  }, [loadClosures, dateIso]);

  /** Portal → document.body so `position:fixed` is viewport-relative (Admin Hub `.ah-page-enter` uses transform and traps fixed descendants). */
  const drawer = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] cursor-default border-0 bg-slate-900/[0.035] backdrop-blur-[2px] transition-colors hover:bg-slate-900/[0.055]"
        aria-label="Close day details"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 z-[220] flex h-[100dvh] w-[min(100vw,420px)] flex-col overflow-hidden bg-white shadow-[-20px_0_48px_-12px_rgba(15,23,42,0.14),-8px_0_24px_-8px_rgba(15,23,42,0.06)] sm:rounded-l-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-panel-title"
      >

        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-4 bg-white px-5 py-5 shadow-[0_1px_0_0_rgba(226,232,240,0.65)]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Selected date</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-[0_0_0_1px_rgba(191,219,254,0.7)]">
                <Calendar size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 id="day-panel-title" className="text-base font-bold leading-tight tracking-tight text-slate-900">
                  {label}
                </h3>
                <p className="mt-1 text-[13px] font-medium text-slate-500">
                  {loading ? 'Loading…' : `${active.length} active booking${active.length !== 1 ? 's' : ''}`}
                  {excluded.length > 0 && ` · ${excluded.length} excluded`}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative z-[221] flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 ring-1 ring-slate-200/80 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-shrink-0 px-4 py-3 shadow-[0_1px_0_0_rgba(226,232,240,0.7)]">
          <div className={`flex flex-col gap-2 rounded-2xl px-3.5 py-3 shadow-sm ${
            isClosedOnCalendar || isBlocked
              ? 'bg-orange-50 text-orange-950 ring-1 ring-orange-200/80'
              : 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/80'
          }`}>
            <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Booking availability
              </p>
              <p className="mt-0.5 text-sm font-bold leading-snug">
                {closuresLoading
                  ? 'Checking status…'
                  : isClosedOnCalendar
                    ? 'Closed on calendar'
                    : 'Open for customer bookings'}
              </p>
              {isClosedOnCalendar && closedLabel && (
                <p className="mt-1 text-[11px] font-medium leading-snug opacity-90">{closedLabel}</p>
              )}
              {isWeeklyDayOff && (
                <p className="mt-1 text-[11px] font-medium leading-snug opacity-80">
                  Change weekly hours under Appointments → Availability Controls.
                </p>
              )}
            </div>
            {!isWeeklyDayOff && !isEmergencyClosed && (
              <button
                type="button"
                onClick={isBlocked ? handleUnblockDate : handleBlockDate}
                disabled={closuresLoading || closureActioning}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isBlocked
                    ? 'bg-white text-orange-700 hover:bg-orange-100'
                    : 'bg-white text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {closureActioning
                  ? 'Saving…'
                  : isBlocked
                    ? 'Unblock date'
                    : 'Block date'}
              </button>
            )}
            </div>
          </div>
        </div>

        {!loading && active.length > 0 && (
          <div className="flex-shrink-0 px-4 pb-3 pt-0 shadow-[0_1px_0_0_rgba(226,232,240,0.7)]">
            <div className="flex items-start gap-2 rounded-xl bg-blue-50/90 px-3 py-2.5 text-[11px] leading-snug text-blue-950 shadow-[0_6px_22px_-12px_rgba(37,99,235,0.22)]">
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>
                <span className="font-semibold">Reschedule:</span> drag a booking card onto another date in the calendar, then pick a time in the dialog.
              </span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50/90 to-slate-50/40 p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="animate-spin text-blue-500" />
              <p className="text-sm text-slate-500">Loading bookings…</p>
            </div>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Calendar size={20} className="text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">No active bookings</p>
                <p className="text-xs text-slate-400 mt-1">
                  {excluded.length > 0
                    ? `${excluded.length} booking(s) were cancelled or rejected`
                    : 'Nothing scheduled for this day'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {active.map(b => (
                <DraggableBooking key={b._id || b.id} booking={b}>
                  <BookingCard
                    booking={b}
                    onActionComplete={handleActionComplete}
                  />
                </DraggableBooking>
              ))}
              {excluded.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1 mb-2">
                    Cancelled / Rejected
                  </p>
                  {excluded.map(b => {
                    const meta = getMeta(b.status);
                    return (
                      <div key={b._id || b.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.1)]"
                        style={{ background: '#f8fafc' }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
                        <span className="text-xs text-slate-600 flex-1 truncate">{b.customerName}</span>
                        <span className="text-[10px] font-medium" style={{ color: meta.text }}>{meta.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(drawer, document.body);
}
