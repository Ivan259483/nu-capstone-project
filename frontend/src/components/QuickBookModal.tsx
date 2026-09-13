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
} from '@/lib/availabilitySync';
import {
    BOOKING_NOT_SUBMITTED_LABEL,
    BOOKING_TIME_CONFLICT_MESSAGE,
    buildBookingConflictEventId,
    buildBookingTransportEventId,
    createBookingFailureNotificationGuard,
    createBookingRequestId,
    type BookingFailureEvent,
    type BookingFailureSource,
} from '@/lib/booking-failure';

/* ─────────────────────── Constants ─────────────────────── */
const vehicleTypes = ["sedan", "suv", "truck", "van", "sports"] as const;
const CAR_COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Other'];
const YEARS = Array.from({ length: 15 }, (_, i) => String(2025 - i));
const EMERGENCY_CLOSURE_MESSAGE = 'Bookings for today have been temporarily closed. Please select another available date.';
const DATE_NO_LONGER_AVAILABLE_MESSAGE = 'The selected appointment date is no longer available. Please select another available date.';

function toLocalDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getManilaDateKey(date = new Date()): string {
    const shifted = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
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
    const submissionInFlightRef = useRef(false);
    const availabilityRefreshQueuedRef = useRef(false);
    const selectionRevisionRef = useRef(0);
    const bookingRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
    const bookingFailureGuardRef = useRef<ReturnType<typeof createBookingFailureNotificationGuard> | null>(null);
    if (!bookingFailureGuardRef.current) {
        bookingFailureGuardRef.current = createBookingFailureNotificationGuard((event) => {
            toast.error(event.title, {
                id: event.notificationId ?? event.eventId,
                description: event.message,
                duration: 5000,
            });
        });
    }
    selectedDateRef.current = date;
    selectedTimeRef.current = time;
    businessDateRef.current = businessDate;

    const beginNewBookingSelection = useCallback(() => {
        selectionRevisionRef.current += 1;
        bookingRequestRef.current = null;
        bookingFailureGuardRef.current?.reset();
    }, []);

    const handleBookingFailureOnce = useCallback((
        event: BookingFailureEvent,
        options: { clearTime?: boolean; returnToSchedule?: boolean } = {},
    ) => {
        const handled = bookingFailureGuardRef.current?.notifyOnce(event) ?? false;
        if (!handled) return false;

        if (options.clearTime !== false) {
            selectedTimeRef.current = '';
            setTime('');
        }
        setAvailabilityErrorCode(event.errorCode || null);
        setAvailabilityError(
            options.clearTime === false
                ? event.message
                : `${BOOKING_NOT_SUBMITTED_LABEL}. ${event.message}`,
        );
        if (options.returnToSchedule !== false) setStep(1);
        return true;
    }, []);

    const fetchAvailableDates = useCallback(async (
        selectedIso: string | null = selectedDateRef.current,
        options: { silent?: boolean; source?: BookingFailureSource; preserveFailureMessage?: boolean } = {},
    ): Promise<boolean> => {
        if (!isOpen || !user) {
            setAvailabilityError('Sign in to load live appointment availability.');
            return false;
        }

        const requestId = ++rangeRequestRef.current;
        setDatesLoading(true);
        try {
            const knownBusinessDate = parseIsoAsLocalDate(businessDateRef.current);
            const startDate = knownBusinessDate || parseIsoAsLocalDate(getManilaDateKey()) || new Date();
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
                : businessDateRef.current || getManilaDateKey();
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
                setTimeSlots([]);
                const currentTime = selectedTimeRef.current;
                handleBookingFailureOnce({
                    eventId: buildBookingConflictEventId({
                        bookingRequestId: null,
                        selectionRevision: selectionRevisionRef.current,
                        date: selectedIso,
                        time: currentTime,
                    }),
                    selectionRevision: selectionRevisionRef.current,
                    date: selectedIso,
                    time: currentTime,
                    errorCode: emergencyClosed ? 'EMERGENCY_CLOSED' : 'DATE_UNAVAILABLE',
                    source: options.source || 'availability',
                    title: BOOKING_NOT_SUBMITTED_LABEL,
                    message,
                });
                return false;
            }

            if (!options.preserveFailureMessage) {
                setAvailabilityErrorCode(null);
                setAvailabilityError(
                    nextDates.some((entry) => entry.isSelectable)
                        ? ''
                        : 'No bookable appointment dates are currently available.',
                );
            }
            return true;
        } catch (error) {
            if (requestId !== rangeRequestRef.current) return false;
            console.error('Failed to load appointment dates', error);
            setAvailableDates([]);
            setTimeSlots([]);
            if (!options.preserveFailureMessage) {
                setAvailabilityErrorCode(null);
                setAvailabilityError('Live appointment availability could not be loaded. Please try again.');
            }
            if (!options.silent) {
                const attemptId = createBookingRequestId('quick-book-calendar');
                handleBookingFailureOnce({
                    eventId: buildBookingTransportEventId(attemptId),
                    selectionRevision: selectionRevisionRef.current,
                    date: selectedIso || '',
                    time: selectedTimeRef.current,
                    errorCode: 'AVAILABILITY_UNVERIFIED',
                    source: 'transport',
                    title: 'Could not load calendar availability',
                    message: 'Booking is paused until live availability can be verified. Please try again.',
                }, { clearTime: false, returnToSchedule: false });
            }
            return false;
        } finally {
            if (requestId === rangeRequestRef.current) setDatesLoading(false);
        }
    }, [handleBookingFailureOnce, isOpen, user]);

    const fetchTimeSlotsForDate = useCallback(async (
        targetDate: string,
        options: { silent?: boolean; source?: BookingFailureSource; preserveFailureMessage?: boolean } = {},
    ): Promise<boolean> => {
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
                setTimeSlots([]);
                const currentTime = selectedTimeRef.current;
                if (currentTime) {
                    handleBookingFailureOnce({
                        eventId: buildBookingConflictEventId({
                            bookingRequestId: null,
                            selectionRevision: selectionRevisionRef.current,
                            date: targetDate,
                            time: currentTime,
                        }),
                        selectionRevision: selectionRevisionRef.current,
                        date: targetDate,
                        time: currentTime,
                        errorCode: emergencyClosed ? 'EMERGENCY_CLOSED' : getAvailabilityErrorCode(payload),
                        source: options.source || 'availability',
                        title: BOOKING_NOT_SUBMITTED_LABEL,
                        message: emergencyClosed ? message : BOOKING_TIME_CONFLICT_MESSAGE,
                    });
                } else {
                    setStep(1);
                    if (!options.preserveFailureMessage) {
                        setAvailabilityErrorCode(emergencyClosed ? 'EMERGENCY_CLOSED' : getAvailabilityErrorCode(payload));
                        setAvailabilityError(message);
                    }
                }
                return false;
            }

            setTimeSlots(slots.filter((slot: any) => (
                slot.status !== 'FULL'
                && slot.status !== 'OVER_CAPACITY'
                && Number(slot.available) > 0
            )));
            if (!options.preserveFailureMessage) {
                setAvailabilityErrorCode(null);
                setAvailabilityError('');
            }
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
                    handleBookingFailureOnce({
                        eventId: buildBookingConflictEventId({
                            bookingRequestId: null,
                            selectionRevision: selectionRevisionRef.current,
                            date: targetDate,
                            time: currentTime,
                        }),
                        selectionRevision: selectionRevisionRef.current,
                        date: targetDate,
                        time: currentTime,
                        errorCode: 'SLOT_FULL',
                        source: options.source || 'availability',
                        title: BOOKING_NOT_SUBMITTED_LABEL,
                        message: BOOKING_TIME_CONFLICT_MESSAGE,
                    });
                }
            }
            return true;
        } catch (error) {
            if (requestId !== slotRequestRef.current) return false;
            console.error('Failed to load appointment time slots', error);
            setTimeSlots([]);
            if (!options.preserveFailureMessage) {
                setAvailabilityErrorCode(null);
                setAvailabilityError('Available times could not be loaded. Please try another date.');
            }
            if (!options.silent) {
                const attemptId = createBookingRequestId('quick-book-slots');
                handleBookingFailureOnce({
                    eventId: buildBookingTransportEventId(attemptId),
                    selectionRevision: selectionRevisionRef.current,
                    date: targetDate,
                    time: selectedTimeRef.current,
                    errorCode: 'AVAILABILITY_UNVERIFIED',
                    source: 'transport',
                    title: 'Could not load available times',
                    message: 'Booking is paused until live availability can be verified. Please try again.',
                }, { clearTime: false, returnToSchedule: false });
            }
            return false;
        } finally {
            if (requestId === slotRequestRef.current) setSlotsLoading(false);
        }
    }, [handleBookingFailureOnce, isOpen, user]);

    const fetchAvailableDatesRef = useRef(fetchAvailableDates);
    const fetchTimeSlotsForDateRef = useRef(fetchTimeSlotsForDate);
    fetchAvailableDatesRef.current = fetchAvailableDates;
    fetchTimeSlotsForDateRef.current = fetchTimeSlotsForDate;

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
        availabilityRefreshQueuedRef.current = false;
        submissionInFlightRef.current = false;
        beginNewBookingSelection();
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
    }, [beginNewBookingSelection, fetchAvailableDates, isOpen, preselectedServiceId, user]);

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
            if (submissionInFlightRef.current) {
                availabilityRefreshQueuedRef.current = true;
                return;
            }
            const selectedIso = selectedDateRef.current;
            void fetchAvailableDatesRef.current(selectedIso, { silent: true, source: 'realtime' }).then((selectedDateStillAvailable) => {
                if (
                    selectedDateStillAvailable
                    && selectedIso
                    && selectedDateRef.current === selectedIso
                ) {
                    void fetchTimeSlotsForDateRef.current(selectedIso, { silent: true, source: 'realtime' });
                }
            });
        };
        window.addEventListener(AVAILABILITY_UPDATED_EVENT, handleAvailabilityUpdate);
        return () => window.removeEventListener(AVAILABILITY_UPDATED_EVENT, handleAvailabilityUpdate);
    }, [isOpen]);

    const closeQuickBook = () => {
        availabilityRefreshQueuedRef.current = false;
        beginNewBookingSelection();
        onClose();
    };

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

        if (submissionInFlightRef.current) return;
        const requestFingerprint = [service, date, time, model].join('|');
        if (bookingRequestRef.current?.fingerprint !== requestFingerprint) {
            bookingRequestRef.current = {
                fingerprint: requestFingerprint,
                id: createBookingRequestId('quick-booking'),
            };
        }
        const bookingRequestId = bookingRequestRef.current.id;
        const submissionAttemptId = createBookingRequestId('quick-booking-attempt');
        submissionInFlightRef.current = true;
        availabilityRefreshQueuedRef.current = false;
        setSubmitting(true);
        try {
            const payload = {
                customer: user.id,
                customerName: name || user.name || 'Guest User',
                vehicleYear: '2020', // Defaulting for simple quick book
                vehicleMake: model.split(' ')[0] || 'Unknown',
                vehicleModel: model,
                vehicleColor: 'Not specified',
                serviceType: selectedService?.name || service,
                price: selectedService?.basePrice || 0,
                bookingDate: date,
                bookingTime: time,
                notes: 'Quick Booked',
                items: JSON.stringify([{
                    product: selectedService?.id || service,
                    quantity: 1,
                    price: selectedService?.basePrice || 0
                }]),
                bookingRequestId,
            };
            
            const response = await OrderService.createOrder(payload, { idempotencyKey: bookingRequestId });

            if (response?.success) {
                availabilityRefreshQueuedRef.current = false;
                bookingFailureGuardRef.current?.reset();
                toast.success("Booking confirmed! See you soon.");
                closeQuickBook();
            } else {
                const responsePayload: any = response || {};
                const emergencyClosed = isEmergencyClosurePayload(responsePayload);
                const errorCode = getAvailabilityErrorCode(responsePayload);
                const isConflict = responsePayload?.status === 409 || errorCode === 'SLOT_FULL' || emergencyClosed;
                const message = emergencyClosed
                    ? EMERGENCY_CLOSURE_MESSAGE
                    : errorCode === 'SLOT_FULL'
                        ? BOOKING_TIME_CONFLICT_MESSAGE
                        : responsePayload?.message || 'Failed to submit booking';
                if (isConflict) {
                    handleBookingFailureOnce({
                        eventId: buildBookingConflictEventId({
                            bookingRequestId,
                            selectionRevision: selectionRevisionRef.current,
                            date,
                            time,
                        }),
                        bookingRequestId,
                        selectionRevision: selectionRevisionRef.current,
                        date,
                        time,
                        errorCode,
                        source: 'submit',
                        title: BOOKING_NOT_SUBMITTED_LABEL,
                        message,
                    });
                    availabilityRefreshQueuedRef.current = false;
                    void fetchAvailableDatesRef.current(null, { silent: true, preserveFailureMessage: true });
                    void fetchTimeSlotsForDateRef.current(date, { silent: true, preserveFailureMessage: true });
                } else {
                    handleBookingFailureOnce({
                        eventId: buildBookingTransportEventId(submissionAttemptId),
                        bookingRequestId,
                        selectionRevision: selectionRevisionRef.current,
                        date,
                        time,
                        source: 'transport',
                        title: 'Booking failed',
                        message,
                    }, { clearTime: false, returnToSchedule: false });
                }
            }
        } catch (error: any) {
            const errorPayload = error?.response?.data || {};
            const status = Number(error?.response?.status || 0);
            const emergencyClosed = isEmergencyClosurePayload(errorPayload);
            const errorCode = getAvailabilityErrorCode(errorPayload);
            const backendMessage = emergencyClosed
                ? EMERGENCY_CLOSURE_MESSAGE
                : errorCode === 'SLOT_FULL'
                    ? BOOKING_TIME_CONFLICT_MESSAGE
                    : errorPayload?.message || error?.message || 'Error submitting booking';
            if ((emergencyClosed || status === 409) && errorCode !== 'BOOKING_REQUEST_REUSED') {
                handleBookingFailureOnce({
                    eventId: buildBookingConflictEventId({
                        bookingRequestId,
                        selectionRevision: selectionRevisionRef.current,
                        date,
                        time,
                    }),
                    bookingRequestId,
                    selectionRevision: selectionRevisionRef.current,
                    date,
                    time,
                    errorCode: emergencyClosed ? 'EMERGENCY_CLOSED' : errorCode,
                    source: 'submit',
                    title: BOOKING_NOT_SUBMITTED_LABEL,
                    message: backendMessage,
                });
                availabilityRefreshQueuedRef.current = false;
                void fetchAvailableDatesRef.current(null, { silent: true, preserveFailureMessage: true });
                void fetchTimeSlotsForDateRef.current(date, { silent: true, preserveFailureMessage: true });
            } else {
                handleBookingFailureOnce({
                    eventId: buildBookingTransportEventId(submissionAttemptId),
                    bookingRequestId,
                    selectionRevision: selectionRevisionRef.current,
                    date,
                    time,
                    errorCode,
                    source: 'transport',
                    title: 'Booking failed',
                    message: backendMessage,
                }, { clearTime: false, returnToSchedule: false });
            }
        } finally {
            submissionInFlightRef.current = false;
            setSubmitting(false);
            if (availabilityRefreshQueuedRef.current) {
                availabilityRefreshQueuedRef.current = false;
                const selectedIso = selectedDateRef.current;
                void fetchAvailableDatesRef.current(null, { silent: true, preserveFailureMessage: true });
                if (selectedIso) {
                    void fetchTimeSlotsForDateRef.current(selectedIso, { silent: true, preserveFailureMessage: true });
                }
            }
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
                        onClick={closeQuickBook}
                        disabled={submitting}
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
                                                        beginNewBookingSelection();
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
                                                        onClick={() => {
                                                            if (full) return;
                                                            beginNewBookingSelection();
                                                            setTime(slot.time);
                                                        }}
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
                                    <p className="text-xs">{parseIsoAsLocalDate(date)?.toLocaleDateString('en-PH') || date} @ {time}</p>
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
                                    <Button variant="ghost" className="w-full mt-2" onClick={closeQuickBook}>Cancel</Button>
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
