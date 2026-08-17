import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Car, X, Sparkles, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { OrderService, type AvailableSlotsResponse } from '@/lib/order-service';
import { cn } from "@/lib/utils";
import api from '@/lib/api';
import {
    AVAILABILITY_UPDATED_EVENT,
    ensureAvailabilityRealtimeSync,
    syncAvailabilityCaches,
} from '@/lib/availabilitySync';

/* ─────────────────────── Constants ─────────────────────── */
const vehicleTypes = ["sedan", "suv", "truck", "van", "sports"] as const;
const CAR_COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Other'];
const YEARS = Array.from({ length: 15 }, (_, i) => String(2025 - i));
const EMERGENCY_CLOSURE_MESSAGE = 'Bookings for today have been temporarily closed. Please select another available date.';
const DATE_NO_LONGER_AVAILABLE_MESSAGE = 'The selected appointment date is no longer available. Please select another available date.';

function toLocalDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIsoAsLocalDate(value: string): Date | null {
    if (!isIsoDate(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAvailabilityErrorCode(payload: any): string | null {
    const value = payload?.errorCode;
    return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function isEmergencyClosurePayload(payload: any): boolean {
    return getAvailabilityErrorCode(payload) === 'EMERGENCY_CLOSED'
        || payload?.emergencyClosed === true
        || String(payload?.closureType || payload?.closedReason || '').toLowerCase() === 'emergency';
}

type SlotOption = NonNullable<AvailableSlotsResponse['slots']>[number];
type DateOption = {
    iso: string;
    date: Date;
    remaining: number;
    booked: number;
    capacity: number;
    status: string;
    isClosed: boolean;
    isEmergency: boolean;
    isSelectable: boolean;
    message: string;
};

interface BookingService {
    id: string;
    name: string;
    basePrice: number;
    duration: string;
}

interface QuickBookModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedServiceId?: string;
}

export default function QuickBookModal({ isOpen, onClose, preselectedServiceId }: QuickBookModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [services, setServices] = useState<BookingService[]>([]);
    const [availableDates, setAvailableDates] = useState<DateOption[]>([]);
    const [timeSlots, setTimeSlots] = useState<SlotOption[]>([]);
    const [datesLoading, setDatesLoading] = useState(false);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [availabilityError, setAvailabilityError] = useState('');
    const [availabilityErrorCode, setAvailabilityErrorCode] = useState<string | null>(null);
    const [businessDate, setBusinessDate] = useState('');
    const [businessTimeZone, setBusinessTimeZone] = useState('');
    
    // Form state
    const [service, setService] = useState(preselectedServiceId || "");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [model, setModel] = useState("");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    
    const [step, setStep] = useState<1 | 2>(1);
    const rangeRequestRef = useRef(0);
    const slotRequestRef = useRef(0);
    const selectedDateRef = useRef(date);
    const selectedTimeRef = useRef(time);
    const businessDateRef = useRef(businessDate);
    selectedDateRef.current = date;
    selectedTimeRef.current = time;
    businessDateRef.current = businessDate;

    const fetchAvailableDates = useCallback(async (
        selectedIso: string | null = selectedDateRef.current,
    ): Promise<boolean> => {
        if (!isOpen || !user) {
            setAvailabilityError('Sign in to load live appointment availability.');
            return false;
        }

        const requestId = ++rangeRequestRef.current;
        setDatesLoading(true);
        try {
            const knownBusinessDate = parseIsoAsLocalDate(businessDateRef.current);
            const startDate = knownBusinessDate || new Date();
            startDate.setHours(0, 0, 0, 0);
            // On the first request include the preceding local day. That covers the
            // one-day timezone boundary until the server returns its business date.
            if (!knownBusinessDate) startDate.setDate(startDate.getDate() - 1);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 62);

            const response = await api.get('/slots/range', {
                params: { start: toLocalDateKey(startDate), end: toLocalDateKey(endDate) },
                meta: { suppressErrorToast: true },
            } as any);
            if (requestId !== rangeRequestRef.current) return false;

            const payload = response.data || {};
            const nextBusinessDate = isIsoDate(payload.businessDate)
                ? payload.businessDate
                : businessDateRef.current || toLocalDateKey(new Date());
            const nextBusinessTimeZone = typeof payload.businessTimeZone === 'string'
                ? payload.businessTimeZone
                : typeof payload.timeZone === 'string'
                    ? payload.timeZone
                    : '';
            setBusinessDate(nextBusinessDate);
            businessDateRef.current = nextBusinessDate;
            setBusinessTimeZone(nextBusinessTimeZone);

            const summaries = Array.isArray(payload.data) ? payload.data : [];
            const nextDates: DateOption[] = summaries
                .filter((summary: any) => (
                    isIsoDate(summary?.date)
                    && summary.date >= nextBusinessDate
                    && ['AVAILABLE', 'ALMOST_FULL', 'OVER_CAPACITY', 'FULL', 'CLOSED'].includes(
                        String(summary?.status || '').toUpperCase(),
                    )
                ))
                .map((summary: any) => {
                    const status = String(summary?.status || '').toUpperCase();
                    const remainingValue = Number(summary?.availableSlots);
                    const bookedValue = Number(summary?.bookedSlots);
                    const capacityValue = Number(summary?.dailyCapacity);
                    const remaining = Number.isFinite(remainingValue) ? Math.max(0, remainingValue) : 0;
                    const booked = Number.isFinite(bookedValue) ? Math.max(0, bookedValue) : 0;
                    const capacity = Number.isFinite(capacityValue) ? Math.max(0, capacityValue) : 0;
                    const isEmergency = isEmergencyClosurePayload(summary);
                    const isClosed = !!summary?.isClosed || status === 'CLOSED';
                    const isFull = status === 'FULL' || remaining <= 0;
                    const isSelectable = !isClosed
                        && !isFull
                        && ['AVAILABLE', 'ALMOST_FULL', 'OVER_CAPACITY'].includes(status);
                    return {
                        iso: String(summary.date),
                        date: parseIsoAsLocalDate(String(summary.date)) as Date,
                        remaining,
                        booked,
                        capacity,
                        status,
                        isClosed,
                        isEmergency,
                        isSelectable,
                        message: isEmergency
                            ? EMERGENCY_CLOSURE_MESSAGE
                            : String(
                                summary?.message
                                || summary?.closureReason
                                || summary?.closureLabel
                                || (isClosed ? 'This date is closed for bookings.' : isFull ? 'This date is fully booked.' : ''),
                            ),
                    };
                })
                .filter((entry: DateOption) => !Number.isNaN(entry.date.getTime()));

            setAvailableDates(nextDates);
            const selectedDateOption = selectedIso
                ? nextDates.find((entry) => entry.iso === selectedIso)
                : undefined;
            if (selectedIso && (!selectedDateOption || !selectedDateOption.isSelectable)) {
                const emergencyClosed = !!selectedDateOption?.isEmergency;
                const message = emergencyClosed
                    ? EMERGENCY_CLOSURE_MESSAGE
                    : selectedDateOption?.message || DATE_NO_LONGER_AVAILABLE_MESSAGE;
                setDate('');
                setTime('');
                setTimeSlots([]);
                setStep(1);
                setAvailabilityErrorCode(emergencyClosed ? 'EMERGENCY_CLOSED' : null);
                setAvailabilityError(message);
                toast.error(message, { id: emergencyClosed ? 'quick-book-emergency' : 'quick-book-date-unavailable' });
                return false;
            }

            setAvailabilityErrorCode(null);
            setAvailabilityError(
                nextDates.some((entry) => entry.isSelectable)
                    ? ''
                    : 'No bookable appointment dates are currently available.',
            );
            return true;
        } catch (error) {
            if (requestId !== rangeRequestRef.current) return false;
            console.error('Failed to load appointment dates', error);
            setAvailableDates([]);
            setTime('');
            setTimeSlots([]);
            setAvailabilityErrorCode(null);
            setAvailabilityError('Live appointment availability could not be loaded. Please try again.');
            return false;
        } finally {
            if (requestId === rangeRequestRef.current) setDatesLoading(false);
        }
    }, [isOpen, user]);

    const fetchTimeSlotsForDate = useCallback(async (targetDate: string): Promise<boolean> => {
        if (!isOpen || !user || !targetDate) return false;

        const requestId = ++slotRequestRef.current;
        setSlotsLoading(true);
        try {
            const response = await api.get<AvailableSlotsResponse>('/orders/available-slots', {
                params: { date: targetDate },
                meta: { suppressErrorToast: true },
            } as any);
            if (requestId !== slotRequestRef.current || selectedDateRef.current !== targetDate) return false;

            const payload: any = response.data || {};
            if (isIsoDate(payload.businessDate)) {
                setBusinessDate(payload.businessDate);
                businessDateRef.current = payload.businessDate;
            }
            const responseTimeZone = payload.businessTimeZone || payload.timeZone;
            if (typeof responseTimeZone === 'string') setBusinessTimeZone(responseTimeZone);

            const emergencyClosed = isEmergencyClosurePayload(payload);
            const slots = (Array.isArray(payload?.slots) ? payload.slots : []).filter((slot: any) => (
                typeof slot?.time === 'string'
                && slot.time.length > 0
                && ['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY'].includes(String(slot.status))
                && Number.isFinite(Number(slot.capacity))
                && Number.isFinite(Number(slot.booked))
                && Number.isFinite(Number(slot.available))
            ));

            if (!payload?.success || payload.unavailable || emergencyClosed || slots.length === 0) {
                const message = emergencyClosed
                    ? EMERGENCY_CLOSURE_MESSAGE
                    : payload?.message || payload?.error || 'No bookable time options are configured for this date.';
                setDate('');
                setTime('');
                setTimeSlots([]);
                setStep(1);
                setAvailabilityErrorCode(emergencyClosed ? 'EMERGENCY_CLOSED' : getAvailabilityErrorCode(payload));
                setAvailabilityError(message);
                if (emergencyClosed) toast.error(message, { id: 'quick-book-emergency' });
                return false;
            }

            setTimeSlots(slots);
            setAvailabilityErrorCode(null);
            setAvailabilityError('');
            const currentTime = selectedTimeRef.current;
            if (currentTime) {
                const currentSlot: any = slots.find((slot: any) => slot.time === currentTime);
                const remaining = Number(currentSlot?.available);
                const stillAvailable = currentSlot
                    && currentSlot.status !== 'FULL'
                    && currentSlot.status !== 'OVER_CAPACITY'
                    && Number.isFinite(remaining)
                    && remaining > 0;
                if (!stillAvailable) {
                    setTime('');
                    toast.error('The selected time is no longer available. Please choose another time.', {
                        id: 'quick-book-time-unavailable',
                    });
                }
            }
            return true;
        } catch (error) {
            if (requestId !== slotRequestRef.current) return false;
            console.error('Failed to load appointment time slots', error);
            setTime('');
            setTimeSlots([]);
            setAvailabilityErrorCode(null);
            setAvailabilityError('Available times could not be loaded. Please try another date.');
            return false;
        } finally {
            if (requestId === slotRequestRef.current) setSlotsLoading(false);
        }
    }, [isOpen, user]);

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setDate('');
        setTime('');
        setAvailableDates([]);
        setTimeSlots([]);
        setAvailabilityError('');
        setAvailabilityErrorCode(null);
        setBusinessDate('');
        setBusinessTimeZone('');
        businessDateRef.current = '';
        if (user) {
            setName(user.name || '');
            if ((user as any).phone) setPhone((user as any).phone);
        }

        const fetchServices = async () => {
            setLoading(true);
            try {
                const res = await api.get('/services/published');
                if (res.data.success && Array.isArray(res.data.data)) {
                    const mapped = res.data.data.map((item: any) => ({ ...item, id: item._id || item.id }));
                    setServices(mapped);
                    setService((current) => current || preselectedServiceId || mapped[0]?.id || '');
                }
            } catch (error) {
                console.error('Failed to load services', error);
            } finally {
                setLoading(false);
            }
        };

        void fetchServices();
        void fetchAvailableDates(null);
        return () => {
            rangeRequestRef.current += 1;
            slotRequestRef.current += 1;
        };
    }, [fetchAvailableDates, isOpen, preselectedServiceId, user]);

    useEffect(() => {
        if (!isOpen || !user || !date) {
            setTimeSlots([]);
            setSlotsLoading(false);
            return;
        }
        void fetchTimeSlotsForDate(date);
    }, [date, fetchTimeSlotsForDate, isOpen, user]);

    useEffect(() => {
        if (!isOpen) return;
        ensureAvailabilityRealtimeSync();
        const handleAvailabilityUpdate = () => {
            const selectedIso = selectedDateRef.current;
            void fetchAvailableDates(selectedIso).then((selectedDateStillAvailable) => {
                if (
                    selectedDateStillAvailable
                    && selectedIso
                    && selectedDateRef.current === selectedIso
                ) {
                    void fetchTimeSlotsForDate(selectedIso);
                }
            });
        };
        window.addEventListener(AVAILABILITY_UPDATED_EVENT, handleAvailabilityUpdate);
        return () => window.removeEventListener(AVAILABILITY_UPDATED_EVENT, handleAvailabilityUpdate);
    }, [fetchAvailableDates, fetchTimeSlotsForDate, isOpen]);

    if (!isOpen) return null;

    const selectedService = services.find(s => s.id === service);
    const selectedDateAvailability = availableDates.find((entry) => entry.iso === date);
    const fmt = (n: number) => '₱' + n.toLocaleString();

    const selectedTimeIsAvailable = !!time && timeSlots.some((slot) => {
        const remaining = Number(slot.available);
        return slot.time === time
            && slot.status !== 'FULL'
            && slot.status !== 'OVER_CAPACITY'
            && Number.isFinite(remaining)
            && remaining > 0;
    });
    const scheduleIsKnownAvailable = !!selectedDateAvailability?.isSelectable
        && selectedTimeIsAvailable
        && !datesLoading
        && !slotsLoading;
    const canGoToStep2 = Boolean(service && date && scheduleIsKnownAvailable);
    const canSubmit = Boolean(canGoToStep2 && model && phone && name);

    const handleSubmit = async () => {
        if (!user) {
            toast.error("Please log in to book an appointment.");
            return;
        }
        if (!scheduleIsKnownAvailable) {
            setStep(1);
            toast.error(
                availabilityErrorCode === 'EMERGENCY_CLOSED'
                    ? EMERGENCY_CLOSURE_MESSAGE
                    : 'Please select an available appointment date and time.',
            );
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                customer: user.id,
                customerName: name || user.name || 'Guest User',
                vehicleYear: '2020', // Defaulting for simple quick book
                vehicleMake: model.split(' ')[0] || 'Unknown',
                vehicleModel: model,
                vehicleColor: 'Unknown',
                serviceType: selectedService?.name || service,
                price: selectedService?.basePrice || 0,
                bookingDate: date,
                bookingTime: time,
                notes: 'Quick Booked',
                items: JSON.stringify([{
                    product: selectedService?.id || service,
                    quantity: 1,
                    price: selectedService?.basePrice || 0
                }])
            };
            
            const response = await OrderService.createOrder(payload);

            if (response?.success) {
                toast.success("Booking confirmed! See you soon.");
                syncAvailabilityCaches();
                onClose();
            } else {
                const responsePayload: any = response || {};
                const emergencyClosed = isEmergencyClosurePayload(responsePayload);
                const message = emergencyClosed
                    ? EMERGENCY_CLOSURE_MESSAGE
                    : responsePayload?.message || 'Failed to submit booking';
                if (emergencyClosed) {
                    setDate('');
                    setTime('');
                    setTimeSlots([]);
                    setStep(1);
                    setAvailabilityErrorCode('EMERGENCY_CLOSED');
                    setAvailabilityError(message);
                    void fetchAvailableDates(null).then(() => {
                        setAvailabilityErrorCode('EMERGENCY_CLOSED');
                        setAvailabilityError(message);
                    });
                }
                toast.error(message);
            }
        } catch (error: any) {
            const errorPayload = error?.response?.data || {};
            const status = Number(error?.response?.status || 0);
            const emergencyClosed = isEmergencyClosurePayload(errorPayload);
            const backendMessage = emergencyClosed
                ? EMERGENCY_CLOSURE_MESSAGE
                : errorPayload?.message || error?.message || 'Error submitting booking';
            if (emergencyClosed || status === 409) {
                setDate('');
                setTime('');
                setTimeSlots([]);
                setStep(1);
                setAvailabilityErrorCode(emergencyClosed ? 'EMERGENCY_CLOSED' : getAvailabilityErrorCode(errorPayload));
                setAvailabilityError(backendMessage);
                void fetchAvailableDates(null).then(() => {
                    setAvailabilityErrorCode(emergencyClosed ? 'EMERGENCY_CLOSED' : getAvailabilityErrorCode(errorPayload));
                    setAvailabilityError(backendMessage);
                });
            }
            toast.error(backendMessage);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-background/90 glass border border-gold/20 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border/50">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Quick Book
                    </h2>
                    <button 
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 p-2 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {step === 1 ? (
                        <div className="space-y-6 animate-in slide-in-from-left-4">
                            {/* Service */}
                            <div>
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">1. Select Service</Label>
                                {loading ? (
                                    <div className="h-11 bg-muted/40 animate-pulse rounded-xl" />
                                ) : (
                                    <select
                                        value={service}
                                        onChange={(e) => setService(e.target.value)}
                                        className="w-full h-12 px-4 rounded-xl bg-muted/30 border border-border focus:border-gold/50 text-sm font-medium outline-none appearance-none cursor-pointer"
                                    >
                                        {services.map(s => (
                                            <option key={s.id} value={s.id} className="bg-background">
                                                {s.name} - {fmt(s.basePrice)}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Schedule */}
                            <div>
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">2. Date</Label>
                                {availabilityError && (
                                    <div className={cn(
                                        'mb-3 rounded-xl border px-4 py-3 text-sm',
                                        availabilityErrorCode === 'EMERGENCY_CLOSED'
                                            ? 'border-red-500/30 bg-red-500/10 text-red-700'
                                            : 'border-amber-500/20 bg-amber-500/5 text-amber-700',
                                    )}>
                                        {availabilityErrorCode === 'EMERGENCY_CLOSED' && (
                                            <p className="mb-1 text-xs font-bold uppercase tracking-wide">Emergency Closed</p>
                                        )}
                                        <p>{availabilityError}</p>
                                    </div>
                                )}
                                {datesLoading ? (
                                    <div className="flex h-[84px] items-center justify-center gap-2 rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading live dates...
                                    </div>
                                ) : availableDates.length > 0 ? (
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                                        {availableDates.map((dateOption) => {
                                            const { iso, date: availableDate, remaining } = dateOption;
                                            const sel = date === iso && dateOption.isSelectable;
                                            const statusLabel = dateOption.isEmergency
                                                ? 'Emergency Closed'
                                                : dateOption.isClosed
                                                    ? 'Closed'
                                                    : !dateOption.isSelectable
                                                        ? 'Fully Booked'
                                                        : `${remaining} available`;
                                            return (
                                                <button
                                                    key={iso}
                                                    type="button"
                                                    disabled={!dateOption.isSelectable}
                                                    aria-label={`${iso}: ${statusLabel}`}
                                                    onClick={() => {
                                                        if (!dateOption.isSelectable) return;
                                                        setDate(iso);
                                                        setTime('');
                                                        setTimeSlots([]);
                                                        setAvailabilityError('');
                                                        setAvailabilityErrorCode(null);
                                                    }}
                                                    className={cn(
                                                        "shrink-0 snap-start flex flex-col items-center justify-center w-[78px] h-[88px] rounded-2xl border transition-all duration-200 disabled:cursor-not-allowed",
                                                        dateOption.isEmergency
                                                            ? 'border-red-500/35 bg-red-500/10 text-red-700'
                                                            : !dateOption.isSelectable
                                                                ? 'border-border bg-muted/30 text-muted-foreground opacity-65'
                                                                : sel
                                                            ? "border-gold bg-gold/10 text-primary shadow-[0_0_15px_rgba(212,175,55,0.15)]"
                                                            : "border-border hover:border-gold/30 bg-muted/20 text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">{availableDate.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                                                    <span className="text-2xl font-black my-1">{availableDate.getDate()}</span>
                                                    <span className="max-w-[72px] text-center text-[8px] font-semibold leading-tight">{statusLabel}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
                                        {availabilityError || 'No bookable dates are currently available.'}
                                    </div>
                                )}
                                {businessDate && businessTimeZone && (
                                    <p className="mt-2 text-[10px] text-muted-foreground">
                                        Today is {businessDate} in {businessTimeZone}.
                                    </p>
                                )}
                            </div>

                            {/* Time */}
                            {date && (
                                <div>
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">3. Time</Label>
                                    {selectedDateAvailability?.isSelectable && (
                                        <div className="mb-2 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                                            <span className="font-semibold text-emerald-700">
                                                {selectedDateAvailability.remaining} appointment{selectedDateAvailability.remaining === 1 ? '' : 's'} remaining
                                            </span>
                                            <span className="text-muted-foreground">
                                                {selectedDateAvailability.booked} / {selectedDateAvailability.capacity} booked
                                            </span>
                                        </div>
                                    )}
                                    {slotsLoading ? (
                                        <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Loading live times...
                                        </div>
                                    ) : timeSlots.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {timeSlots.map(slot => {
                                                const available = Number(slot.available);
                                                const full = slot.status === 'FULL'
                                                    || slot.status === 'OVER_CAPACITY'
                                                    || !Number.isFinite(available)
                                                    || available <= 0;
                                                return (
                                                    <button
                                                        key={slot.time}
                                                        type="button"
                                                        disabled={full}
                                                        onClick={() => !full && setTime(slot.time)}
                                                        className={cn(
                                                            "rounded-xl border py-3 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                                                            time === slot.time
                                                                ? "border-gold bg-gold/10 text-primary"
                                                                : "border-border hover:border-gold/30 bg-muted/20 text-muted-foreground"
                                                        )}
                                                    >
                                                        <span className="block">{slot.label || slot.time}</span>
                                                        <span className="mt-0.5 block text-[10px] opacity-70">
                                                            {full ? 'Booked' : 'Available'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
                                            {availabilityError || 'No bookable times are available on this date.'}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-4">
                                <Button 
                                    onClick={() => setStep(2)} 
                                    disabled={!canGoToStep2}
                                    className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 font-bold"
                                >
                                    Continue
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="p-4 rounded-xl bg-gold/5 border border-gold/20 flex justify-between items-center mb-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">Appointment</p>
                                    <p className="text-sm font-bold">{selectedService?.name}</p>
                                    <p className="text-xs">{new Date(date).toLocaleDateString()} @ {time}</p>
                                </div>
                                <button onClick={() => setStep(1)} className="text-xs text-primary underline">Edit</button>
                            </div>

                            {!user ? (
                                <div className="text-center py-6">
                                    <User className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-sm text-foreground mb-4">Please log in to finalize your booking.</p>
                                    <Button className="w-full bg-primary text-primary-foreground" asChild>
                                        <a href="/login?redirect=/services">Log In Now</a>
                                    </Button>
                                    <Button variant="ghost" className="w-full mt-2" onClick={onClose}>Cancel</Button>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Your Name</Label>
                                        <Input
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            placeholder="John Doe"
                                            className="bg-muted/30 border-border h-11"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Phone Number</Label>
                                        <Input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+63 9XX XXX XXXX"
                                            className="bg-muted/30 border-border h-11"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Vehicle Model</Label>
                                        <div className="relative">
                                            <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                value={model}
                                                onChange={e => setModel(e.target.value)}
                                                placeholder="e.g. Toyota GR86"
                                                className="bg-muted/30 border-border pl-10 h-11"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-border/50">
                                        <div className="flex justify-between items-end mb-4">
                                            <span className="text-sm text-muted-foreground">Total Due In-Store:</span>
                                            <span className="text-xl font-bold text-primary">{fmt(selectedService?.basePrice || 0)}</span>
                                        </div>
                                        <Button 
                                            onClick={handleSubmit} 
                                            disabled={!canSubmit || submitting}
                                            className="w-full h-12 bg-gradient-gold text-primary-foreground hover:opacity-90 font-bold shadow-xl shadow-gold/10"
                                        >
                                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Quick Book"}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
