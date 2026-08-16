import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Clock, Loader2, Calendar as CalIcon } from 'lucide-react';
import { fetchSlotsByDate } from './calendarService';
import type { CalendarBooking } from './calendarTypes';
import { formatCalendarCustomerName } from './calendarFormatters';

interface RescheduleModalProps {
  booking: CalendarBooking;
  targetDate: string;
  allowDateChange?: boolean;
  onClose: () => void;
  onConfirm: (bookingId: string, newDate: string, newTime: string) => Promise<void>;
}

export default function RescheduleModal({
  booking,
  targetDate,
  allowDateChange = false,
  onClose,
  onConfirm,
}: RescheduleModalProps) {
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState<{
    time: string;
    label?: string;
    status: string;
    available: number;
  }[]>([]);
  const [selectedDate, setSelectedDate] = useState(targetDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelectedDate(targetDate);
  }, [targetDate]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setSelectedTime('');
      try {
        const data = await fetchSlotsByDate(selectedDate);
        if (!active) return;
        if (data && !data.isClosed && data.slots) {
          setTimeSlots(data.slots.filter((slot) => (
            Number(slot.available) > 0
            && slot.status !== 'FULL'
            && slot.status !== 'OVER_CAPACITY'
          )));
        } else {
          setTimeSlots([]);
        }
      } catch {
        if (active) setTimeSlots([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [selectedDate]);

  const handleConfirm = async () => {
    if (!selectedTime) {
      toast.error('Please select a time slot');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(booking._id || booking.id!, selectedDate, selectedTime);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedTargetDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const minimumDate = new Date().toLocaleDateString('en-CA');
  const customerLabel = formatCalendarCustomerName(booking.customerName);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border-0 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h3 className="font-bold text-slate-900">Reschedule Booking</h3>
            <p className="text-xs text-slate-500 mt-0.5">{customerLabel} • {booking.serviceName || booking.serviceType}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400" aria-label="Close reschedule dialog">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Date</label>
            {allowDateChange ? (
              <div className="mt-1.5 rounded-2xl bg-slate-50/90 p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <CalIcon size={16} className="text-blue-500" />
                  {formattedTargetDate}
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  min={minimumDate}
                  disabled={submitting}
                  onChange={(event) => {
                    if (event.target.value) setSelectedDate(event.target.value);
                  }}
                  className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                  aria-label="Choose a new appointment date"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1.5 p-3 rounded-2xl bg-slate-50/90 text-slate-800 text-sm font-medium border-0 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <CalIcon size={16} className="text-blue-500" />
                {formattedTargetDate}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select New Time</label>
            {loading ? (
              <div className="flex items-center gap-2 mt-3 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading available times...
              </div>
            ) : timeSlots.length === 0 ? (
              <div className="mt-3 p-3 rounded-2xl bg-red-50/90 text-red-600 text-sm border-0 shadow-[0_1px_3px_rgba(220,38,38,0.08)]">
                No available time slots on this date.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {timeSlots.map(s => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => setSelectedTime(s.time)}
                    className={`p-2 rounded-2xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all duration-200 border-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35 focus-visible:ring-offset-2 ${
                      selectedTime === s.time
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                        : 'bg-slate-50/90 text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:bg-blue-50/90 hover:shadow-[0_2px_8px_rgba(37,99,235,0.12)]'
                    }`}
                  >
                    <Clock size={12} className={selectedTime === s.time ? 'text-blue-200' : 'text-slate-400'} />
                    {s.label || s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 flex gap-2 justify-end" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || !selectedTime}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#2563eb' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Confirm Reschedule
          </button>
        </div>

      </div>
    </div>
  );
}
