import { useState, useEffect } from "react";
import { Calendar, Car, X, Sparkles, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { OrderService, type AvailableSlotsResponse } from '@/lib/order-service';
import { cn } from "@/lib/utils";
import api from '@/lib/api';
import { syncAvailabilityCaches } from '@/lib/availabilitySync';

/* ─────────────────────── Constants ─────────────────────── */
const vehicleTypes = ["sedan", "suv", "truck", "van", "sports"] as const;
const CAR_COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Other'];
const YEARS = Array.from({ length: 15 }, (_, i) => String(2025 - i));

function toLocalDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type SlotOption = NonNullable<AvailableSlotsResponse['slots']>[number];
type DateOption = { iso: string; date: Date };

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
    
    // Form state
    const [service, setService] = useState(preselectedServiceId || "");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [model, setModel] = useState("");
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    
    const [step, setStep] = useState<1 | 2>(1);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setDate("");
            setTime("");
            setAvailableDates([]);
            setTimeSlots([]);
            setAvailabilityError('');
            if (user) {
                setName(user.name || "");
                // Pre-fill phone if available in user object
                if ((user as any).phone) setPhone((user as any).phone);
            }
            
            // Fetch services
            const fetchServices = async () => {
                setLoading(true);
                try {
                    const res = await api.get('/services/published');
                    if (res.data.success && Array.isArray(res.data.data)) {
                        const mapped = res.data.data.map((s: any) => ({ ...s, id: s._id || s.id }));
                        setServices(mapped);
                        if (!service && mapped.length > 0) {
                            setService(preselectedServiceId || mapped[0].id);
                        }
                    }
                } catch (err) {
                    console.error("Failed to load services", err);
                } finally {
                    setLoading(false);
                }
            };
            fetchServices();

            const fetchAvailableDates = async () => {
                if (!user) {
                    setAvailabilityError('Sign in to load live appointment availability.');
                    return;
                }

                setDatesLoading(true);
                try {
                    const startDate = new Date();
                    startDate.setHours(0, 0, 0, 0);
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 61);
                    const response = await api.get('/slots/range', {
                        params: { start: toLocalDateKey(startDate), end: toLocalDateKey(endDate) },
                        meta: { suppressErrorToast: true },
                    } as any);
                    const summaries = Array.isArray(response.data?.data) ? response.data.data : [];
                    const nextDates = summaries
                        .filter((summary: any) => (
                            summary?.isClosed === false
                            && /^\d{4}-\d{2}-\d{2}$/.test(String(summary?.date || ''))
                            && ['AVAILABLE', 'ALMOST_FULL', 'OVER_CAPACITY'].includes(String(summary?.status || '').toUpperCase())
                            && Number.isFinite(Number(summary?.availableSlots))
                            && String(summary?.status || '').toUpperCase() !== 'FULL'
                            && Number(summary?.availableSlots) > 0
                        ))
                        .map((summary: any) => ({
                            iso: String(summary.date),
                            date: new Date(`${summary.date}T00:00:00`),
                        }))
                        .filter((entry: DateOption) => !Number.isNaN(entry.date.getTime()));
                    setAvailableDates(nextDates);
                    if (nextDates.length === 0) {
                        setAvailabilityError('No bookable appointment dates are currently available.');
                    }
                } catch (error) {
                    console.error('Failed to load appointment dates', error);
                    setAvailableDates([]);
                    setAvailabilityError('Live appointment availability could not be loaded. Please try again.');
                } finally {
                    setDatesLoading(false);
                }
            };
            fetchAvailableDates();
        }
    }, [isOpen, user, preselectedServiceId]);

    useEffect(() => {
        if (!isOpen || !user || !date) {
            setTimeSlots([]);
            setSlotsLoading(false);
            return;
        }

        let active = true;
        const fetchTimeSlots = async () => {
            setSlotsLoading(true);
            setAvailabilityError('');
            try {
                const response = await api.get<AvailableSlotsResponse>('/orders/available-slots', {
                    params: { date },
                    meta: { suppressErrorToast: true },
                } as any);
                if (!active) return;
                const payload = response.data;
                const slots = (Array.isArray(payload?.slots) ? payload.slots : []).filter((slot) => (
                    typeof slot?.time === 'string'
                    && slot.time.length > 0
                    && ['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY'].includes(String(slot.status))
                    && Number.isFinite(Number(slot.capacity))
                    && Number.isFinite(Number(slot.booked))
                    && Number.isFinite(Number(slot.available))
                ));
                setTimeSlots(slots);

                if (!payload?.success || payload.unavailable || slots.length === 0) {
                    setTime('');
                    setAvailabilityError(
                        payload?.message
                        || payload?.error
                        || 'No bookable time slots are configured for this date.'
                    );
                }
            } catch (error) {
                if (!active) return;
                console.error('Failed to load appointment time slots', error);
                // Fail closed. The backend still validates submission, but the UI must
                // never invent operating hours when live availability is unavailable.
                setTime('');
                setTimeSlots([]);
                setAvailabilityError('Live time-slot availability could not be loaded. Please try another date.');
            } finally {
                if (active) setSlotsLoading(false);
            }
        };
        fetchTimeSlots();
        return () => { active = false; };
    }, [date, isOpen, user]);

    if (!isOpen) return null;

    const selectedService = services.find(s => s.id === service);
    const fmt = (n: number) => '₱' + n.toLocaleString();

    const canGoToStep2 = Boolean(service && date && time);
    const canSubmit = Boolean(canGoToStep2 && model && phone && name);

    const handleSubmit = async () => {
        if (!user) {
            toast.error("Please log in to book an appointment.");
            // Or redirect to login
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
                toast.error(response?.message || 'Failed to submit booking');
            }
        } catch (error: any) {
            const backendMessage = error?.response?.data?.message || error?.message;
            toast.error(backendMessage || 'Error submitting booking');
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
                                {datesLoading ? (
                                    <div className="flex h-[84px] items-center justify-center gap-2 rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading live dates...
                                    </div>
                                ) : availableDates.length > 0 ? (
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                                        {availableDates.map(({ iso, date: availableDate }) => {
                                            const sel = date === iso;
                                            return (
                                                <button
                                                    key={iso}
                                                    type="button"
                                                    onClick={() => {
                                                        setDate(iso);
                                                        setTime('');
                                                        setTimeSlots([]);
                                                    }}
                                                    className={cn(
                                                        "shrink-0 snap-start flex flex-col items-center justify-center w-[72px] h-[84px] rounded-2xl border transition-all duration-200",
                                                        sel
                                                            ? "border-gold bg-gold/10 text-primary shadow-[0_0_15px_rgba(212,175,55,0.15)]"
                                                            : "border-border hover:border-gold/30 bg-muted/20 text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">{availableDate.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                                                    <span className="text-2xl font-black my-1">{availableDate.getDate()}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
                                        {availabilityError || 'No bookable dates are currently available.'}
                                    </div>
                                )}
                            </div>

                            {/* Time */}
                            {date && (
                                <div>
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">3. Time</Label>
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
                                                            {full ? 'Full' : `${slot.available} slot${slot.available === 1 ? '' : 's'} available`}
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
