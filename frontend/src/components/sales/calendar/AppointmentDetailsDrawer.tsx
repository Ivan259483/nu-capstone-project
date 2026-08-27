import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Hash,
  Loader2,
  Mail,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  UserRound,
  UserRoundCog,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import api from '@/lib/api';
import { normalizeBooking, OrderService } from '@/lib/order-service';
import { formatPeso } from '@/lib/salesData';
import { rejectBooking } from './calendarService';
import {
  getAppointmentStatusMeta,
  normalizeAppointmentStatus,
  type AppointmentStatus,
} from './calendarStatus';
import type { CalendarBooking } from './calendarTypes';

interface ContactRecord {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
}

interface StaffAssignment {
  name?: string;
  role?: string;
}

interface AppointmentRecord extends CalendarBooking {
  customer?: ContactRecord | string | null;
  customerId?: string;
  customerEmail?: string;
  vehicleInfo?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  notes?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paidAt?: string;
  serviceTotal?: number;
  amountCollected?: number;
  assignedDetailer?: ContactRecord | string | null;
  serviceStaffAssignments?: StaffAssignment[];
}

interface ActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

type ActionKey =
  | 'approve'
  | 'reject'
  | 'confirm'
  | 'cancel'
  | 'start'
  | 'complete';

type ConfirmMode = 'reject' | 'cancel' | null;

export interface AppointmentDetailsDrawerProps {
  booking: CalendarBooking;
  onClose: () => void;
  onChanged: (updated?: CalendarBooking) => void;
  onRequestReschedule?: (booking: CalendarBooking) => void;
  readOnly?: boolean;
}

const RESCHEDULABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'pending_confirmation',
  'approved',
  'confirmed',
  'assigned',
  'queued',
]);

/**
 * Cancellation is intentionally limited to appointments that have not entered
 * physical service. The update endpoint supports these Admin transitions and
 * releases the reserved slot when the status becomes cancelled.
 */
const CANCELLABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'pending_confirmation',
  'pending',
  'approved',
  'confirmed',
  'assigned',
  'queued',
]);

const FALLBACK_STATUS_META = {
  label: 'Unknown',
  bg: '#f8fafc',
  text: '#475569',
  border: '#e2e8f0',
  dot: '#94a3b8',
};

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAppointmentDate(value?: string): string | null {
  const input = nonEmpty(value);
  if (!input) return null;

  const ymd = input.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(input);

  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAppointmentTime(value?: string): string | null {
  const input = nonEmpty(value);
  if (!input) return null;

  const match = input.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return input;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return input;

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const responseMessage = (
      error as { response?: { data?: { message?: unknown; error?: unknown } } }
    ).response?.data;
    const message = nonEmpty(responseMessage?.message) || nonEmpty(responseMessage?.error);
    if (message) return message;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function toAppointmentRecord(
  raw: unknown,
  fallback: AppointmentRecord,
): AppointmentRecord {
  if (!raw || typeof raw !== 'object') return fallback;

  const normalized = normalizeBooking(raw) as unknown as AppointmentRecord;
  return {
    ...fallback,
    ...normalized,
    _id: normalized._id || normalized.id || fallback._id,
    customerName: normalized.customerName || fallback.customerName,
    customerPhone: normalized.customerPhone || fallback.customerPhone,
    customer: normalized.customer || fallback.customer,
    assignedDetailer: normalized.assignedDetailer ?? fallback.assignedDetailer,
    serviceStaffAssignments:
      normalized.serviceStaffAssignments ?? fallback.serviceStaffAssignments,
  };
}

function DetailRow({
  icon,
  label,
  value,
  valueClassName = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {label}
        </p>
        <div className={`mt-0.5 break-words text-sm font-medium text-slate-800 ${valueClassName}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        {title}
      </h3>
      <div className="mt-1 divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading appointment details">
      {[3, 2, 2].map((rows, sectionIndex) => (
        <div
          key={sectionIndex}
          className="animate-pulse rounded-2xl border border-slate-100 bg-white px-4 py-4"
        >
          <div className="mb-4 h-2.5 w-24 rounded-full bg-slate-100" />
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="mb-3 flex items-center gap-3 last:mb-0">
              <div className="h-8 w-8 rounded-lg bg-slate-100" />
              <div className="flex-1">
                <div className="h-2 w-16 rounded-full bg-slate-100" />
                <div className="mt-2 h-3 w-3/5 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AppointmentDetailsDrawer({
  booking,
  onClose,
  onChanged,
  onRequestReschedule,
  readOnly = false,
}: AppointmentDetailsDrawerProps) {
  const bookingId = booking._id || booking.id || '';
  const fallbackRef = useRef<AppointmentRecord>(booking as AppointmentRecord);
  fallbackRef.current = booking as AppointmentRecord;

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [details, setDetails] = useState<AppointmentRecord>(booking as AppointmentRecord);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<ActionKey | null>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [rejectReason, setRejectReason] = useState('');
  const actioningRef = useRef(false);
  actioningRef.current = Boolean(actionKey);

  const requestLatest = useCallback(async (): Promise<AppointmentRecord> => {
    if (!bookingId) throw new Error('This appointment does not have a valid booking ID.');

    const response = await OrderService.getOrderById(bookingId);
    if (!response?.success || !response.data) {
      throw new Error(response?.message || 'Appointment details are unavailable.');
    }

    return toAppointmentRecord(response.data, fallbackRef.current);
  }, [bookingId]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const latest = await requestLatest();
      setDetails(latest);
    } catch (error) {
      const message = extractErrorMessage(error, 'Could not load appointment details.');
      setLoadError(message);
      toast.error('Could not load appointment', { description: message });
    } finally {
      setLoading(false);
    }
  }, [requestLatest]);

  useEffect(() => {
    let active = true;
    setDetails(booking as AppointmentRecord);
    setLoading(true);
    setLoadError(null);
    setConfirmMode(null);
    setRejectReason('');

    requestLatest()
      .then((latest) => {
        if (active) setDetails(latest);
      })
      .catch((error) => {
        if (!active) return;
        const message = extractErrorMessage(error, 'Could not load appointment details.');
        setLoadError(message);
        toast.error('Could not load appointment', { description: message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId, requestLatest]);

  useEffect(() => {
    setDetails((current) => ({ ...current, ...booking } as AppointmentRecord));
  }, [booking]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actioningRef.current) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const status = normalizeAppointmentStatus(details.status);
  const statusMeta = getAppointmentStatusMeta(details.status) ?? {
    ...FALLBACK_STATUS_META,
    label: nonEmpty(details.status) ? titleCase(details.status) : FALLBACK_STATUS_META.label,
  };

  useEffect(() => {
    setConfirmMode(null);
    setRejectReason('');
  }, [status]);

  const customer =
    details.customer && typeof details.customer === 'object' ? details.customer : null;
  const customerName =
    nonEmpty(details.customerName) || nonEmpty(customer?.name) || 'Customer';
  const customerPhone = nonEmpty(details.customerPhone) || nonEmpty(customer?.phone);
  const customerEmail = nonEmpty(details.customerEmail) || nonEmpty(customer?.email);

  const appointmentDate = formatAppointmentDate(details.bookingDate || details.date);
  const appointmentTime = formatAppointmentTime(details.bookingTime || details.time);
  const bookingLabel =
    nonEmpty(details.orderNumber) ||
    nonEmpty(details.bookingReference) ||
    nonEmpty(details._id) ||
    nonEmpty(details.id);

  const vehicleDescription =
    nonEmpty(details.vehicleInfo) ||
    [
      nonEmpty(details.vehicleYear),
      nonEmpty(details.vehicleMake),
      nonEmpty(details.vehicleModel),
      nonEmpty(details.vehicleType),
    ]
      .filter(Boolean)
      .join(' ') ||
    null;
  const plateNumber = nonEmpty(details.vehiclePlate);
  const serviceName = nonEmpty(details.serviceName) || nonEmpty(details.serviceType);
  const notes = nonEmpty(details.notes);

  const assignedDetailer =
    details.assignedDetailer && typeof details.assignedDetailer === 'object'
      ? nonEmpty(details.assignedDetailer.name)
      : null;
  const staffNames = Array.isArray(details.serviceStaffAssignments)
    ? details.serviceStaffAssignments
        .map((assignment) => nonEmpty(assignment?.name))
        .filter((name): name is string => Boolean(name))
    : [];
  const technicianName = assignedDetailer || (staffNames.length ? staffNames.join(', ') : null);

  const paymentStatus = nonEmpty(details.paymentStatus);
  const paymentMethod = nonEmpty(details.paymentMethod);
  const paymentProvider = nonEmpty(details.paymentProvider);
  const paymentAmount = useMemo(() => {
    const candidates = [details.totalAmount, details.totalPrice, details.serviceTotal];
    return candidates.find((value) => typeof value === 'number' && Number.isFinite(value));
  }, [details.serviceTotal, details.totalAmount, details.totalPrice]);
  const hasPaymentDetails = Boolean(
    paymentStatus || paymentMethod || paymentProvider || paymentAmount !== undefined,
  );

  const canReschedule = Boolean(
    !readOnly && status && onRequestReschedule && RESCHEDULABLE_STATUSES.has(status),
  );
  const canCancel = Boolean(!readOnly && status && CANCELLABLE_STATUSES.has(status));
  const hasPrimaryAction =
    !readOnly && (
      status === 'pending_confirmation' ||
      status === 'pending' ||
      status === 'received' ||
      status === 'in_progress'
    );
  const hasActions = hasPrimaryAction || canReschedule || canCancel;
  const isActioning = Boolean(actionKey);

  const runAction = useCallback(
    async (
      key: ActionKey,
      request: () => Promise<ActionResult>,
      successTitle: string,
    ) => {
      setActionKey(key);
      try {
        const result = await request();
        if (result?.success !== true) {
          throw new Error(result?.message || result?.error || 'The appointment could not be updated.');
        }

        let updated = result.data
          ? toAppointmentRecord(result.data, details)
          : details;
        setDetails(updated);

        try {
          updated = await requestLatest();
          setDetails(updated);
        } catch {
          // The mutation response still contains the updated order. Parent
          // refresh remains authoritative if the follow-up detail fetch fails.
        }

        setConfirmMode(null);
        setRejectReason('');
        onChanged(updated);
        toast.success(successTitle, {
          description: result.message || 'The calendar has been updated.',
        });
      } catch (error) {
        const message = extractErrorMessage(error, 'The appointment could not be updated.');
        toast.error('Appointment update failed', { description: message });
      } finally {
        setActionKey(null);
      }
    },
    [details, onChanged, requestLatest],
  );

  const handleApprove = () => {
    setConfirmMode(null);
    window.dispatchEvent(new CustomEvent('sales:navigate-approval', { detail: { orderId: bookingId } }));
  };

  const handleReject = () =>
    runAction(
      'reject',
      () => rejectBooking(bookingId, rejectReason) as Promise<ActionResult>,
      'Appointment rejected',
    );

  const handleLegacyConfirm = () =>
    runAction(
      'confirm',
      async () => {
        const response = await api.post(`/orders/${bookingId}/confirm`, {});
        return response.data as ActionResult;
      },
      'Appointment confirmed',
    );

  const handleCancel = () =>
    runAction(
      'cancel',
      () => OrderService.updateOrder(bookingId, { status: 'cancelled' }) as Promise<ActionResult>,
      'Appointment cancelled',
    );

  const handleStart = () =>
    runAction(
      'start',
      () => OrderService.operateStartService(bookingId) as Promise<ActionResult>,
      'Service started',
    );

  const handleComplete = () =>
    runAction(
      'complete',
      () => OrderService.operateQCComplete(bookingId) as Promise<ActionResult>,
      'Service completed',
    );

  if (typeof document === 'undefined') return null;

  const drawer = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[300] cursor-default border-0 bg-slate-950/15 backdrop-blur-[1px] transition-colors hover:bg-slate-950/20"
        aria-label="Close appointment details"
        onClick={() => {
          if (!isActioning) onClose();
        }}
      />

      <aside
        className="fixed inset-y-0 right-0 z-[320] flex w-full flex-col overflow-hidden bg-slate-50 shadow-[-18px_0_48px_-20px_rgba(15,23,42,0.3)] sm:w-[94vw] sm:rounded-l-2xl lg:w-[min(520px,94vw)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-details-title"
      >
        <header className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays size={19} />
              </div>
              <div className="min-w-0">
                <h2
                  id="appointment-details-title"
                  className="text-base font-bold text-slate-950"
                >
                  Appointment Details
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {bookingLabel || customerName}
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              disabled={isActioning}
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close appointment details"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{customerName}</p>
              {(appointmentDate || appointmentTime) && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[appointmentDate, appointmentTime].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
              style={{
                backgroundColor: statusMeta.bg,
                color: statusMeta.text,
                borderColor: statusMeta.border,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: statusMeta.dot }}
              />
              {statusMeta.label}
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <DrawerSkeleton />
          ) : loadError ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-rose-100 bg-white px-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                <AlertCircle size={20} />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Details unavailable</h3>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={loadLatest}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Section title="Appointment">
                {bookingLabel && (
                  <DetailRow
                    icon={<Hash size={15} />}
                    label="Booking ID"
                    value={bookingLabel}
                    valueClassName="font-mono text-xs"
                  />
                )}
                {appointmentDate && (
                  <DetailRow
                    icon={<CalendarDays size={15} />}
                    label="Date"
                    value={appointmentDate}
                  />
                )}
                {appointmentTime && (
                  <DetailRow icon={<Clock3 size={15} />} label="Time" value={appointmentTime} />
                )}
                {serviceName && (
                  <DetailRow icon={<Wrench size={15} />} label="Service" value={serviceName} />
                )}
                <DetailRow
                  icon={<BadgeCheck size={15} />}
                  label="Status"
                  value={statusMeta.label}
                />
              </Section>

              <Section title="Customer">
                <DetailRow icon={<UserRound size={15} />} label="Customer" value={customerName} />
                {customerPhone && (
                  <DetailRow
                    icon={<Phone size={15} />}
                    label="Phone"
                    value={
                      <a
                        href={`tel:${customerPhone}`}
                        className="text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        {customerPhone}
                      </a>
                    }
                  />
                )}
                {customerEmail && (
                  <DetailRow
                    icon={<Mail size={15} />}
                    label="Email"
                    value={
                      <a
                        href={`mailto:${customerEmail}`}
                        className="text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        {customerEmail}
                      </a>
                    }
                  />
                )}
              </Section>

              {(vehicleDescription || plateNumber) && (
                <Section title="Vehicle">
                  {vehicleDescription && (
                    <DetailRow
                      icon={<CarFront size={15} />}
                      label="Vehicle"
                      value={vehicleDescription}
                    />
                  )}
                  {plateNumber && (
                    <DetailRow
                      icon={<Hash size={15} />}
                      label="Plate Number"
                      value={plateNumber}
                      valueClassName="uppercase tracking-wide"
                    />
                  )}
                </Section>
              )}

              {technicianName && (
                <Section title="Assignment">
                  <DetailRow
                    icon={<UserRoundCog size={15} />}
                    label="Technician"
                    value={technicianName}
                  />
                </Section>
              )}

              {hasPaymentDetails && (
                <Section title="Payment">
                  {paymentStatus && (
                    <DetailRow
                      icon={<CircleDollarSign size={15} />}
                      label="Payment Status"
                      value={titleCase(paymentStatus)}
                    />
                  )}
                  {paymentAmount !== undefined && (
                    <DetailRow
                      icon={<CircleDollarSign size={15} />}
                      label="Total"
                      value={formatPeso(paymentAmount)}
                    />
                  )}
                  {paymentMethod && (
                    <DetailRow
                      icon={<CircleDollarSign size={15} />}
                      label="Payment Method"
                      value={titleCase(paymentMethod)}
                    />
                  )}
                  {paymentProvider && paymentProvider !== paymentMethod && (
                    <DetailRow
                      icon={<CircleDollarSign size={15} />}
                      label="Provider"
                      value={titleCase(paymentProvider)}
                    />
                  )}
                </Section>
              )}

              {notes && (
                <Section title="Notes">
                  <DetailRow
                    icon={<FileText size={15} />}
                    label="Appointment Notes"
                    value={<p className="whitespace-pre-wrap leading-5">{notes}</p>}
                  />
                </Section>
              )}
            </div>
          )}
        </div>

        {!loading && !loadError && hasActions && (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            {confirmMode === 'reject' && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                <p className="text-xs font-bold text-rose-900">Reject this appointment?</p>
                <p className="mt-0.5 text-[11px] leading-4 text-rose-700">
                  The customer will be notified. Add a helpful reason when available.
                </p>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  disabled={isActioning}
                  rows={2}
                  maxLength={500}
                  placeholder="Reason for rejection (optional)"
                  className="mt-2 w-full resize-none rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-rose-300 focus:ring-2 focus:ring-rose-200/60 disabled:opacity-60"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => {
                      setConfirmMode(null);
                      setRejectReason('');
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={handleReject}
                    className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    Reject
                  </button>
                </div>
              </div>
            )}

            {confirmMode === 'cancel' && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                <p className="text-xs font-bold text-rose-900">Cancel this appointment?</p>
                <p className="mt-0.5 text-[11px] leading-4 text-rose-700">
                  This changes the booking status to Cancelled and releases its reserved appointment time.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => setConfirmMode(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    Keep Appointment
                  </button>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={handleCancel}
                    className="inline-flex min-w-32 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === 'cancel' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    Cancel Appointment
                  </button>
                </div>
              </div>
            )}

            {!confirmMode && (
              <div className="flex flex-wrap justify-end gap-2">
                {canReschedule && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => onRequestReschedule?.(details)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw size={13} /> Reschedule
                  </button>
                )}

                {canCancel && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => setConfirmMode('cancel')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XCircle size={13} /> Cancel
                  </button>
                )}

                {status === 'pending_confirmation' && (
                  <>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => setConfirmMode('reject')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={handleApprove}
                      className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionKey === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      Review Payment
                    </button>
                  </>
                )}

                {status === 'pending' && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={handleLegacyConfirm}
                    className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === 'confirm' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Confirm
                  </button>
                )}

                {status === 'received' && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={handleStart}
                    className="inline-flex min-w-28 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Start Service
                  </button>
                )}

                {status === 'in_progress' && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={handleComplete}
                    className="inline-flex min-w-32 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === 'complete' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Mark Completed
                  </button>
                )}
              </div>
            )}
          </footer>
        )}
      </aside>
    </>
  );

  return createPortal(drawer, document.body);
}
