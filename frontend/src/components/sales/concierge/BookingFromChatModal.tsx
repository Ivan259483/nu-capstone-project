import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CalendarPlus2, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { DetailService } from '@/lib/detail-service-api';
import { OrderService, type AvailableSlotsResponse } from '@/lib/order-service';
import { syncAvailabilityCaches } from '@/lib/availabilitySync';
import {
  getEffectivePrice,
  type BackendService,
  type VehicleType,
} from '@/hooks/useServices';
import type {
  BookingFromChatDraft,
  ConciergeConversation,
} from './conciergeTypes';

type Slot = NonNullable<AvailableSlotsResponse['slots']>[number];
type Props = {
  conversation: ConciergeConversation;
  onClose: () => void;
  onCreated: (
    bookingId: string,
    bookingReference: string,
  ) => Promise<void> | void;
};

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'midsized', label: 'Mid-size' },
  { value: 'suv', label: 'SUV' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'largesuv', label: 'Large SUV' },
  { value: 'highend', label: 'High-end vehicle' },
];

const todayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

function vehicleDraft(label: string) {
  if (!label || label === 'Not provided')
    return { year: '', make: '', model: '' };
  const parts = label.trim().split(/\s+/);
  const year = /^\d{4}$/.test(parts[0] || '') ? parts.shift() || '' : '';
  return { year, make: parts.shift() || '', model: parts.join(' ') };
}

export default function BookingFromChatModal({
  conversation,
  onClose,
  onCreated,
}: Props) {
  const parsedVehicle = vehicleDraft(conversation.vehicle);
  const offeredSlot = conversation.offeredSchedule?.[0];
  const [draft, setDraft] = useState<BookingFromChatDraft>({
    customerName: conversation.customerName,
    phone: conversation.phone === 'Not provided' ? '' : conversation.phone,
    vehicleYear: parsedVehicle.year,
    vehicleMake: parsedVehicle.make,
    vehicleModel: parsedVehicle.model,
    vehicleColor: '',
    plate: conversation.plate,
    vehicleType: conversation.selectedVehicleType || 'sedan',
    serviceId: conversation.selectedServiceId || '',
    bookingDate: offeredSlot?.date || '',
    bookingTime: offeredSlot?.time || '',
    notes: conversation.bookingNotes,
  });
  const [services, setServices] = useState<BackendService[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateDraft = (field: keyof BookingFromChatDraft, value: string) =>
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'bookingDate' ? { bookingTime: '' } : {}),
    }));

  useEffect(() => {
    let active = true;
    void DetailService.getPublishedServices()
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response?.data) ? response.data : [];
        setServices(rows);
        const preferred = rows.find((service: BackendService) =>
          conversation.serviceInterest
            .toLowerCase()
            .includes(service.name.toLowerCase()),
        );
        setDraft((current) => ({
          ...current,
          serviceId: rows.some(
            (service: BackendService) => service._id === current.serviceId,
          )
            ? current.serviceId
            : (preferred || rows[0])?._id || '',
        }));
        if (!rows.length)
          setError('No published services are available for booking.');
      })
      .catch(() => active && setError('Could not load the service catalog.'))
      .finally(() => active && setLoadingCatalog(false));
    return () => {
      active = false;
    };
  }, [conversation.serviceInterest]);

  useEffect(() => {
    if (!draft.bookingDate) {
      setSlots([]);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setError('');
    void OrderService.getAvailableSlots(draft.bookingDate)
      .then((response) => {
        if (!active) return;
        const available = (response.slots || []).filter(
          (slot) =>
            slot.status !== 'FULL' &&
            slot.status !== 'OVER_CAPACITY' &&
            Number(slot.available) > 0,
        );
        setSlots(available);
        setDraft((current) => ({
          ...current,
          bookingTime: available.some(
            (slot) => slot.time === current.bookingTime,
          )
            ? current.bookingTime
            : '',
        }));
        if (response.unavailable || !available.length) {
          setError(
            response.message ||
              'No valid appointment slots are available on this date.',
          );
        }
      })
      .catch(
        () =>
          active && setError('Could not load live appointment availability.'),
      )
      .finally(() => active && setLoadingSlots(false));
    return () => {
      active = false;
    };
  }, [draft.bookingDate]);

  const selectedService = services.find(
    (service) => service._id === draft.serviceId,
  );
  const selectedPrice = selectedService
    ? getEffectivePrice(selectedService, draft.vehicleType as VehicleType)
    : 0;
  const registeredCustomer =
    Boolean(conversation.customerId) &&
    !conversation.customerId.startsWith('GUEST-');
  const requiredFields = [
    draft.customerName,
    draft.phone,
    draft.vehicleYear,
    draft.vehicleMake,
    draft.vehicleModel,
    draft.plate,
    draft.vehicleType,
    draft.serviceId,
    draft.bookingDate,
    draft.bookingTime,
  ];
  const canSubmit =
    registeredCustomer &&
    requiredFields.every((value) => value.trim()) &&
    selectedPrice > 0 &&
    !submitting &&
    !loadingSlots;
  const priceLabel = useMemo(
    () =>
      selectedPrice > 0
        ? new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
            maximumFractionDigits: 0,
          }).format(selectedPrice)
        : 'Not configured',
    [selectedPrice],
  );

  const handleSubmit = async () => {
    if (!canSubmit || !selectedService) return;
    setSubmitting(true);
    setError('');
    try {
      const availability = await OrderService.getAvailableSlots(
        draft.bookingDate,
      );
      const stillAvailable = (availability.slots || []).some(
        (slot) =>
          slot.time === draft.bookingTime &&
          slot.status !== 'FULL' &&
          slot.status !== 'OVER_CAPACITY' &&
          Number(slot.available) > 0,
      );
      if (!stillAvailable) {
        setDraft((current) => ({ ...current, bookingTime: '' }));
        setError(
          'That appointment time is no longer available. Select another live slot.',
        );
        return;
      }
      const response = await OrderService.createOrder({
        sourceConversationId: conversation.id,
        customer: conversation.customerId,
        customerName: draft.customerName.trim(),
        customerPhone: draft.phone.trim(),
        vehicleYear: draft.vehicleYear.trim(),
        vehicleMake: draft.vehicleMake.trim(),
        vehicleModel: draft.vehicleModel.trim(),
        vehicleColor: draft.vehicleColor.trim() || 'Not provided',
        vehiclePlate: draft.plate.trim(),
        vehicleType: draft.vehicleType,
        service: selectedService._id,
        serviceType: selectedService.name,
        bookingDate: draft.bookingDate,
        bookingTime: draft.bookingTime,
        notes:
          draft.notes.trim() ||
          `Created from Concierge conversation ${conversation.id}`,
      });
      const booking = response?.data || {};
      const bookingId = String(booking.id || booking._id || '');
      const bookingReference = String(
        booking.bookingReference || booking.orderNumber || bookingId,
      );
      if (!bookingId)
        throw new Error(
          'The booking was created but no booking ID was returned.',
        );
      await onCreated(bookingId, bookingReference);
      syncAvailabilityCaches();
      toast.success(`Booking ${bookingReference} created`);
      onClose();
    } catch (requestError: any) {
      const message =
        requestError?.response?.data?.message ||
        requestError?.message ||
        'Could not create the booking.';
      setError(message);
      if (Number(requestError?.response?.status) === 409) {
        setDraft((current) => ({ ...current, bookingTime: '' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const textInputs: [keyof BookingFromChatDraft, string][] = [
    ['customerName', 'Customer name'],
    ['phone', 'Phone/contact'],
    ['vehicleYear', 'Vehicle year'],
    ['vehicleMake', 'Vehicle make'],
    ['vehicleModel', 'Vehicle model'],
    ['vehicleColor', 'Vehicle color (optional)'],
    ['plate', 'Plate number'],
  ];

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl focus:outline-none">
          <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarPlus2 size={19} />
              </span>
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  Create booking from chat
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-slate-500">
                  Collected details are prefilled. Only missing booking
                  information is required.
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close create booking modal"
            >
              <X size={17} />
            </DialogPrimitive.Close>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
              {!registeredCustomer ? (
                <p
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-800"
                >
                  A registered customer account is required before creating an
                  appointment. Ask the guest to sign in or register; no
                  duplicate customer record will be created.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {textInputs.map(([field, label]) => (
                  <label
                    key={field}
                    className="text-xs font-semibold text-slate-600"
                  >
                    {label}
                    <input
                      value={draft[field]}
                      onChange={(event) =>
                        updateDraft(field, event.target.value)
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                  </label>
                ))}
                <label className="text-xs font-semibold text-slate-600">
                  Vehicle type
                  <select
                    value={draft.vehicleType}
                    onChange={(event) =>
                      updateDraft('vehicleType', event.target.value)
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    {VEHICLE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Service
                  <select
                    disabled={loadingCatalog}
                    value={draft.serviceId}
                    onChange={(event) =>
                      updateDraft('serviceId', event.target.value)
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    {services.map((service) => (
                      <option key={service._id} value={service._id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                    Current catalog price
                  </p>
                  <p className="mt-1 text-base font-black text-blue-950">
                    {priceLabel}
                  </p>
                </div>
                <label className="text-xs font-semibold text-slate-600">
                  Appointment date
                  <input
                    type="date"
                    min={todayIso()}
                    value={draft.bookingDate}
                    onChange={(event) =>
                      updateDraft('bookingDate', event.target.value)
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Available time
                  <select
                    disabled={!draft.bookingDate || loadingSlots}
                    value={draft.bookingTime}
                    onChange={(event) =>
                      updateDraft('bookingTime', event.target.value)
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    <option value="">Select a live slot</option>
                    {slots.map((slot) => (
                      <option key={slot.time} value={slot.time}>
                        {slot.label || slot.time} · {slot.available} open
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Notes from conversation
                <textarea
                  value={draft.notes}
                  onChange={(event) => updateDraft('notes', event.target.value)}
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-5 outline-none focus:border-blue-400"
                />
              </label>
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                >
                  {error}
                </p>
              ) : null}
              <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                <ShieldCheck
                  size={14}
                  className="mt-0.5 shrink-0 text-blue-600"
                />
                Availability is checked again immediately before submission and
                reserved atomically by the existing booking system.
              </p>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CalendarPlus2 size={16} />
                )}
                Create Booking
              </button>
            </footer>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
