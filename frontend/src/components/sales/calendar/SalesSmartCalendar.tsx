/**
 * SalesSmartCalendar.tsx
 * White-theme calendar for Sales Dashboard.
 * — Month / Week views
 * — Slot status driven from backend via useCalendarSlots
 * — Per-date booking fetch via useBookingsByDate (on date click)
 * — Real-time updates via Socket.io db_change (inside useCalendarSlots)
 * — Approve / Reject only inside DayPanel (never on calendar cells)
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  CalendarDays,
  Activity,
  ClipboardClock,
  Layers,
  CalendarX,
  Clock,
  GripVertical,
} from 'lucide-react';
import {
  closestCenter,
  DndContext as _DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay as _DragOverlay,
  DragStartEvent,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
// Workaround: @dnd-kit/core v6 ships types that conflict with @types/react >=18.3
// (bigint added to ReactNode). Cast to ComponentType<any> until dnd-kit ships a fix.
const DndContext = _DndContext as React.ComponentType<React.ComponentProps<typeof _DndContext>>;
const DragOverlay = _DragOverlay as React.ComponentType<React.ComponentProps<typeof _DragOverlay>>;
import { toast } from 'sonner';
import { fetchAvailabilityClosures, type AvailabilityClosure } from './calendarService';
import { useCalendarSlots, type DayMapEntry } from './useCalendarSlots';
import { useBookingsByDate, invalidateDateCache } from './useBookingsByDate';
import DayPanel from './DayPanel';
import DroppableSlot from './DroppableSlot';
import RescheduleModal from './RescheduleModal';
import type { DayStatus, CalendarBooking } from './calendarTypes';
import { useCalendarScheduleDnD } from './CalendarScheduleDnDContext';

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateKey(d: Date): string { return d.toLocaleDateString('en-CA'); }
function isSameDay(a: Date, b: Date): boolean { return dateKey(a) === dateKey(b); }
function startOfWeek(d: Date): Date {
  const c = new Date(d); c.setDate(d.getDate() - d.getDay()); c.setHours(0, 0, 0, 0); return c;
}
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

// ── Status → visual config (stronger contrast for scanability) ───────────────
const STATUS_VISUAL: Record<DayStatus, { dot: string; label: string; ring: string; cellBg: string }> = {
  available: {
    dot: '#16a34a',
    label: 'Open',
    ring: '#86efac',
    cellBg: '#ecfdf5',
  },
  almost_full: {
    dot: '#ca8a04',
    label: 'Almost full',
    ring: '#fde047',
    cellBg: '#fefce8',
  },
  full: {
    dot: '#dc2626',
    label: 'Full',
    ring: '#fca5a5',
    cellBg: '#fef2f2',
  },
  closed: {
    dot: '#ea580c',
    label: 'Closed',
    ring: '#fdba74',
    cellBg: '#ffedd5',
  },
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
  const rawStatus: DayStatus = info?.status ?? 'available';
  const status: DayStatus = info?.isClosed ? 'closed' : rawStatus;
  const vis = STATUS_VISUAL[status];
  const hasPending = (info?.pendingCount ?? 0) > 0;
  const bookingCount = info?.bookedSlots ?? 0;
  /** Month cell: show least free seats in any one time band (matches admin "Capacity per time slot"), not sum across all hours. */
  const slotsLeft = info && !info.isClosed ? Math.max(0, info.minAvailablePerSlot) : null;

  const statusLine = info?.isClosed
    ? (info.closureLabel
        ? `Closed · ${info.closureLabel}`
        : info.closedReason === 'recurring'
          ? 'Closed · Day off'
          : info.closedReason === 'emergency'
            ? 'Closed · Emergency'
            : 'Closed')
    : slotsLeft !== null
      ? `${slotsLeft} slot${slotsLeft === 1 ? '' : 's'}`
      : vis.label;

  let bg = !info ? '#ffffff' : vis.cellBg;
  /** No stroke borders — depth from shadow only */
  let shadow =
    '0 6px 22px rgba(15,23,42,0.07), 0 2px 8px rgba(15,23,42,0.04)';

  if (isSelected) {
    bg = '#eff6ff';
    shadow =
      '0 14px 44px rgba(37,99,235,0.2), 0 6px 20px rgba(37,99,235,0.12), 0 2px 6px rgba(37,99,235,0.08)';
  } else if (isToday && !isPast) {
    shadow =
      '0 12px 38px rgba(59,130,246,0.18), 0 5px 18px rgba(59,130,246,0.12), 0 2px 6px rgba(59,130,246,0.08)';
  }

  if (isPast && !isToday) {
    bg = '#f8fafc';
  }

  return (
    <DroppableSlot id={`day-${dateKey(date)}`} targetDate={dateKey(date)} status={status}>
      <div
        onClick={onClick}
        className="relative flex min-h-[118px] cursor-pointer select-none flex-col p-2.5 transition-all duration-150"
        style={{
          background: bg,
          border: 'none',
          borderRadius: 16,
          opacity: isPast && !isToday ? 0.62 : 1,
          boxShadow: shadow,
        }}
      >

        {/* Row 1: date number + booking count */}
        <div className="mb-2 flex items-start justify-between gap-1">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums transition-colors"
            style={
              isToday
                ? { background: '#2563eb', color: '#fff', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }
                : isSelected
                  ? { background: '#1d4ed8', color: '#fff', boxShadow: '0 4px 14px rgba(29,78,216,0.25)' }
                  : {
                      background: '#fff',
                      color: isPast ? '#94a3b8' : '#0f172a',
                      boxShadow: '0 2px 10px rgba(15,23,42,0.08)',
                    }
            }
          >
            {date.getDate()}
          </span>
          {bookingCount > 0 && (
            <span
              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm"
              style={{ background: isSelected ? '#1e40af' : '#15803d' }}
              title={`${bookingCount} booking${bookingCount === 1 ? '' : 's'}`}
            >
              {bookingCount}
            </span>
          )}
        </div>

        {/* Row 2: status dot + label */}
        <div className="mb-1 flex min-h-[2rem] flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white" style={{ background: vis.dot }} />
            <span className={`text-[11px] font-semibold leading-tight ${info?.isClosed ? 'text-orange-900' : 'text-slate-700'}`}>
              {statusLine}
            </span>
          </div>
          {isToday && !isSelected && (
            <span className="inline-flex w-fit rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Today
            </span>
          )}
          {isSelected && (
            <span className="inline-flex w-fit rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 shadow-[0_2px_8px_rgba(37,99,235,0.15)]">
              Selected
            </span>
          )}
        </div>

        {hasPending && (
          <span
            className="mt-auto inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-900 shadow-[0_2px_8px_rgba(146,64,14,0.12)]"
          >
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
  /** Shown inside DragOverlay after the day panel closes so the drag continues (see onDragStart). */
  const [dragOverlayBooking, setDragOverlayBooking] = useState<CalendarBooking | null>(null);
  /** Keep payload stable even if the source draggable unmounts during drag. */
  const activeDragBookingRef = useRef<CalendarBooking | null>(null);
  /** Keep last hovered date; `event.over` can be null on drop in fast drag/unmount transitions. */
  const lastOverDateRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
  );

  const { setDraggingSchedule } = useCalendarScheduleDnD();

  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  // Month-level slot data (with real-time socket updates)
  const { dayMap, loading: slotsLoading, refresh } = useCalendarSlots(year, month);
  const [monthClosures, setMonthClosures] = useState<AvailabilityClosure[]>([]);

  const loadMonthClosures = useCallback(async () => {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month + 1, 0).toLocaleDateString('en-CA');
    try {
      const rows = await fetchAvailabilityClosures();
      setMonthClosures(
        rows.filter((row) => {
          const from = new Date(row.fromDate).toLocaleDateString('en-CA');
          const to = new Date(row.toDate).toLocaleDateString('en-CA');
          return from <= monthEnd && to >= monthStart;
        }),
      );
    } catch {
      setMonthClosures([]);
    }
  }, [year, month]);

  useEffect(() => {
    loadMonthClosures();
  }, [loadMonthClosures]);

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
    refresh();
    loadMonthClosures();
  }, [refetchDay, refresh, loadMonthClosures]);

  // ── Drag and Drop ──────────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    const booking = (active.data.current?.booking as CalendarBooking | undefined) ?? activeDragBookingRef.current;
    const fromDroppableData = over?.data.current?.targetDate as string | undefined;
    const fromDroppableId = typeof over?.id === 'string' && over.id.startsWith('day-') ? over.id.slice(4) : undefined;
    const targetDate = fromDroppableData || fromDroppableId || lastOverDateRef.current || undefined;

    if (!booking || !targetDate) return;

    // Optional: avoid dragging onto the exact same date (though maybe they just want a new time)
    // if (booking.bookingDate === targetDate) return;

    setRescheduleData({ booking, targetDate });
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const fromDroppableData = event.over?.data.current?.targetDate as string | undefined;
    const fromDroppableId =
      typeof event.over?.id === 'string' && event.over.id.startsWith('day-')
        ? event.over.id.slice(4)
        : undefined;
    if (fromDroppableData || fromDroppableId) {
      lastOverDateRef.current = fromDroppableData || fromDroppableId || null;
    }
  }, []);

  /** Close day panel + blur as soon as drag starts; DragOverlay keeps the drag alive after unmount. */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const booking = event.active.data.current?.booking as CalendarBooking | undefined;
    if (!booking) return;
    lastOverDateRef.current = null;
    flushSync(() => {
      activeDragBookingRef.current = booking;
      setDragOverlayBooking(booking);
      setDraggingSchedule(true);
    });
    // Defer drawer close to next frame so sensor activation is not interrupted mid-tick.
    requestAnimationFrame(() => setSelectedDate(null));
  }, [setDraggingSchedule]);

  const handleDragCancel = useCallback(() => {
    activeDragBookingRef.current = null;
    lastOverDateRef.current = null;
    setDragOverlayBooking(null);
    setDraggingSchedule(false);
  }, [setDraggingSchedule]);

  const handleDragEndWrapped = useCallback(
    (event: DragEndEvent) => {
      handleDragEnd(event);
      activeDragBookingRef.current = null;
      lastOverDateRef.current = null;
      setDragOverlayBooking(null);
      setDraggingSchedule(false);
    },
    [handleDragEnd, setDraggingSchedule],
  );

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEndWrapped}
    >
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-white">

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          {
            label: "Today's active",
            sub: 'Bookings scheduled today',
            value: kpis.todayActive,
            accent: '#2563eb',
            iconBg: '#dbeafe',
            Icon: Activity,
          },
          {
            label: 'Pending review',
            sub: 'Awaiting approval',
            value: kpis.pending,
            accent: '#d97706',
            iconBg: '#ffedd5',
            Icon: ClipboardClock,
          },
          {
            label: 'Month bookings',
            sub: 'Slots booked this month',
            value: kpis.monthTotal,
            accent: '#7c3aed',
            iconBg: '#ede9fe',
            Icon: Layers,
          },
          {
            label: 'Full days',
            sub: 'No availability left',
            value: kpis.fullDays,
            accent: '#dc2626',
            iconBg: '#ffe4e6',
            Icon: CalendarX,
          },
        ] as const).map((k) => (
          <div
            key={k.label}
            className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.12),0_4px_14px_-4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_18px_48px_-14px_rgba(15,23,42,0.14)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: k.iconBg, color: k.accent }}
              >
                <k.Icon size={22} strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-3xl font-black tabular-nums tracking-tight" style={{ color: k.accent }}>
                  {k.value}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{k.label}</p>
            <p className="mt-0.5 text-xs font-medium leading-snug text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {monthClosures.length > 0 && (
        <div
          className="mb-4 rounded-2xl bg-amber-50/95 px-4 py-3 text-amber-950 shadow-[0_8px_28px_-10px_rgba(180,83,9,0.2)] ring-1 ring-amber-200/70"
          role="status"
        >
          <p className="text-sm font-semibold">
            {monthClosures.length} scheduled closure{monthClosures.length === 1 ? '' : 's'} this month
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Orange <strong>Closed</strong> weekdays are usually from these blocks (calendar “Block date” or Availability Controls), not your weekly Mon–Fri schedule.
          </p>
          <ul className="mt-2 space-y-1 text-xs font-medium text-amber-950/90">
            {monthClosures.slice(0, 6).map((row) => {
              const from = new Date(row.fromDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
              const to = new Date(row.toDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
              const range = from === to ? from : `${from} – ${to}`;
              return (
                <li key={row._id}>
                  {range}
                  {(row.note || row.reason) ? ` · ${row.note || row.reason}` : ''}
                </li>
              );
            })}
            {monthClosures.length > 6 && (
              <li className="text-amber-800/80">+{monthClosures.length - 6} more in Availability Controls</li>
            )}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.05)]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[180px] px-2 text-center text-sm font-bold tracking-tight text-slate-900">{navLabel}</span>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={goToday}
          className="rounded-2xl bg-blue-50/95 px-3.5 py-2 text-xs font-bold text-blue-800 shadow-[0_8px_24px_-6px_rgba(37,99,235,0.22)] transition-colors hover:bg-blue-100"
        >
          Today
        </button>

        <div className="flex overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_-8px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.05)]">
          {(['month', 'week'] as CalView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-4 py-2 text-xs font-bold capitalize transition-colors ${
                view === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={refresh}
          disabled={slotsLoading}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 text-xs font-bold text-slate-600 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.05)] transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={14} className={slotsLoading ? 'animate-spin' : ''} />
          {slotsLoading ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_70px_-28px_rgba(15,23,42,0.13),0_10px_36px_-16px_rgba(15,23,42,0.08)]">

        {/* Day-name header — no divider line; tint only */}
        <div className="grid flex-shrink-0 grid-cols-7 bg-slate-50/70">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              className="py-3.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        {slotsLoading && dayMap.size === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">Loading calendar…</span>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3.5">
            <div className="grid grid-cols-7 gap-3">
              {cells.map((d, i) => {
                if (!d) return (
                  <div key={`e${i}`} className="min-h-[118px] rounded-2xl bg-slate-50/80 shadow-[0_6px_20px_rgba(15,23,42,0.05)]" />
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
        <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-2 bg-slate-50/60 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-500">Live sync · auto-updates</span>
          </div>
          <div className="hidden text-slate-300 sm:block" aria-hidden>·</div>
          {(Object.entries(STATUS_VISUAL) as [DayStatus, (typeof STATUS_VISUAL)[DayStatus]][]).map(([, vis]) => (
            <div key={vis.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: vis.dot }} />
              <span className="text-[11px] font-semibold text-slate-600">{vis.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Today</span>
            <span className="text-[11px] font-medium text-slate-500">Current date</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 ring-1 ring-blue-200">
              Selected
            </span>
            <span className="text-[11px] font-medium text-slate-500">Focused day</span>
          </div>
        </div>
      </div>

      {/* Day panel */}
      {selectedDate && (
        <DayPanel
          date={selectedDate}
          bookings={dayBookings}
          loading={dayLoading}
          dayInfo={selectedKey ? dayMap.get(selectedKey) : undefined}
          onClose={() => setSelectedDate(null)}
          onRefresh={handlePanelRefresh}
        />
      )}

      <DragOverlay zIndex={420} dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16,1,0.3,1)' }}>
        {dragOverlayBooking ? (
          <div className="pointer-events-none w-[min(92vw,360px)] cursor-grabbing rounded-2xl bg-white p-4 shadow-[0_28px_60px_-15px_rgba(15,23,42,0.45)] ring-2 ring-blue-500/35">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-md">
                {(dragOverlayBooking.customerName || 'C').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <p className="truncate text-[15px] font-bold text-slate-900">{dragOverlayBooking.customerName}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-slate-600">
                  {dragOverlayBooking.bookingTime ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={13} className="text-slate-400" />
                      {dragOverlayBooking.bookingTime}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {dragOverlayBooking.serviceName || dragOverlayBooking.serviceType || 'Booking'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-blue-600">Drop on a date</p>
          </div>
        ) : null}
      </DragOverlay>

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
