import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Clock, Loader2, Calendar as CalIcon } from 'lucide-react';
import { fetchSlotsByDate } from './calendarService';
import type { CalendarBooking } from './calendarTypes';

interface RescheduleModalProps {
  booking: CalendarBooking;
  targetDate: string;
  onClose: () => void;
  onConfirm: (bookingId: string, newDate: string, newTime: string) => Promise<void>;
}

export default function RescheduleModal({ booking, targetDate, onClose, onConfirm }: RescheduleModalProps) {
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState<{ time: string; label?: string; status: string }[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await fetchSlotsByDate(targetDate);
      if (data && !data.isClosed && data.slots) {
        setTimeSlots(data.slots.filter(s => s.status !== 'FULL'));
      } else {
        setTimeSlots([]);
      }
      setLoading(false);
    }
    load();
  }, [targetDate]);

  const handleConfirm = async () => {
    if (!selectedTime) {
      toast.error('Please select a time slot');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(booking._id || booking.id!, targetDate, selectedTime);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedTargetDate = new Date(targetDate).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

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
            <p className="text-xs text-slate-500 mt-0.5">{booking.customerName} • {booking.serviceName || booking.serviceType}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Date</label>
            <div className="flex items-center gap-2 mt-1.5 p-3 rounded-2xl bg-slate-50/90 text-slate-800 text-sm font-medium border-0 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
              <CalIcon size={16} className="text-blue-500" />
              {formattedTargetDate}
            </div>
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
