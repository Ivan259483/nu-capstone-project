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
  Search,
  ChevronDown,
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
import { ensureAvailabilityRealtimeSync } from '@/lib/availabilitySync';
import { useMonthBookings } from './useMonthBookings';
import DayPanel from './DayPanel';
import DroppableSlot from './DroppableSlot';
import RescheduleModal from './RescheduleModal';
import type { DayStatus, CalendarBooking } from './calendarTypes';
import { EXCLUDED_STATUSES } from './calendarTypes';
import { useCalendarScheduleDnD } from './CalendarScheduleDnDContext';
import { formatCalendarCustomerName } from './calendarFormatters';
import SalesStatCard from '@/components/sales/ui/SalesStatCard';
import { SALES_ACCENTS } from '@/components/sales/ui/salesTheme';

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateKey(d: Date): string { return d.toLocaleDateString('en-CA'); }
function isSameDay(a: Date, b: Date): boolean { return dateKey(a) === dateKey(b); }
function startOfWeek(d: Date): Date {
  const c = new Date(d); c.setDate(d.getDate() - d.getDay()); c.setHours(0, 0, 0, 0); return c;
}
function startOfWeekMonday(d: Date): Date {
  const c = new Date(d);
  const day = c.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function getMonthGridDates(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
function getRangeLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endLabel = end.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startLabel} - ${endLabel}`;
}
function getWeekOfMonth(d: Date): number {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Math.ceil((d.getDate() + offset) / 7);
}
function getBookingDateKey(booking: CalendarBooking): string {
  return String(booking.bookingDate || booking.date || '').slice(0, 10);
}
function getBookingTime(booking: CalendarBooking): string {
  return String(booking.bookingTime || booking.time || '').trim();
}
function timeToMinutes(value: string): number {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}
function normaliseBookingStatus(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}
function bookingMatchesSearch(booking: CalendarBooking, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    booking.customerName,
    booking.serviceName,
    booking.serviceType,
    booking.vehiclePlate,
    booking.bookingReference,
    booking.orderNumber,
    booking.status,
    getBookingTime(booking),
  ].some((value) => String(value || '').toLowerCase().includes(q));
}

// ── Status → visual config (stronger contrast for scanability) ───────────────
const STATUS_VISUAL: Record<DayStatus, { dot: string; label: string; ring: string; cellBg: string }> = {
  available: {
    dot: SALES_ACCENTS.green,
    label: 'Open',
    ring: '#86efac',
    cellBg: '#ecfdf5',
  },
  almost_full: {
    dot: SALES_ACCENTS.orange,
    label: 'Almost full',
    ring: '#fed7aa',
    cellBg: '#fff7ed',
  },
  full: {
    dot: SALES_ACCENTS.purple,
    label: 'Full',
    ring: '#ddd6fe',
    cellBg: '#f5f3ff',
  },
  closed: {
    dot: SALES_ACCENTS.teal,
    label: 'Closed',
    ring: '#99f6e4',
    cellBg: '#f0fdfa',
  },
};

type CalView = 'month' | 'week';
type CalendarVariant = 'classic' | 'premiumAdmin';

const CHIP_VISUAL: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: '#fffbeb', text: '#a16207', border: '#fde68a' },
  pending_confirmation: { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' },
  confirmed: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  approved: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  assigned: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  received: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  queued: { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe' },
  processing: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  in_progress: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  'in-progress': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  completed: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  paid: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  released: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
};

const DEFAULT_CHIP_VISUAL = { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };

/** Month grid: show at most this many booking pills, then "N more..." */
const PREMIUM_MONTH_VISIBLE_EVENTS = 4;

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
            <span className={`text-[11px] font-semibold leading-tight ${info?.isClosed ? 'text-teal-900' : 'text-slate-700'}`}>
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

function PremiumDayCell({
  date,
  info,
  bookings,
  isToday,
  isSelected,
  isCurrentMonth,
  maxVisibleEvents,
  onClick,
}: {
  date: Date;
  info: DayMapEntry | undefined;
  bookings: CalendarBooking[];
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  maxVisibleEvents: number;
  onClick: () => void;
}) {
  const rawStatus: DayStatus = info?.status ?? 'available';
  const status: DayStatus = info?.isClosed ? 'closed' : rawStatus;
  const visibleLimit = Math.max(0, maxVisibleEvents);
  const visibleBookings = bookings.slice(0, visibleLimit);
  const overflowCount = bookings.length > visibleLimit ? bookings.length - visibleLimit : 0;

  return (
    <DroppableSlot
      id={`day-${dateKey(date)}`}
      targetDate={dateKey(date)}
      status={status}
      className="premium-calendar-drop"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
        className={`premium-calendar-cell box-border flex h-full min-h-0 select-none flex-col px-1.5 pb-1 pt-1 transition-colors ${
          isSelected
            ? 'bg-white'
            : isToday
              ? 'bg-white'
              : isCurrentMonth
                ? 'bg-white hover:bg-slate-50'
                : 'bg-[#fbfbfc] text-slate-400 hover:bg-slate-50'
        }`}
        aria-label={date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
      >
        <div className="mb-0.5 flex shrink-0 items-center justify-between gap-1">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
              isToday
                ? 'bg-blue-600 text-white'
                : isSelected
                  ? 'text-blue-600 ring-1 ring-blue-600/25'
                  : isCurrentMonth
                    ? 'text-[#344054]'
                    : 'text-[#98a2b3]'
            }`}
          >
            {date.getDate()}
          </div>
        </div>

        <div className="premium-calendar-events flex min-h-0 w-full flex-1 flex-col justify-start gap-0.5 overflow-hidden">
          {visibleBookings.map((booking) => {
            const statusKey = normaliseBookingStatus(booking.status);
            const tone = CHIP_VISUAL[statusKey] || DEFAULT_CHIP_VISUAL;
            const time = getBookingTime(booking);
            const service = booking.serviceName || booking.serviceType || 'Booking';
            const label = booking.customerName
              ? formatCalendarCustomerName(booking.customerName)
              : booking.bookingReference || 'Customer';
            return (
              <button
                key={booking._id || booking.id || `${dateKey(date)}-${label}-${time}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClick();
                }}
                className="premium-calendar-event grid h-5 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded border px-1.5 text-left text-[11px] font-semibold leading-none transition hover:brightness-[0.98]"
                style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
                title={[label, service, time].filter(Boolean).join(' - ')}
              >
                <span className="min-w-0 truncate">{label}</span>
                {time ? <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-90">{time}</span> : null}
              </button>
            );
          })}
          {overflowCount > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClick();
              }}
              className="premium-calendar-events-more mt-0.5 shrink-0 px-0.5 text-left text-[11px] font-semibold leading-tight text-[#667085] transition hover:text-[#344054]"
            >
              {overflowCount} more...
            </button>
          ) : null}
        </div>
      </div>
    </DroppableSlot>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesSmartCalendar({ variant = 'classic' }: { variant?: CalendarVariant } = {}) {
  const isPremiumAdmin = variant === 'premiumAdmin';
  const [view, setView] = useState<CalView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [premiumSearchOpen, setPremiumSearchOpen] = useState(false);
  const [premiumSearch, setPremiumSearch] = useState('');
  
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

  useEffect(() => {
    if (isPremiumAdmin) ensureAvailabilityRealtimeSync();
  }, [isPremiumAdmin]);

  // Month-level slot data (with real-time socket updates)
  const { dayMap, loading: slotsLoading, refresh } = useCalendarSlots(year, month);
  const [monthClosures, setMonthClosures] = useState<AvailabilityClosure[]>([]);

  const premiumMonthCells = useMemo(() => getMonthGridDates(year, month), [year, month]);
  const premiumWeekDays = useMemo(() => {
    const sw = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(sw, i));
  }, [anchor]);
  const premiumVisibleDates = view === 'month' ? premiumMonthCells : premiumWeekDays;
  const premiumRange = useMemo(() => {
    const first = premiumVisibleDates[0] || startOfMonth(anchor);
    const last = premiumVisibleDates[premiumVisibleDates.length - 1] || endOfMonth(anchor);
    return { start: dateKey(first), end: dateKey(last) };
  }, [anchor, premiumVisibleDates]);
  const {
    bookings: monthBookings,
    loading: monthBookingsLoading,
    refetch: refetchMonthBookings,
  } = useMonthBookings(premiumRange.start, premiumRange.end, isPremiumAdmin);

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
  const premiumCells = premiumVisibleDates;
  const premiumMonthRowCount = view === 'month' ? Math.ceil(premiumCells.length / 7) : 1;

  // ── Nav label ───────────────────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === 'month')
      return anchor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const sw = startOfWeek(anchor), ew = addDays(sw, 6);
    const sm = sw.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const em = ew.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${sm} – ${em}`;
  }, [view, anchor]);

  const premiumTitle = useMemo(() => anchor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), [anchor]);

  const premiumDateRangeLabel = useMemo(() => {
    if (view === 'month') return getRangeLabel(startOfMonth(anchor), endOfMonth(anchor));
    const sw = startOfWeekMonday(anchor);
    return getRangeLabel(sw, addDays(sw, 6));
  }, [anchor, view]);

  const premiumBookingsByDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    const filtered = monthBookings
      .filter((booking) => !EXCLUDED_STATUSES.has(normaliseBookingStatus(booking.status)))
      .filter((booking) => bookingMatchesSearch(booking, premiumSearch));

    for (const booking of filtered) {
      const key = getBookingDateKey(booking);
      if (!key) continue;
      const rows = map.get(key) || [];
      rows.push(booking);
      map.set(key, rows);
    }

    for (const rows of map.values()) {
      rows.sort((a, b) => {
        const timeDelta = timeToMinutes(getBookingTime(a)) - timeToMinutes(getBookingTime(b));
        if (timeDelta !== 0) return timeDelta;
        return String(a.customerName || '').localeCompare(String(b.customerName || ''));
      });
    }

    return map;
  }, [monthBookings, premiumSearch]);

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
    refetchMonthBookings();
    loadMonthClosures();
  }, [refetchDay, refresh, refetchMonthBookings, loadMonthClosures]);

  const handleRefreshAll = useCallback(() => {
    refresh();
    refetchMonthBookings();
    loadMonthClosures();
  }, [refresh, refetchMonthBookings, loadMonthClosures]);

  const selectDate = useCallback((date: Date) => {
    if (isPremiumAdmin && view === 'month' && (date.getFullYear() !== year || date.getMonth() !== month)) {
      setAnchor(date);
    }
    setSelectedDate(date);
  }, [isPremiumAdmin, month, view, year]);

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
      const storedToken = localStorage.getItem('autospf_token') || '';
      const token = storedToken && storedToken !== 'undefined' && storedToken !== 'null' ? storedToken : '';
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
    <div className={`flex flex-col bg-white ${isPremiumAdmin ? 'h-full min-h-0 w-full' : 'h-full min-h-0 rounded-2xl'}`}>
      {isPremiumAdmin ? (
        <div className="premium-calendar-surface flex h-full min-h-0 flex-col overflow-hidden bg-white">
          <div className="premium-calendar-toolbar flex flex-shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="premium-calendar-date-badge flex h-10 w-10 shrink-0 flex-col items-center justify-center">
                <span className="text-[9px] font-semibold uppercase leading-none text-[#667085]">
                  {today.toLocaleDateString('en-PH', { month: 'short' })}
                </span>
                <span className="mt-0.5 text-base font-bold leading-none text-blue-600 tabular-nums">
                  {today.getDate()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="truncate text-base font-semibold leading-tight tracking-normal text-[#101828]">
                    {premiumTitle}
                  </h2>
                  <span className="premium-calendar-toolbar-chip px-2 py-0.5 text-[11px] font-medium leading-none text-[#344054]">
                    Week {getWeekOfMonth(anchor)}
                  </span>
                  <span className="hidden text-xs font-normal text-[#667085] sm:inline">
                    · {premiumDateRangeLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPremiumSearchOpen((open) => !open)}
                className={`premium-calendar-toolbar-icon-btn flex h-9 w-9 items-center justify-center text-[#667085] transition ${
                  premiumSearchOpen || premiumSearch ? 'is-active' : ''
                }`}
                aria-label="Search appointments"
              >
                <Search size={18} strokeWidth={2} />
              </button>

              <div className="premium-calendar-toolbar-nav flex h-9 overflow-hidden">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="premium-calendar-toolbar-nav-btn flex h-full w-9 items-center justify-center text-[#667085] transition hover:bg-[#f9fafb] hover:text-[#344054]"
                  aria-label="Previous"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="premium-calendar-toolbar-nav-btn premium-calendar-toolbar-nav-btn--today h-full px-4 text-sm font-semibold text-[#344054] transition hover:bg-[#f9fafb]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => navigate(1)}
                  className="premium-calendar-toolbar-nav-btn flex h-full w-9 items-center justify-center text-[#667085] transition hover:bg-[#f9fafb] hover:text-[#344054]"
                  aria-label="Next"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setView((current) => current === 'month' ? 'week' : 'month')}
                className="premium-calendar-toolbar-select inline-flex h-9 items-center gap-2 px-4 text-sm font-semibold text-[#344054] transition hover:bg-[#f9fafb]"
              >
                {view === 'month' ? 'Month view' : 'Week view'}
                <ChevronDown size={16} className="text-[#667085]" />
              </button>
            </div>
          </div>

          {(premiumSearchOpen || premiumSearch) && (
            <div className="flex flex-shrink-0 items-center border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-1.5">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={premiumSearch}
                  onChange={(event) => setPremiumSearch(event.target.value)}
                  placeholder="Search customer, service, plate, reference"
                  className="h-8 w-full rounded-lg border border-[#e4e7ec] bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>
          )}

          <div className="premium-calendar-weekdays grid flex-shrink-0 grid-cols-7 border-b border-[#eaecf0] bg-white">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="px-1 py-1.5 text-center text-xs font-medium text-[#667085]">
                {day}
              </div>
            ))}
          </div>

          <div className={`premium-calendar-body min-h-0 bg-white ${view === 'month' ? 'is-month-body flex flex-1 flex-col overflow-hidden' : 'flex flex-1 flex-col overflow-hidden'}`}>
            {slotsLoading && dayMap.size === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center gap-2 text-slate-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm font-medium">Loading calendar...</span>
              </div>
            ) : (
              <div
                className={`premium-calendar-grid ${view === 'month' ? 'is-month' : 'is-week'} grid h-full min-w-0 grid-cols-7`}
                style={
                  view === 'month'
                    ? ({ ['--premium-month-rows' as string]: premiumMonthRowCount } as React.CSSProperties)
                    : undefined
                }
              >
                {premiumCells.map((d) => {
                  const dk = dateKey(d);
                  const info = dayMap.get(dk);
                  return (
                    <PremiumDayCell
                      key={dk}
                      date={d}
                      info={info}
                      bookings={premiumBookingsByDate.get(dk) || []}
                      isToday={isSameDay(d, today)}
                      isSelected={selectedDate ? isSameDay(d, selectedDate) : false}
                      isCurrentMonth={d.getFullYear() === year && d.getMonth() === month}
                      maxVisibleEvents={view === 'month' ? PREMIUM_MONTH_VISIBLE_EVENTS : 6}
                      onClick={() => selectDate(d)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          {
            label: "Today's Active",
            sub: 'Bookings scheduled today',
            value: kpis.todayActive,
            accent: SALES_ACCENTS.green,
            icon: <Activity size={17} className="text-slate-500" />,
          },
          {
            label: 'Pending Review',
            sub: 'Awaiting approval',
            value: kpis.pending,
            accent: SALES_ACCENTS.orange,
            icon: <ClipboardClock size={17} className="text-slate-500" />,
          },
          {
            label: 'Month Bookings',
            sub: 'Slots booked this month',
            value: kpis.monthTotal,
            accent: SALES_ACCENTS.blue,
            icon: <Layers size={17} className="text-slate-500" />,
          },
          {
            label: 'Full Days',
            sub: 'No availability left',
            value: kpis.fullDays,
            accent: SALES_ACCENTS.orange,
            icon: <CalendarX size={17} className="text-slate-300" />,
            dark: true,
          },
        ] as const).map((k) => (
          <SalesStatCard
            key={k.label}
            title={k.label}
            metric={String(k.value)}
            label={k.sub}
            icon={k.icon}
            accent={k.accent}
            dark={'dark' in k ? k.dark : false}
            metricClassName="text-3xl"
          />
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
          onClick={handleRefreshAll}
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
                    onClick={() => selectDate(d)}
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
      </>
      )}

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
                {formatCalendarCustomerName(dragOverlayBooking.customerName).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <p className="truncate text-[15px] font-bold text-slate-900">{formatCalendarCustomerName(dragOverlayBooking.customerName)}</p>
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
