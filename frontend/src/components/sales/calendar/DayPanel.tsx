/**
 * DayPanel.tsx
 * Slide-in right panel showing all bookings for a clicked date.
 * Approve / Reject actions are ONLY available here (not on calendar cells).
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  X, Clock, Car, CheckCircle, XCircle, Loader2,
  Calendar, ChevronRight, AlertCircle,
} from 'lucide-react';
import { approveBooking, rejectBooking } from './calendarService';
import { invalidateDateCache } from './useBookingsByDate';
import type { CalendarBooking } from './calendarTypes';
import { EXCLUDED_STATUSES } from './calendarTypes';
import DraggableBooking from './DraggableBooking';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  pending_confirmation: { label: 'Pending Review', dot: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
  confirmed:            { label: 'Confirmed',       dot: '#3b82f6', bg: '#eff6ff', text: '#1e40af' },
  approved:             { label: 'Approved',        dot: '#10b981', bg: '#ecfdf5', text: '#065f46' },
  assigned:             { label: 'Assigned',        dot: '#8b5cf6', bg: '#f5f3ff', text: '#4c1d95' },
  received:             { label: 'Received',        dot: '#14b8a6', bg: '#f0fdfa', text: '#134e4a' },
  in_progress:          { label: 'In Progress',     dot: '#f97316', bg: '#fff7ed', text: '#9a3412' },
  completed:            { label: 'Completed',       dot: '#22c55e', bg: '#f0fdf4', text: '#14532d' },
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

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
          style={{ background: meta.dot }}>
          {(booking.customerName || 'C').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{booking.customerName}</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: meta.bg, color: meta.text }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: meta.dot }} />
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
            {booking.bookingTime && (
              <span className="flex items-center gap-1"><Clock size={10} />{booking.bookingTime}</span>
            )}
            {booking.vehiclePlate && (
              <span className="flex items-center gap-1"><Car size={10} />{booking.vehiclePlate}</span>
            )}
            {booking.bookingReference && (
              <span className="font-mono text-slate-400">#{booking.bookingReference}</span>
            )}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2.5" style={{ background: '#f8fafc' }}>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Service</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
            {booking.serviceName || booking.serviceType || '—'}
          </p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: '#f8fafc' }}>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">
            ₱{Number(booking.totalPrice || booking.totalAmount || 0).toLocaleString()}
          </p>
        </div>
        {(booking.vehicleMake || booking.vehicleModel) && (
          <div className="col-span-2 rounded-xl p-2.5" style={{ background: '#f8fafc' }}>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Vehicle</p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              {[booking.vehicleMake, booking.vehicleModel, booking.vehicleType].filter(Boolean).join(' ')}
            </p>
          </div>
        )}
      </div>

      {/* Payment proof image */}
      {isPending && booking.paymentProofUrl && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">GCash Proof</p>
          <img
            src={booking.paymentProofUrl}
            alt="Payment proof"
            className="w-full h-32 object-cover rounded-xl cursor-zoom-in transition-opacity hover:opacity-90"
            style={{ border: '1px solid #e2e8f0' }}
            onClick={() => window.open(booking.paymentProofUrl, '_blank')}
          />
        </div>
      )}
      {isPending && !booking.paymentProofUrl && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#fef9c3', border: '1px solid #fde68a' }}>
            <AlertCircle size={12} className="text-amber-600 flex-shrink-0" />
            <span className="text-[11px] text-amber-700 font-medium">No payment proof uploaded yet</span>
          </div>
        </div>
      )}

      {/* Action buttons — ONLY for pending_confirmation */}
      {isPending && (
        <div className="px-4 pb-4">
          {rejectMode ? (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                rows={2}
                className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                style={{ border: '1px solid #fca5a5', background: '#fff5f5' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectMode(false); setRejectReason(''); }}
                  disabled={actioning}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 rounded-xl transition-colors hover:bg-slate-100"
                  style={{ border: '1px solid #e2e8f0' }}>
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actioning}
                  className="flex-1 py-2 text-xs font-semibold text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
                className="flex-1 py-2 text-xs font-semibold text-red-600 rounded-xl transition-colors hover:bg-red-50 flex items-center justify-center gap-1"
                style={{ border: '1px solid #fecaca' }}>
                <XCircle size={12} /> Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={actioning}
                className="flex-1 py-2 text-xs font-semibold text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors"
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
  onClose: () => void;
  onRefresh: () => void;
}

export default function DayPanel({ date, bookings, loading, onClose, onRefresh }: DayPanelProps) {
  const label = date.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const active = bookings.filter(b => !EXCLUDED_STATUSES.has(b.status));
  const excluded = bookings.filter(b => EXCLUDED_STATUSES.has(b.status));

  const handleActionComplete = (_id: string) => {
    onRefresh();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: 'rgba(15,23,42,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="w-full max-w-md h-full bg-white flex flex-col overflow-hidden"
        style={{ borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 32px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">{label}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 ml-5">
              {loading ? 'Loading…' : `${active.length} active booking${active.length !== 1 ? 's' : ''}`}
              {excluded.length > 0 && ` · ${excluded.length} cancelled/rejected`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-60"
                        style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
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
      </div>
    </div>
  );
}
