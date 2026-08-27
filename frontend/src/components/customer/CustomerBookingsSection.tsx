import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Car,
  Check,
  Clock3,
  CreditCard,
  Grid2X2,
  Info,
  Plus,
  ReceiptText,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { Booking } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';

export type CustomerBookingFilter = 'all' | 'upcoming' | 'active' | 'completed' | 'cancelled';

type CustomerBooking = Booking & {
  price?: number;
  vehicleBrand?: string;
  vehiclePlate?: string;
  rejectionReason?: string;
  invoiceRecord?: { _id?: string } | null;
  serviceStaffAssignments?: Array<{ name?: string }>;
};

interface CustomerBookingsSectionProps {
  bookings: CustomerBooking[];
  activeFilter: CustomerBookingFilter;
  highlightedAppointmentRef?: string;
  onFilterChange: (filter: CustomerBookingFilter) => void;
  onNewBooking: () => void;
  onTrackService: () => void;
  onViewReceipt: (bookingId: string) => void;
  onCancelBooking: (booking: CustomerBooking) => Promise<void> | void;
  registerBookingRef?: (reference: string, element: HTMLElement | null) => void;
}

const FILTERS: CustomerBookingFilter[] = ['all', 'upcoming', 'active', 'completed', 'cancelled'];

const FILTER_LABELS: Record<CustomerBookingFilter, string> = {
  all: 'All',
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const FILTER_META = {
  all: { icon: Grid2X2, caption: 'Service records' },
  upcoming: { icon: CalendarDays, caption: 'Reserved visits' },
  active: { icon: Activity, caption: 'In the studio' },
  completed: { icon: BadgeCheck, caption: 'Finished care' },
  cancelled: { icon: XCircle, caption: 'Closed requests' },
} as const;

const UPCOMING_STATUSES = new Set([
  'pending',
  'pending_confirmation',
  'confirmed',
  'approved',
  'assigned',
  'queued',
]);
const ACTIVE_STATUSES = new Set([
  'active',
  'in_service',
  'in_progress',
  'processing',
  'checked_in',
  'received',
  'quality_check',
  'ready_pickup',
]);
const COMPLETED_STATUSES = new Set(['completed', 'released', 'done', 'delivered', 'paid']);
const CANCELLED_STATUSES = new Set(['cancelled', 'rejected', 'not_approved', 'failed']);

const PROGRESS_STEPS = ['Confirmed', 'Arrived', 'In service', 'QC review', 'Pickup'] as const;

function normalizeStatus(value: unknown): string {
  return String(value || 'pending').trim().toLowerCase().replace(/-/g, '_');
}

function categoryForBooking(booking: CustomerBooking): Exclude<CustomerBookingFilter, 'all'> {
  const status = normalizeStatus(booking.status);
  if (ACTIVE_STATUSES.has(status)) return 'active';
  if (COMPLETED_STATUSES.has(status)) return 'completed';
  if (CANCELLED_STATUSES.has(status)) return 'cancelled';
  return 'upcoming';
}

function bookingTimestamp(booking: CustomerBooking): number {
  const timestamp = new Date(booking.bookingDate || booking.date || booking.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function appointmentReference(booking: CustomerBooking): string {
  return String(
    booking.bookingReference
    || booking.orderNumber
    || booking._id
    || booking.id
    || '',
  ).trim();
}

function bookingId(booking: CustomerBooking): string {
  return String(booking._id || booking.id || appointmentReference(booking));
}

function serviceTitle(booking: CustomerBooking): string {
  return String(booking.serviceName || booking.serviceType || 'AutoSPF+ Service');
}

function serviceSummary(booking: CustomerBooking): { primary: string; additionalCount: number } {
  const services = serviceTitle(booking)
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);
  return {
    primary: services[0] || 'AutoSPF+ Service',
    additionalCount: Math.max(0, services.length - 1),
  };
}

function vehicleTitle(booking: CustomerBooking): string {
  const structured = [
    booking.vehicleYear,
    booking.vehicleBrand || booking.vehicleMake,
    booking.vehicleModel,
  ].filter(Boolean).join(' ');
  return structured || booking.vehicleInfo || 'Vehicle details to be confirmed';
}

function vehicleDetailLabel(booking: CustomerBooking): string {
  const rawPlate = String(booking.vehiclePlate || '').trim();
  const plate = /^(pending|tbd|n\/a|none|unknown)$/i.test(rawPlate) ? '' : rawPlate.toUpperCase();
  const rawColor = booking.vehicleColor
    ? String(booking.vehicleColor).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : '';
  const color = /^(pending|tbd|n\/a|none|unknown)$/i.test(rawColor) ? '' : rawColor;
  if (plate && color) return `${plate} · ${color}`;
  if (plate) return plate;
  if (color) return `Plate pending · ${color}`;
  return 'Plate and color pending';
}

function formatDate(booking: CustomerBooking): string {
  const raw = booking.bookingDate || booking.date;
  if (!raw) return 'Awaiting schedule';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Awaiting schedule';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSchedule(booking: CustomerBooking): string {
  const time = booking.bookingTime || booking.time;
  return time ? `${formatDate(booking)} · ${time}` : formatDate(booking);
}

function amountForBooking(booking: CustomerBooking): number {
  const amount = [
    booking.totalAmount,
    booking.serviceTotal,
    booking.totalPrice,
    booking.price,
  ].find((value) => Number.isFinite(Number(value)));
  return Number(amount || 0);
}

function hasReceipt(booking: CustomerBooking): boolean {
  return Boolean(
    normalizeStatus(booking.paymentStatus) === 'paid'
    || normalizeStatus(booking.status) === 'paid'
    || booking.invoiceId
    || booking.invoiceRecord?._id
    || booking.warrantyAndReceipt,
  );
}

function paymentLabel(booking: CustomerBooking): string {
  const status = normalizeStatus(booking.paymentStatus);
  if (status === 'paid' || normalizeStatus(booking.status) === 'paid') return 'Paid';
  if (status === 'failed') return 'Payment failed';
  if (status === 'refunded') return 'Refunded';
  return 'Payment pending';
}

function progressIndexForBooking(booking: CustomerBooking): number {
  const stage = normalizeStatus(booking.serviceTrackingStage || booking.status);
  const indexes: Record<string, number> = {
    pending: 0,
    pending_confirmation: 0,
    approved: 0,
    confirmed: 0,
    assigned: 0,
    queued: 0,
    received: 1,
    checked_in: 1,
    active: 2,
    in_service: 2,
    in_progress: 2,
    processing: 2,
    quality_check: 3,
    ready_pickup: 4,
    completed: 4,
    released: 4,
  };
  return Math.max(0, Math.min(PROGRESS_STEPS.length - 1, indexes[stage] ?? 0));
}

function statusLabel(booking: CustomerBooking): string {
  const status = normalizeStatus(booking.status);
  const labels: Record<string, string> = {
    pending: 'Pending',
    pending_confirmation: 'Awaiting confirmation',
    approved: 'Confirmed',
    confirmed: 'Confirmed',
    assigned: 'Team assigned',
    queued: 'Confirmed',
    received: 'Arrived',
    checked_in: 'Arrived',
    active: 'In service',
    in_service: 'In service',
    in_progress: 'In service',
    processing: 'In service',
    quality_check: 'QC review',
    ready_pickup: 'Ready for pickup',
    completed: 'Released',
    released: 'Released',
    done: 'Released',
    delivered: 'Released',
    paid: 'Released',
    rejected: 'Not approved',
    not_approved: 'Not approved',
    failed: 'Not approved',
    cancelled: 'Cancelled',
  };
  return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(booking: CustomerBooking): {
  rail: string;
  badge: string;
  dot: string;
} {
  const category = categoryForBooking(booking);
  const status = normalizeStatus(booking.status);

  if (category === 'completed') {
    return {
      rail: 'bg-emerald-500',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    };
  }
  if (category === 'cancelled') {
    return {
      rail: 'bg-rose-500',
      badge: 'border-rose-200 bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
    };
  }
  if (status === 'pending' || status === 'pending_confirmation') {
    return {
      rail: 'bg-amber-500',
      badge: 'border-amber-200 bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
    };
  }
  return {
    rail: 'bg-blue-600',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-600',
  };
}

function lastUpdateLabel(booking: CustomerBooking): string {
  const value = booking.updatedAt || booking.createdAt;
  if (!value) return 'No update available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No update available';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function assignedTeamLabel(booking: CustomerBooking): string {
  const staff = booking.serviceStaffAssignments
    ?.map((entry) => entry.name)
    .filter(Boolean)
    .join(', ');
  if (staff) return staff;
  if (typeof booking.assignedDetailer === 'object') return booking.assignedDetailer?.name || 'To be assigned';
  return booking.assignedDetailer || 'To be assigned';
}

function matchesReference(booking: CustomerBooking, targetReference?: string): boolean {
  if (!targetReference) return false;
  const target = targetReference.trim().toLowerCase();
  return [
    booking.bookingReference,
    booking.orderNumber,
    booking._id,
    booking.id,
  ].some((value) => String(value || '').trim().toLowerCase() === target);
}

function SectionLabel({ label, aside }: { label: string; aside?: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.10)]" />
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</p>
      <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
      {aside && (
        <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{aside}</p>
      )}
    </div>
  );
}

export function CustomerBookingsSection({
  bookings,
  activeFilter,
  highlightedAppointmentRef,
  onFilterChange,
  onNewBooking,
  onTrackService,
  onViewReceipt,
  onCancelBooking,
  registerBookingRef,
}: CustomerBookingsSectionProps) {
  const [toastVisible, setToastVisible] = useState(true);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const categorizedBookings = useMemo(() => {
    const grouped = {
      upcoming: [] as CustomerBooking[],
      active: [] as CustomerBooking[],
      completed: [] as CustomerBooking[],
      cancelled: [] as CustomerBooking[],
    };

    bookings.forEach((booking) => {
      grouped[categoryForBooking(booking)].push(booking);
    });

    grouped.upcoming.sort((a, b) => bookingTimestamp(a) - bookingTimestamp(b));
    grouped.active.sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a));
    grouped.completed.sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a));
    grouped.cancelled.sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a));
    return grouped;
  }, [bookings]);

  const counts = {
    all: bookings.length,
    upcoming: categorizedBookings.upcoming.length,
    active: categorizedBookings.active.length,
    completed: categorizedBookings.completed.length,
    cancelled: categorizedBookings.cancelled.length,
  };

  const heroBooking = activeFilter === 'active'
    ? categorizedBookings.active[0]
    : activeFilter === 'upcoming'
      ? categorizedBookings.upcoming[0]
      : activeFilter === 'all'
        ? categorizedBookings.active[0] || categorizedBookings.upcoming[0]
        : undefined;

  const historyBookings = activeFilter === 'completed'
    ? categorizedBookings.completed
    : activeFilter === 'cancelled'
      ? categorizedBookings.cancelled
      : activeFilter === 'all'
        ? [...categorizedBookings.completed, ...categorizedBookings.cancelled]
          .sort((a, b) => bookingTimestamp(b) - bookingTimestamp(a))
        : [];

  const confirmedBooking = categorizedBookings.upcoming.find(
    (booking) => normalizeStatus(booking.status) === 'confirmed',
  );
  const showConfirmationToast = toastVisible
    && Boolean(confirmedBooking)
    && (activeFilter === 'all' || activeFilter === 'upcoming');
  const nextAppointment = categorizedBookings.upcoming[0];
  const progressIndex = heroBooking ? progressIndexForBooking(heroBooking) : 0;
  const heroReference = heroBooking ? appointmentReference(heroBooking) : '';
  const heroId = heroBooking ? bookingId(heroBooking) : '';
  const heroExpanded = heroId === expandedBookingId;
  const heroCancelling = heroId === cancelConfirmId;
  const heroCanCancel = heroBooking
    ? ['pending', 'pending_confirmation', 'confirmed', 'approved'].includes(normalizeStatus(heroBooking.status))
    : false;
  const heroTone = heroBooking ? statusTone(heroBooking) : null;
  const heroService = heroBooking ? serviceSummary(heroBooking) : null;
  const nextStep = PROGRESS_STEPS[Math.min(progressIndex + 1, PROGRESS_STEPS.length - 1)];

  const renderEmptyState = () => {
    if (activeFilter === 'active') {
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-white/90 px-6 py-12 text-center shadow-[0_16px_42px_-36px_rgba(15,23,42,0.42)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
            <Car className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-medium text-slate-900">No vehicles currently in service</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Your confirmed booking will appear here once your vehicle is dropped off.
          </p>
        </div>
      );
    }

    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-white/90 px-6 py-12 text-center shadow-[0_16px_42px_-36px_rgba(15,23,42,0.42)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
          <CalendarDays className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-medium text-slate-900">
          {activeFilter === 'all' ? 'No bookings yet' : `No ${activeFilter} bookings`}
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          {activeFilter === 'all'
            ? 'Schedule your first AutoSPF+ service appointment to get started.'
            : 'There are no bookings in this category right now.'}
        </p>
        <button
          type="button"
          onClick={onNewBooking}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          New booking
        </button>
      </div>
    );
  };

  return (
    <div className="customer-content-fade-in mx-auto w-full max-w-[1280px] space-y-5 pb-12 pt-1">
      <header className="relative overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/80 px-5 pb-14 pt-6 shadow-[0_30px_80px_-50px_rgba(37,99,235,0.34)] sm:px-7 sm:pt-7">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-36 w-72 rounded-full bg-sky-100/65 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-[28%] h-px w-1/2 bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <Sparkles className="h-3.5 w-3.5" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">
                AutoSPF+ service portfolio · {counts.all} records
              </p>
            </div>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[34px]">My Bookings</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              A private record of every reservation, studio visit, and completed service journey.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-blue-100 bg-white/90 px-4 py-3 shadow-[0_14px_34px_-28px_rgba(37,99,235,0.35)] backdrop-blur-xl">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-500">Next appointment</p>
                <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-700">
                  {nextAppointment ? formatSchedule(nextAppointment) : 'No upcoming appointment'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onNewBooking}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-semibold text-white shadow-[0_16px_34px_-18px_rgba(37,99,235,0.95)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/25 motion-reduce:transform-none"
            >
              <Plus className="h-4 w-4" />
              New booking
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 -mt-10 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[760px] grid-cols-5 gap-2.5">
          {FILTERS.map((filter) => {
            const selected = activeFilter === filter;
            const meta = FILTER_META[filter];
            const FilterIcon = meta.icon;
            return (
              <button
                type="button"
                key={filter}
                aria-pressed={selected}
                onClick={() => onFilterChange(filter)}
                className={cn(
                  'group min-h-[104px] rounded-2xl border px-4 py-3 text-left shadow-[0_18px_38px_-30px_rgba(15,23,42,0.7)] transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15',
                  selected
                    ? 'border-blue-500 bg-blue-600 text-white shadow-[0_22px_44px_-28px_rgba(37,99,235,0.95)]'
                    : 'border-slate-200/90 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_44px_-30px_rgba(37,99,235,0.28)] motion-reduce:transform-none',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl border transition-colors',
                    selected
                      ? 'border-white/15 bg-white/10 text-white'
                      : 'border-slate-200 bg-slate-50 text-blue-600 group-hover:border-blue-100 group-hover:bg-blue-50',
                  )}>
                    <FilterIcon className="h-4 w-4" />
                  </span>
                  <span className={cn(
                    'text-[28px] font-semibold leading-none tracking-[-0.05em]',
                    selected ? 'text-white' : 'text-slate-950',
                  )}>{counts[filter]}</span>
                </div>
                <p className={cn(
                  'mt-3 text-[10px] font-semibold uppercase tracking-[0.13em]',
                  selected ? 'text-blue-100' : 'text-slate-600',
                )}>{filter === 'all' ? 'All bookings' : FILTER_LABELS[filter]}</p>
                <p className={cn('mt-0.5 text-[10px]', selected ? 'text-blue-200' : 'text-slate-400')}>{meta.caption}</p>
              </button>
            );
          })}
        </div>
      </div>

      {showConfirmationToast && (
        <div className="flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/90 to-white px-4 py-3 shadow-[0_14px_34px_-32px_rgba(37,99,235,0.45)]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-blue-100">
            <Info className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900">Booking confirmed</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Your reservation is secured. We’ll contact you once the studio schedule is finalized.</p>
          </div>
          <button
            type="button"
            onClick={() => setToastVisible(false)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            Got it
          </button>
        </div>
      )}

      {heroBooking && (
        <section className="space-y-3">
          <SectionLabel label="Live service journey" aside={`Stage ${progressIndex + 1} of ${PROGRESS_STEPS.length}`} />

          <div
            ref={(element) => registerBookingRef?.(heroReference, element)}
            data-appointment-ref={heroReference || undefined}
            className={cn(
              'relative overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_26px_70px_-42px_rgba(15,23,42,0.58)] transition-shadow hover:shadow-[0_32px_80px_-42px_rgba(37,99,235,0.24)]',
              matchesReference(heroBooking, highlightedAppointmentRef) && 'ring-4 ring-blue-500/15',
            )}
            style={{ scrollMarginTop: 76 }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_18%_0%,rgba(37,99,235,0.08),transparent_68%)]" />
            <div className={cn('absolute inset-y-0 left-0 w-1.5', heroTone?.rail || 'bg-blue-600')} />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />

            {heroCancelling && (
              <div className="flex flex-col gap-3 border-b border-rose-100 bg-rose-50/80 py-3 pl-7 pr-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <p className="text-xs font-medium text-rose-800">Cancel this booking?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelConfirmId(null)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onCancelBooking(heroBooking);
                      setCancelConfirmId(null);
                    }}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-rose-700"
                  >
                    Yes, cancel
                  </button>
                </div>
              </div>
            )}

            <div className="relative py-5 pl-8 pr-6 sm:pr-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest',
                      heroTone?.badge || 'border-blue-200 bg-blue-50 text-blue-700',
                    )}>
                      <span className={cn('h-1.5 w-1.5 animate-pulse rounded-full', heroTone?.dot || 'bg-blue-600')} />
                      {statusLabel(heroBooking)}
                    </span>
                    <span className="font-mono text-[10px] font-medium text-slate-400">
                      #{heroReference || heroId.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.025em] text-slate-950">{heroService?.primary}</h2>
                    {Boolean(heroService?.additionalCount) && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        +{heroService?.additionalCount} service
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Car className="h-3.5 w-3.5 text-blue-500" />
                    {vehicleTitle(heroBooking)}
                  </p>
                  <p className="mt-0.5 pl-5 text-[11px] text-slate-400">{vehicleDetailLabel(heroBooking)}</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-blue-500 bg-gradient-to-br from-blue-600 to-blue-500 px-5 py-4 text-left shadow-[0_18px_38px_-24px_rgba(37,99,235,0.68)] sm:min-w-[190px] sm:text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-100">Service total</p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] text-white">
                    {formatCurrency(amountForBooking(heroBooking))}
                  </p>
                  <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-blue-100/80">Reserved service value</p>
                </div>
              </div>

              <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    label: 'Schedule',
                    icon: CalendarDays,
                    value: formatSchedule(heroBooking),
                  },
                  {
                    label: 'Payment',
                    icon: CreditCard,
                    value: paymentLabel(heroBooking),
                  },
                  {
                    label: 'Next step',
                    icon: ArrowRight,
                    value: progressIndex === PROGRESS_STEPS.length - 1 ? 'Vehicle ready for pickup' : nextStep,
                  },
                ].map((meta) => (
                  <div
                    key={meta.label}
                    className="min-w-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.72)]"
                  >
                    <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                      <meta.icon className="h-3 w-3 text-blue-500" />
                      {meta.label}
                    </p>
                    <p className="mt-1.5 truncate text-[12px] font-semibold text-slate-700">{meta.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 overflow-hidden rounded-[18px] border border-blue-100 bg-gradient-to-r from-blue-50/90 via-white to-blue-50/70 px-5 py-4 shadow-[0_20px_46px_-38px_rgba(37,99,235,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Live journey console</p>
                    <p className="mt-1 text-[11px] text-slate-500">Your vehicle’s current studio progression</p>
                  </div>
                  <p className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-700 shadow-sm">
                    Stage {progressIndex + 1} of {PROGRESS_STEPS.length}
                  </p>
                </div>

                <div className="mt-3 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="grid min-w-[540px] grid-cols-5">
                    {PROGRESS_STEPS.map((step, index) => {
                      const done = index < progressIndex;
                      const current = index === progressIndex;
                      return (
                        <div key={step} className="relative flex min-w-0 flex-col items-center">
                          {index < PROGRESS_STEPS.length - 1 && (
                            <span className={cn(
                              'absolute left-[calc(50%+15px)] right-[calc(-50%+15px)] top-[13px] h-0.5 rounded-full',
                              index < progressIndex ? 'bg-blue-500' : 'bg-blue-100',
                            )} />
                          )}
                          <span className={cn(
                            'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold shadow-sm',
                            done && 'border-blue-500 bg-blue-500 text-white',
                            current && 'border-blue-400 bg-blue-500 text-white ring-4 ring-blue-500/20',
                            !done && !current && 'border-blue-200 bg-white text-slate-400',
                          )}>
                            {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                          </span>
                          <p className={cn(
                            'mt-2 w-full truncate px-1 text-center text-[9px] font-medium tracking-wide',
                            done && 'text-blue-600',
                            current && 'text-blue-700',
                            !done && !current && 'text-slate-400',
                          )}>
                            {step}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {heroExpanded && (
                <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Last update</p>
                    <p className="mt-1 font-medium text-slate-700">{lastUpdateLabel(heroBooking)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Assigned team</p>
                    <p className="mt-1 font-medium text-slate-700">{assignedTeamLabel(heroBooking)}</p>
                  </div>
                  {heroBooking.notes && (
                    <div className="sm:col-span-2">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Appointment notes</p>
                      <p className="mt-1 leading-5 text-slate-600">{heroBooking.notes}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {heroCanCancel && (
                    <button
                      type="button"
                      onClick={() => setCancelConfirmId(heroId)}
                      className="rounded-full px-3 py-2 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      Cancel booking
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {hasReceipt(heroBooking) && (
                    <button
                      type="button"
                      onClick={() => onViewReceipt(heroId)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                    >
                      View receipt
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedBookingId(heroExpanded ? null : heroId)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                  >
                    {heroExpanded ? 'Hide details' : 'View details'}
                  </button>
                  <button
                    type="button"
                    onClick={onTrackService}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-[11px] font-semibold text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.95)] transition hover:-translate-y-0.5 hover:bg-blue-500 motion-reduce:transform-none"
                  >
                    Track service
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {historyBookings.length > 0 && (
        <section className="space-y-3">
          <SectionLabel label="Service archive" aside={`${historyBookings.length} records`} />
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {historyBookings.map((booking) => {
              const id = bookingId(booking);
              const reference = appointmentReference(booking);
              const status = normalizeStatus(booking.status);
              const category = categoryForBooking(booking);
              const rejected = ['rejected', 'not_approved', 'failed'].includes(status);
              const cancelled = status === 'cancelled';
              const completed = category === 'completed';
              const expanded = expandedBookingId === id;
              const receiptAvailable = completed && !rejected && !cancelled && hasReceipt(booking);
              const tone = statusTone(booking);
              const summary = serviceSummary(booking);
              const paymentPending = !rejected
                && !cancelled
                && normalizeStatus(booking.paymentStatus) !== 'paid';

              return (
                <article
                  key={id}
                  ref={(element) => registerBookingRef?.(reference, element)}
                  data-appointment-ref={reference || undefined}
                  className={cn(
                    'relative flex flex-col gap-3 overflow-hidden rounded-[20px] border bg-[linear-gradient(145deg,#ffffff_0%,#ffffff_72%,#f8fafc_100%)] py-4 pl-6 pr-5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.56)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_58px_-38px_rgba(15,23,42,0.6)] motion-reduce:transform-none',
                    rejected || cancelled
                      ? 'border-rose-200/90 hover:border-rose-300'
                      : 'border-slate-200/90 hover:border-blue-200',
                    matchesReference(booking, highlightedAppointmentRef) && 'ring-4 ring-blue-500/15',
                  )}
                  style={{ scrollMarginTop: 76 }}
                >
                  <span className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} />
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest',
                        tone.badge,
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                        {statusLabel(booking)}
                      </span>
                      {paymentPending && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest text-amber-700">
                          Payment pending
                        </span>
                      )}
                      {completed && receiptAvailable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500">
                          <ReceiptText className="h-2.5 w-2.5" />
                          Receipt
                        </span>
                      )}
                      {(rejected || cancelled) && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-500">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {booking.rejectionReason || (cancelled
                            ? 'This appointment was cancelled.'
                            : 'This booking was not approved. You can submit a new request.')}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">Service value</p>
                      <p className="mt-1 text-sm font-semibold tracking-tight text-slate-950">{formatCurrency(amountForBooking(booking))}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-[0_12px_26px_-20px_rgba(37,99,235,0.45)]">
                      <Car className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-[14px] font-semibold tracking-tight text-slate-950">{summary.primary}</h3>
                        {summary.additionalCount > 0 && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                            +{summary.additionalCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] font-medium text-slate-500">#{reference || id.slice(-8).toUpperCase()}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3.5 py-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Vehicle</p>
                      <p className="mt-1 truncate text-[11px] font-medium text-slate-600">{vehicleTitle(booking)}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">{vehicleDetailLabel(booking)}</p>
                    </div>
                    <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                        <Clock3 className="h-3 w-3" />
                        Schedule
                      </p>
                      <p className="mt-1 truncate text-[11px] font-medium text-slate-600">{formatSchedule(booking)}</p>
                    </div>
                  </div>

                  {expanded && (
                    <div className="grid gap-3 rounded-lg border border-slate-100 bg-white p-3 text-[11px] sm:grid-cols-2">
                      <div>
                        <p className="font-medium uppercase tracking-widest text-slate-400">Last update</p>
                        <p className="mt-1 text-slate-600">{lastUpdateLabel(booking)}</p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-widest text-slate-400">Assigned team</p>
                        <p className="mt-1 text-slate-600">{assignedTeamLabel(booking)}</p>
                      </div>
                      {booking.notes && (
                        <p className="leading-5 text-slate-600 sm:col-span-2">{booking.notes}</p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-1.5 border-t border-slate-100 pt-3">
                    {receiptAvailable && (
                      <button
                        type="button"
                        onClick={() => onViewReceipt(id)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                      >
                        <ReceiptText className="h-3 w-3" />
                        View receipt
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedBookingId(expanded ? null : id)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                    >
                      {expanded ? 'Hide details' : 'View details'}
                    </button>
                    <button
                      type="button"
                      onClick={onNewBooking}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-[10px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-600 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Book again
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!heroBooking && historyBookings.length === 0 && renderEmptyState()}
    </div>
  );
}
