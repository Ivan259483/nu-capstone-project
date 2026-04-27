/**
 * SalesSmartCalendar.tsx
 * White-theme calendar for Sales Dashboard.
 * — Month / Week views
 * — Slot status driven from backend via useCalendarSlots
 * — Per-date booking fetch via useBookingsByDate (on date click)
 * — Real-time updates via Socket.io db_change (inside useCalendarSlots)
 * — Approve / Reject only inside DayPanel (never on calendar cells)
 */

import React, { useMemo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Loader2, CalendarDays } from 'lucide-react';
import { DndContext as _DndContext, DragEndEvent } from '@dnd-kit/core';
// Workaround: @dnd-kit/core v6 ships types that conflict with @types/react >=18.3
// (bigint added to ReactNode). Cast to ComponentType<any> until dnd-kit ships a fix.
const DndContext = _DndContext as React.ComponentType<React.ComponentProps<typeof _DndContext>>;
import { toast } from 'sonner';
import { useCalendarSlots, type DayMapEntry } from './useCalendarSlots';
import { useBookingsByDate, invalidateDateCache } from './useBookingsByDate';
import DayPanel from './DayPanel';
import DroppableSlot from './DroppableSlot';
import RescheduleModal from './RescheduleModal';
import type { DayStatus, CalendarBooking } from './calendarTypes';

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateKey(d: Date): string { return d.toLocaleDateString('en-CA'); }
function isSameDay(a: Date, b: Date): boolean { return dateKey(a) === dateKey(b); }
function startOfWeek(d: Date): Date {
  const c = new Date(d); c.setDate(d.getDate() - d.getDay()); c.setHours(0, 0, 0, 0); return c;
}
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

// ── Status → visual config ────────────────────────────────────────────────────
const STATUS_VISUAL: Record<DayStatus, { dot: string; label: string; ring: string; cellBg: string }> = {
  available:   { dot: '#22c55e', label: 'Open',        ring: '#bbf7d0', cellBg: '#f0fdf4' },
  almost_full: { dot: '#eab308', label: 'Almost Full', ring: '#fef08a', cellBg: '#fefce8' },
  full:        { dot: '#ef4444', label: 'Full',        ring: '#fecaca', cellBg: '#fff1f2' },
  closed:      { dot: '#f97316', label: 'Closed',      ring: '#fed7aa', cellBg: '#fff7ed' },
};

type CalView = 'month' | 'week';

// ── Day Cell ──────────────────────────────────────────────────────────────────
function DayCell({
  date, info, isToday, isPast, isSelected, onClick,
}: {
  date: Date;
  info: DayMapEntry | undefined;
  isToday: boolean;
  isPast: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status: DayStatus = info?.status ?? 'available';
  const vis = STATUS_VISUAL[status];
  const hasPending = (info?.pendingCount ?? 0) > 0;
  const bookingCount = info?.bookedSlots ?? 0;
  const slotsLeft = info ? Math.max(0, info.totalSlots - info.bookedSlots) : null;

  return (
    <DroppableSlot id={`day-${dateKey(date)}`} targetDate={dateKey(date)} status={status}>
      <div
        onClick={onClick}
      className="min-h-[110px] p-2.5 cursor-pointer transition-all duration-150 select-none"
      style={{
        background: isSelected ? '#eff6ff' : isPast ? '#fafafa' : info ? vis.cellBg : '#fff',
        border: `1.5px solid ${isSelected ? '#3b82f6' : isToday ? '#93c5fd' : info ? vis.ring : '#e2e8f0'}`,
        borderRadius: 14,
        opacity: isPast ? 0.6 : 1,
        boxShadow: isSelected ? '0 0 0 2px #bfdbfe' : isToday ? '0 0 0 2px #dbeafe' : 'none',
      }}>

      {/* Row 1: date number + booking badge */}
      <div className="flex items-start justify-between mb-2">
        <span
          className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors"
          style={isToday
            ? { background: '#2563eb', color: '#fff' }
            : { color: isPast ? '#94a3b8' : '#1e293b' }}>
          {date.getDate()}
        </span>
        {bookingCount > 0 && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: vis.dot + '22', color: vis.dot }}>
            {bookingCount}
          </span>
        )}
      </div>

      {/* Row 2: availability indicator */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: vis.dot }} />
        <span className="text-[10px] font-medium text-slate-500">
          {info?.isClosed ? 'Closed' : slotsLeft !== null ? `${slotsLeft} left` : vis.label}
        </span>
      </div>

      {/* Row 3: pending badge */}
      {hasPending && (
        <span
          className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1"
          style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
          {info!.pendingCount} pending
        </span>
      )}

    </div>
    </DroppableSlot>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesSmartCalendar() {
  const [view, setView] = useState<CalView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [rescheduleData, setRescheduleData] = useState<{ booking: CalendarBooking; targetDate: string } | null>(null);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  // Month-level slot data (with real-time socket updates)
  const { dayMap, loading: slotsLoading, refresh } = useCalendarSlots(year, month);

  // Per-date bookings (only fetched on click)
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const { bookings: dayBookings, loading: dayLoading, refetch: refetchDay } = useBookingsByDate(selectedKey);

  const today = useMemo(() => new Date(), []);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = useCallback((delta: number) => {
    setAnchor(prev => {
      const c = new Date(prev);
      if (view === 'month') c.setMonth(c.getMonth() + delta);
      else c.setDate(c.getDate() + 7 * delta);
      return c;
    });
  }, [view]);

  const goToday = useCallback(() => setAnchor(new Date()), []);

  // ── Grid cells ──────────────────────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = first.getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: offset + days }, (_, i) =>
      i < offset ? null : new Date(year, month, i - offset + 1)
    );
  }, [year, month]);

  const weekDays = useMemo(() => {
    const sw = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(sw, i));
  }, [anchor]);

  const cells = view === 'month' ? monthCells : weekDays;

  // ── Nav label ───────────────────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === 'month')
      return anchor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const sw = startOfWeek(anchor), ew = addDays(sw, 6);
    const sm = sw.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const em = ew.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${sm} – ${em}`;
  }, [view, anchor]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const allEntries = Array.from(dayMap.values());
    const todayEntry = dayMap.get(dateKey(today));
    return {
      todayActive: todayEntry?.bookedSlots ?? 0,
      monthTotal: allEntries.reduce((s, d) => s + d.bookedSlots, 0),
      pending: allEntries.reduce((s, d) => s + d.pendingCount, 0),
      fullDays: allEntries.filter(d => d.status === 'full').length,
    };
  }, [dayMap, today]);

  // ── Panel close / refresh ───────────────────────────────────────────────────
  const handlePanelRefresh = useCallback(() => {
    refetchDay();
    refresh(); // also bust the month slot cache
  }, [refetchDay, refresh]);

  // ── Drag and Drop ──────────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const booking = active.data.current?.booking as CalendarBooking;
    const targetDate = over.data.current?.targetDate as string;

    if (!booking || !targetDate) return;

    // Optional: avoid dragging onto the exact same date (though maybe they just want a new time)
    // if (booking.bookingDate === targetDate) return;

    setRescheduleData({ booking, targetDate });
  }, []);

  const handleRescheduleConfirm = async (bookingId: string, newDate: string, newTime: string) => {
    try {
      const token = localStorage.getItem('autospf_token') || sessionStorage.getItem('autospf_token') || localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const res = await fetch(`/api/orders/${bookingId}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newDate, newTime })
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Booking rescheduled successfully!');
        setRescheduleData(null);
        handlePanelRefresh();
        invalidateDateCache(newDate);
        if (rescheduleData?.booking.bookingDate) {
          invalidateDateCache(rescheduleData.booking.bookingDate);
        }
      } else {
        toast.error(data.message || 'Failed to reschedule booking');
      }
    } catch (e) {
      toast.error('Network error during reschedule');
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
    <div className="flex flex-col h-full min-h-0" style={{ background: '#f8fafc' }}>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4 flex-shrink-0">
        {([
          { label: "Today's Active", value: kpis.todayActive, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Pending Review', value: kpis.pending,     color: '#d97706', bg: '#fffbeb' },
          { label: 'Month Bookings', value: kpis.monthTotal,  color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Full Days',      value: kpis.fullDays,    color: '#dc2626', bg: '#fff1f2' },
        ] as const).map(k => (
          <div key={k.label} className="rounded-2xl p-4"
            style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="text-2xl font-black" style={{ color: k.color }}>{k.value}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5 mb-4 flex-shrink-0 flex-wrap">
        {/* Nav arrows + label */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: '#f1f5f9' }}>
          <button onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-800 min-w-[170px] text-center px-1">
            {navLabel}
          </span>
          <button onClick={() => navigate(1)}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Today */}
        <button onClick={goToday}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
          style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
          Today
        </button>

        {/* View toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
          {(['month', 'week'] as CalView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
              style={{
                background: view === v ? '#1d4ed8' : '#fff',
                color: view === v ? '#fff' : '#64748b',
              }}>
              {v}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Refresh */}
        <button onClick={refresh} disabled={slotsLoading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
          style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
          <RefreshCw size={12} className={slotsLoading ? 'animate-spin' : ''} />
          {slotsLoading ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

        {/* Day-name header */}
        <div className="grid grid-cols-7 flex-shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d}
              className="py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        {slotsLoading && dayMap.size === 0 ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading calendar…</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((d, i) => {
                if (!d) return (
                  <div key={`e${i}`} className="min-h-[110px] rounded-xl"
                    style={{ background: '#fafafa', border: '1px solid #f1f5f9' }} />
                );
                const dk = dateKey(d);
                const info = dayMap.get(dk);
                return (
                  <DayCell
                    key={dk}
                    date={d}
                    info={info}
                    isToday={isSameDay(d, today)}
                    isPast={d < today && !isSameDay(d, today)}
                    isSelected={selectedDate ? isSameDay(d, selectedDate) : false}
                    onClick={() => setSelectedDate(d)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
          <div className="flex items-center gap-1.5">
            <CalendarDays size={12} className="text-slate-400" />
            <span className="text-[10px] text-slate-400 font-medium">Real-time · auto-updates</span>
          </div>
          <div className="w-px h-4" style={{ background: '#e2e8f0' }} />
          {(Object.entries(STATUS_VISUAL) as [DayStatus, typeof STATUS_VISUAL[DayStatus]][]).map(([, vis]) => (
            <div key={vis.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: vis.dot }} />
              <span className="text-[10px] text-slate-500 font-medium">{vis.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day panel */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          bookings={dayBookings}
          loading={dayLoading}
          onClose={() => setSelectedDate(null)}
          onRefresh={handlePanelRefresh}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleData && (
        <RescheduleModal
          booking={rescheduleData.booking}
          targetDate={rescheduleData.targetDate}
          onClose={() => setRescheduleData(null)}
          onConfirm={handleRescheduleConfirm}
        />
      )}
    </div>
    </DndContext>
  );
}
