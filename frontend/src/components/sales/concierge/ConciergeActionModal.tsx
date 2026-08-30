import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CalendarClock, Loader2, PhilippinePeso, Send, X } from 'lucide-react';
import { DetailService } from '@/lib/detail-service-api';
import { OrderService, type AvailableSlotsResponse } from '@/lib/order-service';
import {
  getEffectivePrice,
  type BackendService,
  type VehicleType,
} from '@/hooks/useServices';
import type {
  ConciergeConversation,
  ConciergeMessageContext,
} from './conciergeTypes';

type ActionMode = 'pricing' | 'schedule';
type Slot = NonNullable<AvailableSlotsResponse['slots']>[number];

type ConciergeActionModalProps = {
  mode: ActionMode;
  conversation: ConciergeConversation;
  busy?: boolean;
  onClose: () => void;
  onSend: (
    message: string,
    context: ConciergeMessageContext,
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

const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);

export default function ConciergeActionModal({
  mode,
  conversation,
  busy = false,
  onClose,
  onSend,
}: ConciergeActionModalProps) {
  const [services, setServices] = useState<BackendService[]>([]);
  const [serviceId, setServiceId] = useState(
    conversation.selectedServiceId || '',
  );
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>(
    (conversation.selectedVehicleType as VehicleType) || '',
  );
  const [date, setDate] = useState(
    conversation.offeredSchedule?.[0]?.date || todayIso(),
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedService = services.find((service) => service._id === serviceId);
  const selectedPrice = selectedService && vehicleType
    ? getEffectivePrice(selectedService, vehicleType)
    : null;

  useEffect(() => {
    if (mode !== 'pricing') return;
    let active = true;
    setLoading(true);
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
        setServiceId((current) =>
          rows.some((service: BackendService) => service._id === current)
            ? current
            : (preferred || rows[0])?._id || '',
        );
        setError(rows.length ? '' : 'No published services are available.');
      })
      .catch(() => active && setError('Could not load the service catalog.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [conversation.serviceInterest, mode]);

  useEffect(() => {
    if (mode !== 'schedule' || !date) return;
    let active = true;
    setLoading(true);
    setSelectedTimes([]);
    void OrderService.getAvailableSlots(date)
      .then((response) => {
        if (!active) return;
        const available = (response.slots || []).filter(
          (slot) =>
            slot.status !== 'FULL' &&
            slot.status !== 'OVER_CAPACITY' &&
            Number(slot.available) > 0,
        );
        setSlots(available);
        setError(
          response.unavailable || !available.length
            ? response.message ||
                response.closureReason ||
                'No valid appointment slots are available on this date.'
            : '',
        );
      })
      .catch(
        () =>
          active && setError('Could not load live appointment availability.'),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date, mode]);

  const generatedMessage = useMemo(() => {
    if (mode === 'pricing') {
      if (!selectedService || selectedPrice == null || selectedPrice <= 0) return '';
      return `Hi ${conversation.customerName}, the current price for ${selectedService.name} for a ${VEHICLE_TYPES.find((type) => type.value === vehicleType)?.label.toLowerCase()} is ${peso(selectedPrice)}. Would you like me to check available appointment times for you?`;
    }
    if (!date || !selectedTimes.length) return '';
    const formattedDate = new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(`${date}T12:00:00`));
    return `Hi ${conversation.customerName}, these appointment times are currently available on ${formattedDate}: ${selectedTimes.join(', ')}. Which one works best for you? Availability may change until a booking is confirmed.`;
  }, [
    conversation.customerName,
    date,
    mode,
    selectedPrice,
    selectedService,
    selectedTimes,
    vehicleType,
  ]);

  useEffect(() => setMessage(generatedMessage), [generatedMessage]);

  const canSend = Boolean(message.trim()) && !busy && !loading && !error;
  const title =
    mode === 'pricing' ? 'Send current pricing' : 'Offer available schedule';
  const messageContext: ConciergeMessageContext =
    mode === 'pricing'
      ? { selectedServiceId: serviceId, selectedVehicleType: vehicleType }
      : { offeredSchedule: selectedTimes.map((time) => ({ date, time })) };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl focus:outline-none">
          <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                {mode === 'pricing' ? (
                  <PhilippinePeso size={19} />
                ) : (
                  <CalendarClock size={19} />
                )}
              </span>
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-slate-500">
                  {mode === 'pricing'
                    ? 'Prices come from the published service catalog.'
                    : 'Times come from the same availability controls used by appointments.'}
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Close ${title}`}
            >
              <X size={17} />
            </DialogPrimitive.Close>
          </header>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
            {mode === 'pricing' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Service
                  <select
                    value={serviceId}
                    onChange={(event) => setServiceId(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    {services.map((service) => (
                      <option key={service._id} value={service._id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Vehicle type
                  <select
                    value={vehicleType}
                    onChange={(event) =>
                      setVehicleType(event.target.value as VehicleType | '')
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    <option value="">Select pricing category</option>
                    {VEHICLE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedService ? (
                  <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                      Current catalog price
                    </p>
                    <p className="mt-1 text-xl font-black text-blue-950">
                      {(selectedPrice ?? 0) > 0
                        ? peso(selectedPrice)
                        : 'Not configured'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Appointment date
                  <input
                    type="date"
                    min={todayIso()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  aria-label="Available appointment times"
                >
                  {slots.map((slot) => {
                    const selected = selectedTimes.includes(slot.time);
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() =>
                          setSelectedTimes((current) =>
                            selected
                              ? current.filter((time) => time !== slot.time)
                              : [...current, slot.time],
                          )
                        }
                        aria-pressed={selected}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {slot.label || slot.time} · {slot.available} open
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {loading ? (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                Loading live data…
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
              >
                {error}
              </p>
            ) : null}

            <label className="block text-xs font-semibold text-slate-600">
              Message preview
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
            </label>
          </div>

          <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void onSend(message.trim(), messageContext)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              Send to customer
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
