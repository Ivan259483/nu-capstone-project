import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CalendarPlus2,
  Car,
  CheckCircle2,
  Clock3,
  Loader2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DetailService } from '@/lib/detail-service-api';
import { OrderService } from '@/lib/order-service';
import { UserService } from '@/lib/user-service';
import { VehicleService } from '@/lib/vehicle-service';
import { fetchSlotsByDate, type SlotDetail } from './calendarService';

interface AdminNewAppointmentNoticeProps {
  selectedDate?: Date | null;
  onClose: () => void;
  onCreated: (bookingDate: string) => void | Promise<void>;
}

interface DirectoryCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface CustomerVehicle {
  id: string;
  year?: string | number;
  make?: string;
  model?: string;
  plateNumber?: string;
  vehicleType?: string;
}

interface PublishedService {
  id: string;
  name: string;
  duration?: string | number;
}

interface ValidatedSlot extends SlotDetail {
  label: string;
  selectable: boolean;
  isPast: boolean;
}

const SLOT_STATUSES = new Set<SlotDetail['status']>([
  'AVAILABLE',
  'ALMOST_FULL',
  'FULL',
  'OVER_CAPACITY',
  'ELAPSED',
]);

const inputClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

function initialDateKey(selectedDate?: Date | null): string {
  if (!selectedDate || Number.isNaN(selectedDate.getTime())) return todayKey();
  return dateKey(selectedDate);
}

function idOf(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as { id?: unknown; _id?: unknown };
  const id = record.id ?? record._id;
  return typeof id === 'string' ? id.trim() : '';
}

function errorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const candidate = error as {
    message?: unknown;
    response?: { data?: { message?: unknown; error?: unknown } };
  };
  const apiMessage = candidate.response?.data?.message ?? candidate.response?.data?.error;
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
  return typeof candidate.message === 'string' && candidate.message.trim()
    ? candidate.message.trim()
    : fallback;
}

function formatDateLabel(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
}

function validateSlots(
  payload: unknown,
  requestedDate: string,
): { isClosed: boolean; slots: ValidatedSlot[]; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { isClosed: true, slots: [], error: 'Availability could not be verified.' };
  }

  const result = payload as { date?: unknown; isClosed?: unknown; slots?: unknown };
  if (result.date !== requestedDate || typeof result.isClosed !== 'boolean') {
    return { isClosed: true, slots: [], error: 'The server returned malformed availability.' };
  }
  if (result.isClosed) return { isClosed: true, slots: [] };
  if (!Array.isArray(result.slots)) {
    return { isClosed: true, slots: [], error: 'The server returned malformed time slots.' };
  }

  const seen = new Set<string>();
  const validated: ValidatedSlot[] = [];

  for (const raw of result.slots) {
    if (!raw || typeof raw !== 'object') {
      return { isClosed: true, slots: [], error: 'The server returned malformed time slots.' };
    }

    const slot = raw as Record<string, unknown>;
    const time = typeof slot.time === 'string' ? slot.time.trim() : '';
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    const capacity = slot.capacity;
    const booked = slot.booked;
    const available = slot.available;
    const status = slot.status;

    if (
      !timeMatch
      || seen.has(time)
      || typeof capacity !== 'number'
      || !Number.isInteger(capacity)
      || capacity < 0
      || typeof booked !== 'number'
      || !Number.isInteger(booked)
      || booked < 0
      || typeof available !== 'number'
      || !Number.isInteger(available)
      || available < 0
      || typeof status !== 'string'
      || !SLOT_STATUSES.has(status as SlotDetail['status'])
    ) {
      return { isClosed: true, slots: [], error: 'The server returned malformed time slots.' };
    }

    const expectedStatusValid = status === 'OVER_CAPACITY'
      ? booked > capacity && available === 0
      : status === 'ELAPSED'
        ? booked <= capacity && available === 0
        : status === 'FULL'
          ? booked === capacity && available === 0
          : capacity > 0 && booked < capacity && available === capacity - booked;
    if (!expectedStatusValid) {
      return { isClosed: true, slots: [], error: 'The server returned inconsistent slot capacity.' };
    }

    seen.add(time);
    const isPast = status === 'ELAPSED';
    const selectable = !isPast
      && booked < capacity
      && available > 0
      && (status === 'AVAILABLE' || status === 'ALMOST_FULL');
    const rawLabel = typeof slot.label === 'string' ? slot.label.trim() : '';

    validated.push({
      time,
      label: rawLabel || formatTime(time),
      capacity,
      booked,
      available,
      status: status as SlotDetail['status'],
      selectable,
      isPast,
    });
  }

  return { isClosed: false, slots: validated };
}

export default function AdminNewAppointmentNotice({
  selectedDate,
  onClose,
  onCreated,
}: AdminNewAppointmentNoticeProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const [bookingDate, setBookingDate] = useState(() => initialDateKey(selectedDate));
  const [customers, setCustomers] = useState<DirectoryCustomer[]>([]);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [services, setServices] = useState<PublishedService[]>([]);
  const [slots, setSlots] = useState<ValidatedSlot[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slotTime, setSlotTime] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [slotsError, setSlotsError] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slotsRequestVersion, setSlotsRequestVersion] = useState(0);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers],
  );
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.time === slotTime && slot.selectable),
    [slotTime, slots],
  );

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    setBookingDate(initialDateKey(selectedDate));
    setSlotTime('');
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');

    Promise.all([
      UserService.getAllUsers({ suppressErrorToast: true }),
      DetailService.getPublishedServices(),
    ])
      .then(([userResult, serviceResult]) => {
        if (cancelled) return;
        const rawUsers = userResult?.success && Array.isArray(userResult.data) ? userResult.data : null;
        const rawServices = serviceResult?.success && Array.isArray(serviceResult.data) ? serviceResult.data : null;
        if (!rawUsers || !rawServices) throw new Error('Customer or service data was malformed.');

        setCustomers(rawUsers.flatMap((raw: unknown) => {
          if (!raw || typeof raw !== 'object') return [];
          const user = raw as Record<string, unknown>;
          const id = idOf(user);
          const name = typeof user.name === 'string' ? user.name.trim() : '';
          const role = typeof user.role === 'string' ? user.role.trim().toLowerCase() : '';
          if (!id || !name || role !== 'customer' || user.isActive !== true || user.isDeleted === true) return [];
          return [{
            id,
            name,
            email: typeof user.email === 'string' ? user.email.trim() : undefined,
            phone: typeof user.phone === 'string' ? user.phone.trim() : undefined,
          }];
        }));

        setServices(rawServices.flatMap((raw: unknown) => {
          if (!raw || typeof raw !== 'object') return [];
          const service = raw as Record<string, unknown>;
          const id = idOf(service);
          const name = typeof service.name === 'string' ? service.name.trim() : '';
          if (!id || !name || service.status !== 'Active' || service.isPublished !== true) return [];
          return [{
            id,
            name,
            duration: typeof service.duration === 'string' || typeof service.duration === 'number'
              ? service.duration
              : undefined,
          }];
        }));
      })
      .catch((error) => {
        if (!cancelled) {
          setCustomers([]);
          setServices([]);
          setCatalogError(errorMessage(error, 'Customers and services could not be loaded.'));
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVehicleId('');
    setVehicles([]);
    if (!customerId) {
      setVehiclesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setVehiclesLoading(true);
    VehicleService.getVehiclesForUser(customerId)
      .then((result) => {
        if (cancelled) return;
        if (!result?.success || !Array.isArray(result.data)) throw new Error('Vehicle data was malformed.');
        setVehicles(result.data.flatMap((raw: unknown) => {
          if (!raw || typeof raw !== 'object') return [];
          const vehicle = raw as Record<string, unknown>;
          const id = idOf(vehicle);
          if (!id) return [];
          return [{
            id,
            year: typeof vehicle.year === 'string' || typeof vehicle.year === 'number' ? vehicle.year : undefined,
            make: typeof vehicle.make === 'string' ? vehicle.make.trim() : undefined,
            model: typeof vehicle.model === 'string' ? vehicle.model.trim() : undefined,
            plateNumber: typeof vehicle.plateNumber === 'string' ? vehicle.plateNumber.trim() : undefined,
            vehicleType: typeof vehicle.vehicleType === 'string' ? vehicle.vehicleType.trim() : undefined,
          }];
        }));
      })
      .catch((error) => {
        if (!cancelled) {
          setVehicles([]);
          toast.error(errorMessage(error, 'Vehicles could not be loaded.'));
        }
      })
      .finally(() => {
        if (!cancelled) setVehiclesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    setSlotTime('');
    setSlots([]);
    setIsClosed(false);
    setSlotsError('');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      setSlotsError('Choose a valid appointment date.');
      return () => {
        cancelled = true;
      };
    }

    setSlotsLoading(true);
    fetchSlotsByDate(bookingDate)
      .then((result) => {
        if (cancelled) return;
        const validated = validateSlots(result, bookingDate);
        setIsClosed(validated.isClosed);
        setSlots(validated.slots);
        setSlotsError(validated.error || '');
      })
      .catch((error) => {
        if (!cancelled) {
          setIsClosed(true);
          setSlots([]);
          setSlotsError(errorMessage(error, 'Availability could not be verified.'));
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingDate, slotsRequestVersion]);

  const submitBooking = async () => {
    if (!selectedCustomer || !vehicleId || !serviceId || !selectedSlot || submitting) {
      toast.error('Select a customer, vehicle, service, date, and available time slot.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await OrderService.createOrder({
        customer: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        vehicle: vehicleId,
        service: serviceId,
        bookingDate,
        bookingTime: selectedSlot.time,
      });
      if (!result?.success) throw new Error(result?.message || 'Appointment could not be created.');

      toast.success('Appointment created successfully.');
      try {
        await onCreated(bookingDate);
      } catch (refreshError) {
        console.error('Appointment created, but calendar refresh failed:', refreshError);
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Appointment could not be created.'));
      setSlotTime('');
      setSlotsRequestVersion((version) => version + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(
    selectedCustomer
      && vehicleId
      && serviceId
      && selectedSlot
      && !catalogLoading
      && !vehiclesLoading
      && !slotsLoading
      && !catalogError
      && !slotsError
      && !isClosed
      && !submitting,
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-new-appointment-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-24px_rgba(15,23,42,0.32)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <CalendarPlus2 size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="admin-new-appointment-title" className="text-base font-semibold text-slate-900">
                New appointment
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {formatDateLabel(bookingDate)} · Availability is verified by the server.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close new appointment dialog"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {catalogError ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700 ring-1 ring-red-100">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{catalogError} Reload the page before creating an appointment.</span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5"><Users size={14} className="text-blue-600" /> Customer</span>
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                disabled={catalogLoading || Boolean(catalogError)}
                className={inputClassName}
              >
                <option value="">{catalogLoading ? 'Loading customers…' : 'Select a customer'}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.email ? ` — ${customer.email}` : ''}
                  </option>
                ))}
              </select>
              {!catalogLoading && !catalogError && customers.length === 0 ? (
                <span className="mt-1.5 block font-normal text-amber-700">No active customer accounts are available.</span>
              ) : null}
            </label>

            <label className="text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5"><Car size={14} className="text-blue-600" /> Customer vehicle</span>
              <select
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                disabled={!customerId || vehiclesLoading}
                className={inputClassName}
              >
                <option value="">
                  {vehiclesLoading ? 'Loading vehicles…' : customerId ? 'Select a vehicle' : 'Select a customer first'}
                </option>
                {vehicles.map((vehicle) => {
                  const description = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
                  return (
                    <option key={vehicle.id} value={vehicle.id}>
                      {description || vehicle.vehicleType || 'Vehicle'}{vehicle.plateNumber ? ` — ${vehicle.plateNumber}` : ''}
                    </option>
                  );
                })}
              </select>
              {customerId && !vehiclesLoading && vehicles.length === 0 ? (
                <span className="mt-1.5 block font-normal text-amber-700">This customer has no vehicles in their garage.</span>
              ) : null}
            </label>

            <label className="text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5"><Wrench size={14} className="text-blue-600" /> Published service</span>
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                disabled={catalogLoading || Boolean(catalogError)}
                className={inputClassName}
              >
                <option value="">{catalogLoading ? 'Loading services…' : 'Select a service'}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}{service.duration ? ` — ${service.duration}` : ''}
                  </option>
                ))}
              </select>
              {!catalogLoading && !catalogError && services.length === 0 ? (
                <span className="mt-1.5 block font-normal text-amber-700">No active published services are available.</span>
              ) : null}
            </label>

            <label className="text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5"><CalendarPlus2 size={14} className="text-blue-600" /> Appointment date</span>
              <input
                type="date"
                value={bookingDate}
                onChange={(event) => setBookingDate(event.target.value)}
                className={inputClassName}
              />
            </label>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Clock3 size={15} className="text-blue-600" /> Server time slots
                </h3>
                <p className="mt-1 text-xs text-slate-500">Capacity is counted independently for each exact time.</p>
              </div>
              {slotsLoading ? <Loader2 size={18} className="animate-spin text-blue-600" aria-label="Loading time slots" /> : null}
            </div>

            {slotsError ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-100">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{slotsError} No appointment can be submitted until availability is verified.</span>
              </div>
            ) : isClosed && !slotsLoading ? (
              <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-4 text-center text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                Closed — this date has no bookable slots.
              </div>
            ) : !slotsLoading && slots.length === 0 ? (
              <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-4 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                No time slots are available for this date.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const isSelected = slot.time === slotTime;
                  const overCapacity = slot.status === 'OVER_CAPACITY' || slot.booked > slot.capacity;
                  const full = slot.status === 'FULL';
                  const stateLabel = overCapacity
                    ? 'Over capacity'
                    : slot.isPast
                      ? 'Passed'
                      : full
                        ? 'FULL'
                        : `${slot.available} available`;
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!slot.selectable}
                      onClick={() => setSlotTime(slot.time)}
                      className={`rounded-xl border px-3.5 py-3 text-left transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                          : slot.selectable
                            ? 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                            : overCapacity
                              ? 'cursor-not-allowed border-amber-200 bg-amber-50'
                              : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-75'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900">{slot.label}</span>
                        {isSelected ? <CheckCircle2 size={16} className="shrink-0 text-blue-600" /> : null}
                      </span>
                      <span className={`mt-1 block text-xs font-medium ${overCapacity ? 'text-amber-800' : full ? 'text-red-700' : 'text-slate-600'}`}>
                        {slot.booked} / {slot.capacity} booked · {stateLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitBooking}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus2 size={15} />}
            {submitting ? 'Creating…' : 'Create appointment'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
