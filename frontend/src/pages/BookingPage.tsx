import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Car, User, CheckCircle, ChevronRight, ChevronLeft, Sparkles, Mail, Key } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import { toast } from 'sonner';
import { OrderService } from '@/lib/order-service';
import api from '@/lib/api';
import { cn } from "@/lib/utils";

/* ─────────────────────── Types & Constants ─────────────────────── */
interface BookingService {
    id: string;
    _id?: string;
    name: string;
    category: string;
    duration: string;
    basePrice: number;
    memberPrice?: number | null;
}

const vehicleTypes = ["sedan", "suv", "truck", "van", "sports"] as const;
const timeSlots = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];
const CAR_COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Other'];
const YEARS = Array.from({ length: 30 }, (_, i) => String(2025 - i));

function getAvailableDates(): Date[] {
    const dates: Date[] = [];
    const d = new Date();
    d.setDate(d.getDate() + 1); // start tomorrow
    while (dates.length < 30) {
        if (d.getDay() !== 0) dates.push(new Date(d)); // skip Sunday
        d.setDate(d.getDate() + 1);
    }
    return dates;
}
const AVAILABLE_DATES = getAvailableDates();

/* ─────────────────────── Auth Component ─────────────────────── */
function StepAuth() {
    const { login, setAuthUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return toast.error('Please enter email and password');
        setLoading(true);
        try {
            const res = await login(email, password);
            if (res.success) {
                toast.success('Login successful');
            } else {
                toast.error(res.message || 'Login failed');
            }
        } catch (err: any) {
            toast.error(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = async () => {
        setLoading(true);
        try {
            const { auth, googleProvider, isFirebaseInitialized } = await import('@/config/firebase');
            const { signInWithPopup } = await import('firebase/auth');
            if (!isFirebaseInitialized) { toast.error('Firebase config missing'); return; }
            const result = await signInWithPopup(auth, googleProvider);
            const fu = result.user;
            const apiModule = (await import('@/lib/api')).default;
            const response = await apiModule.post('/auth/social-login', {
                email: fu.email, name: fu.displayName, provider: 'google', providerId: fu.uid,
            });
            if (response.data.success) {
                const { token, user: userData } = response.data.data;
                localStorage.setItem('autospf_token', token);
                const { userStorage } = await import('@/lib/storage');
                userStorage.setCurrentUser(userData);
                setAuthUser(userData);
                toast.success('Login successful');
            } else {
                toast.error(response.data.message || 'Login failed');
            }
        } catch (err: any) {
            toast.error(err.message || 'Google Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-6">
                 <h2 className="text-2xl font-bold text-foreground mb-2">Sign in to Book</h2>
                 <p className="text-muted-foreground text-sm">You need an account to track your appointment.</p>
            </div>
            
            <button
                type="button" 
                onClick={handleSocialLogin} 
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border text-foreground text-sm font-medium transition-all duration-200 disabled:opacity-50"
            >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 4.9c1.7 0 3.24.62 4.44 1.64l3.32-3.32A11.95 11.95 0 0 0 12 1C8.16 1 4.83 3.06 3 6.14l2.27 3.62z" />
                    <path fill="#34A853" d="M16.04 18.01A7.08 7.08 0 0 1 12 19.1c-2.96 0-5.5-1.82-6.6-4.41L3.12 17.9C4.95 21.05 8.22 23 12 23c2.96 0 5.65-1.07 7.72-2.82l-3.68-2.17z" />
                    <path fill="#4A90D9" d="M19.72 20.18C21.72 18.22 23 15.36 23 12c0-.73-.1-1.44-.25-2.12H12v4.5h6.2a5.3 5.3 0 0 1-2.16 3.07l3.68 2.73z" />
                    <path fill="#FBBC05" d="M5.4 14.69A7.17 7.17 0 0 1 4.9 12c0-.94.17-1.84.47-2.68L3.1 5.7A11.93 11.93 0 0 0 1 12c0 1.92.45 3.74 1.24 5.36l3.16-2.67z" />
                </svg>
                Continue with Google
            </button>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center">
                    <span className="px-3 text-[11px] uppercase tracking-widest text-muted-foreground bg-background">or use email</span>
                </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <Label className="text-sm text-muted-foreground mb-1 block">Email</Label>
                    <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="bg-muted/40 border-border focus:border-primary pl-10"
                        />
                    </div>
                </div>
                <div>
                    <Label className="text-sm text-muted-foreground mb-1 block">Password</Label>
                    <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="bg-muted/40 border-border focus:border-primary pl-10"
                        />
                    </div>
                </div>
                <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                    {loading ? 'Signing in...' : 'Sign In'}
                </Button>
            </form>

            <div className="text-center mt-6">
                 <p className="text-xs text-muted-foreground">
                    Don't have an account?{' '}
                    <Link to="/login" className="text-primary hover:text-primary/80 font-medium ml-1">
                        Sign up here
                    </Link>
                 </p>
            </div>
        </div>
    );
}

/* ─────────────────────── Main Component ─────────────────────── */
export default function BookingPage() {
    const { t } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const defaultPkg = searchParams.get('pkg') ?? '';

    const [submitted, setSubmitted] = useState(false);
    
    // DB Services
    const [dbServices, setDbServices] = useState<BookingService[]>([]);

    useEffect(() => {
        const fetchServices = async () => {
            try {
                const res = await api.get('/services/published');
                if (res.data.success && Array.isArray(res.data.data)) {
                    const mapped = res.data.data.map((s: any) => ({ ...s, id: s._id || s.id }));
                    setDbServices(mapped);
                    if (!defaultPkg && mapped.length > 0 && !form.service) {
                        setForm(f => ({ ...f, service: mapped[0].id }));
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch published services:', err);
            }
        };
        fetchServices();
    }, [defaultPkg]); // eslint-disable-line

    const [form, setForm] = useState({
        service: defaultPkg,
        vehicleType: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleYear: "",
        vehicleColor: "",
        date: "",
        time: "",
        name: "",
        phone: "",
        notes: "",
    });

    // Populate user details if available
    useEffect(() => {
        if (user && !form.name) {
            setForm(f => ({ ...f, name: user.name || '' }));
        }
    }, [user]); // eslint-disable-line

    const update = (key: string, value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const selectedService = dbServices.find(s => s.id === form.service);
    const selectedPrice = selectedService?.basePrice || 0;
    const fmt = (n: number) => '₱' + n.toLocaleString();

    const isComplete = form.service && form.vehicleModel && form.vehicleYear && form.vehicleColor && form.date && form.time && form.name && form.phone;

    const handleSubmit = async () => {
        if (!user) return toast.error("Please login first");
        if (!isComplete) return toast.error("Please explicitly fill out all required fields.");

        try {
            const payload = {
                customer: user.id,
                customerName: form.name || user.name || 'Guest User',
                vehicleYear: form.vehicleYear,
                vehicleMake: form.vehicleMake || form.vehicleModel.split(' ')[0] || '',
                vehicleModel: form.vehicleModel,
                vehicleColor: form.vehicleColor,
                serviceType: selectedService?.name || form.service,
                price: selectedPrice,
                bookingDate: form.date,
                bookingTime: form.time,
                notes: form.notes,
                items: JSON.stringify([{
                    product: selectedService?.id || form.service,
                    quantity: 1,
                    price: selectedPrice
                }])
            };
            
            const response = await OrderService.createOrder(payload);

            if (response?.success) {
                setSubmitted(true);
                setTimeout(() => navigate('/customer/dashboard?tab=bookings'), 1500);
            } else {
                toast.error(response?.message || 'Failed to submit booking');
            }
        } catch (error: any) {
            console.error('Booking failed:', error);
            const backendMessage = error?.response?.data?.message || error?.message;
            toast.error(backendMessage || 'Error submitting booking');
        }
    };

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-12 section-dark overflow-hidden min-h-[30vh] flex flex-col items-center justify-center">
                <div className="absolute inset-0 bg-hero-pattern opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
                <div className="container max-w-4xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Calendar className="w-3.5 h-3.5" />
                        Express Booking
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-3 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("booking.title") || "Schedule Your Detail"}
                    </h1>
                </div>
            </section>

            <section className="py-12 section-darker relative z-20 pb-32">
                <div className="container max-w-6xl mx-auto px-6">
                    {!user ? (
                        <div className="glass rounded-3xl p-8 border border-gold/15 max-w-md mx-auto animate-scale-in">
                            <StepAuth />
                        </div>
                    ) : submitted ? (
                        <div className="glass rounded-3xl p-12 text-center border border-gold/20 animate-scale-in max-w-2xl mx-auto">
                            <div className="w-20 h-20 rounded-full bg-gradient-gold mx-auto mb-6 flex items-center justify-center glow-gold animate-pulse-gold">
                                <CheckCircle className="w-10 h-10 text-primary-foreground" />
                            </div>
                            <h2 className="text-3xl font-bold text-foreground mb-4">Booking Confirmed!</h2>
                            <p className="text-muted-foreground mb-8 text-lg">Your appointment request has been sent securely. You will be redirected to your dashboard shortly.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 relative items-start">
                            {/* Left Column: Form Details */}
                            <div className="lg:col-span-8 flex flex-col gap-8 animate-slide-up">
                                
                                {/* 1. Vehicle & Service */}
                                <div className="glass rounded-3xl p-6 md:p-8 border border-gold/15 shadow-xl relative overflow-hidden">
                                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
                                    <h3 className="text-xl font-bold flex items-center gap-3 mb-6 text-foreground">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                            <Car className="w-4 h-4" />
                                        </div>
                                        Vehicle & Service
                                    </h3>
                                    
                                    <div className="space-y-6">
                                        <div>
                                            <Label className="text-sm font-semibold text-foreground mb-3 block tracking-wide">Select Service</Label>
                                            {dbServices.length === 0 ? (
                                                <div className="text-center py-6 text-muted-foreground text-sm">Loading services...</div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {dbServices.map((svc) => (
                                                        <button
                                                            key={svc.id}
                                                            onClick={() => update("service", svc.id)}
                                                            className={cn(
                                                                "p-4 rounded-xl border text-left transition-all duration-300 flex flex-col justify-between h-full min-h-[90px]",
                                                                form.service === svc.id
                                                                    ? "border-gold/60 bg-gold/10 text-primary ring-1 ring-gold/30"
                                                                    : "border-border hover:border-gold/30 text-muted-foreground hover:text-foreground bg-muted/20"
                                                            )}
                                                        >
                                                            <div className="font-bold text-sm mb-1 leading-tight">{svc.name}</div>
                                                            <div className="flex justify-between items-end mt-auto w-full">
                                                                <span className="text-xs opacity-70">{svc.duration}</span>
                                                                <span className={cn("font-bold text-sm", form.service === svc.id ? "text-primary" : "text-foreground")}>
                                                                    {fmt(svc.basePrice)}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-border">
                                            <Label className="text-sm font-semibold text-foreground mb-4 block tracking-wide">Vehicle Details</Label>
                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                                                <div className="sm:col-span-6">
                                                    <Label className="text-xs text-muted-foreground mb-1.5 block">Model</Label>
                                                    <Input
                                                        value={form.vehicleModel}
                                                        onChange={(e) => update("vehicleModel", e.target.value)}
                                                        placeholder="e.g. Toyota GR86"
                                                        className="bg-muted/40 border-border focus:border-primary h-11"
                                                    />
                                                </div>
                                                <div className="sm:col-span-3">
                                                    <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                                                    <select
                                                        value={form.vehicleYear}
                                                        onChange={e => update('vehicleYear', e.target.value)}
                                                        className="w-full h-11 px-3 py-2 rounded-md bg-muted/40 border border-border focus:border-primary text-sm text-foreground outline-none appearance-none cursor-pointer"
                                                    >
                                                        <option value="" disabled>Year</option>
                                                        {YEARS.map(y => <option key={y} value={y} className="bg-background">{y}</option>)}
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-3">
                                                    <Label className="text-xs text-muted-foreground mb-1.5 block">Color</Label>
                                                    <select
                                                        value={form.vehicleColor}
                                                        onChange={e => update('vehicleColor', e.target.value)}
                                                        className="w-full h-11 px-3 py-2 rounded-md bg-muted/40 border border-border focus:border-primary text-sm text-foreground outline-none appearance-none cursor-pointer"
                                                    >
                                                        <option value="" disabled>Color</option>
                                                        {CAR_COLORS.map(c => <option key={c} value={c} className="bg-background">{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Schedule */}
                                <div className="glass rounded-3xl p-6 md:p-8 border border-gold/15 shadow-xl relative overflow-hidden">
                                     <h3 className="text-xl font-bold flex items-center gap-3 mb-6 text-foreground">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        Schedule
                                    </h3>
                                    
                                    <div className="space-y-6">
                                        <div>
                                            <Label className="text-sm font-semibold text-foreground mb-3 block tracking-wide">Preferred Date</Label>
                                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                                                {AVAILABLE_DATES.map(d => {
                                                    const iso = d.toISOString().split('T')[0];
                                                    const sel = form.date === iso;
                                                    return (
                                                        <button
                                                            key={iso}
                                                            onClick={() => update('date', iso)}
                                                            className={cn(
                                                                "flex flex-col items-center justify-center py-3 rounded-xl border text-center transition-all duration-200",
                                                                sel
                                                                    ? "border-gold/60 bg-gold/10 text-primary ring-1 ring-gold/30"
                                                                    : "border-border hover:border-gold/30 text-muted-foreground hover:text-foreground bg-muted/20"
                                                            )}
                                                        >
                                                            <span className="font-bold text-[10px] uppercase">
                                                                {d.toLocaleDateString('en-PH', { weekday: 'short' })}
                                                            </span>
                                                            <span className="text-xl font-black leading-none my-1.5">{d.getDate()}</span>
                                                            <span className="text-[10px] opacity-70">
                                                                {d.toLocaleDateString('en-PH', { month: 'short' })}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="pt-2">
                                            <Label className="text-sm font-semibold text-foreground mb-3 block tracking-wide">Preferred Time</Label>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                                {timeSlots.map((slot) => (
                                                    <button
                                                        key={slot}
                                                        onClick={() => update("time", slot)}
                                                        className={cn(
                                                            "py-3 rounded-xl border text-sm font-medium transition-all duration-300",
                                                            form.time === slot
                                                                ? "border-gold/60 bg-gold/10 text-primary ring-1 ring-gold/30"
                                                                : "border-border hover:border-gold/30 text-muted-foreground bg-muted/20 hover:text-foreground"
                                                        )}
                                                    >
                                                        {slot}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Contact Info */}
                                <div className="glass rounded-3xl p-6 md:p-8 border border-gold/15 shadow-xl relative overflow-hidden">
                                     <h3 className="text-xl font-bold flex items-center gap-3 mb-6 text-foreground">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                            <User className="w-4 h-4" />
                                        </div>
                                        Contact Information
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name</Label>
                                            <div className="relative">
                                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    value={form.name}
                                                    onChange={(e) => update("name", e.target.value)}
                                                    placeholder="Juan dela Cruz"
                                                    className="bg-muted/40 border-border focus:border-primary pl-10 h-11"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1.5 block">Phone Number</Label>
                                            <Input
                                                type="tel"
                                                value={form.phone}
                                                onChange={(e) => update("phone", e.target.value)}
                                                placeholder="+63 912 345 6789"
                                                className="bg-muted/40 border-border focus:border-primary h-11"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-xs text-muted-foreground mb-1.5 block">Additional Notes <span className="opacity-50">(optional)</span></Label>
                                            <textarea
                                                value={form.notes}
                                                onChange={(e) => update("notes", e.target.value)}
                                                placeholder="Any pre-existing scratches, specific instructions, etc."
                                                rows={3}
                                                className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border focus:border-primary text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Sticky Summary */}
                            <div className="lg:col-span-4 relative h-full">
                                <div className="sticky top-24 glass rounded-3xl p-6 md:p-8 border border-gold/20 shadow-2xl animate-fade-in">
                                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
                                    
                                    <h3 className="text-lg font-bold text-foreground mb-6 pb-4 border-b border-border">Booking Summary</h3>
                                    
                                    <div className="space-y-6">
                                        {/* Service */}
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Service</p>
                                            <p className="font-medium text-foreground text-sm sm:text-base">
                                                {selectedService ? selectedService.name : <span className="text-muted-foreground/50 italic">Not Selected</span>}
                                            </p>
                                        </div>

                                        {/* Vehicle */}
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Vehicle</p>
                                            <p className="font-medium text-foreground text-sm">
                                                {(form.vehicleYear || form.vehicleModel || form.vehicleColor) ? (
                                                    `${form.vehicleYear} ${form.vehicleModel} ${form.vehicleColor ? `(${form.vehicleColor})` : ''}`
                                                ) : <span className="text-muted-foreground/50 italic">Required</span>}
                                            </p>
                                        </div>

                                        {/* Date & Time */}
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Schedule</p>
                                            <p className="font-medium text-foreground text-sm">
                                                {(form.date && form.time) ? (
                                                    `${new Date(form.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric'})} at ${form.time}`
                                                ) : <span className="text-muted-foreground/50 italic">Required</span>}
                                            </p>
                                        </div>

                                        {/* Price */}
                                        <div className="pt-6 border-t border-border flex items-end justify-between">
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Total Price</p>
                                                <p className="text-2xl font-bold text-primary mt-1">{form.service ? fmt(selectedPrice) : '₱0'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={!isComplete}
                                            className="w-full h-12 text-base font-bold bg-gradient-gold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all duration-300 shadow-xl shadow-gold/10 group"
                                        >
                                            <Sparkles className="w-5 h-5 mr-2 group-disabled:opacity-50" />
                                            {isComplete ? "Confirm Booking" : "Finish Form"}
                                        </Button>
                                    </div>
                                    {!isComplete && (
                                        <p className="text-center text-xs text-muted-foreground mt-3">
                                            Please fill out all required fields.
                                        </p>
                                    )}
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </section>
        </PageLayout>
    );
}
