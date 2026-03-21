import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Key, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { OrderService } from '@/lib/order-service';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import {
    Car, CalendarDays, CheckCircle2, ArrowRight,
    ArrowLeft, Clock, User, Phone, ChevronDown,
    Sparkles, Shield, Crown, Check,
} from 'lucide-react';

/* ─────────────────────── Variants ─────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

const slideIn: Variants = {
    hidden: (dir: number) => ({ opacity: 0, x: dir * 48 }),
    visible: { opacity: 1, x: 0, transition: { duration: 0.42, ease: EASE } },
    exit: (dir: number) => ({ opacity: 0, x: dir * -48, transition: { duration: 0.25, ease: 'easeIn' } }),
};

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const popIn: Variants = {
    hidden: { opacity: 0, scale: 0.7 },
    visible: {
        opacity: 1, scale: 1,
        transition: { type: 'spring' as const, stiffness: 260, damping: 20, delay: 0.1 },
    },
};

/* ─────────────────────── Static data ─────────────────────── */
const PACKAGES = [
    {
        id: 'essential',
        label: 'Essential',
        sub: '₱3,500 — Maintenance & basic protection',
        icon: Shield,
        accent: 'border-slate-400/40 bg-slate-400/5',
        check: 'border-slate-400 bg-slate-400',
    },
    {
        id: 'elite',
        label: 'Elite',
        sub: '₱8,500 — Restoration & 1-year ceramic',
        icon: Sparkles,
        accent: 'border-orange-500/50 bg-orange-500/8',
        check: 'border-orange-500 bg-orange-500',
    },
    {
        id: 'ultimate',
        label: 'Ultimate',
        sub: '₱22,000 — Full PPF + 5-year coating',
        icon: Crown,
        accent: 'border-indigo-500/50 bg-indigo-500/8',
        check: 'border-indigo-400 bg-indigo-500',
    },
];

const TIME_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

const CAR_COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Other'];

const YEARS = Array.from({ length: 30 }, (_, i) => String(2025 - i));

/* ─────────────────────── Helpers ─────────────────────── */
const inputCls =
    'w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 ' +
    'placeholder:text-white/25 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 ' +
    'outline-none transition-all duration-200 appearance-none';

const labelCls = 'block text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-1.5';

/* Helper: generate next 30 available dates (skip Sundays) */
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

function formatDate(d: Date) {
    return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ════════════════════════════════════════
   STEP COMPONENTS
════════════════════════════════════════ */


/* ── Step 0: Account ── */
function StepAuth({ onNext }: { onNext: () => void }) {
    const { user, login, setAuthUser } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    if (user) {
        return (
            <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                    <User className="w-8 h-8 text-orange-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Welcome back, {user.name || 'User'}!</h3>
                    <p className="text-sm text-white/50">{user.email}</p>
                </div>
                <Button 
                    onClick={onNext}
                    className="mt-6 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold shadow-lg shadow-orange-500/20"
                >
                    Continue to Vehicle Selection <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>
        );
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return toast.error('Please enter email and password');
        setLoading(true);
        try {
            const res = await login(email, password);
            if (res.success) {
                toast.success('Login successful');
                onNext();
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
            const api = (await import('@/lib/api')).default;
            const response = await api.post('/auth/social-login', {
                email: fu.email, name: fu.displayName, provider: 'google', providerId: fu.uid,
            });
            if (response.data.success) {
                const { token, user: userData } = response.data.data;
                localStorage.setItem('autospf_token', token);
                const { userStorage } = await import('@/lib/storage');
                userStorage.setCurrentUser(userData);
                setAuthUser(userData);
                toast.success('Login successful');
                onNext();
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
                 <p className="text-white/60 text-sm">Sign in to your account to track your booking.</p>
            </div>
            
            <button
                type="button" 
                onClick={handleSocialLogin} 
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-white/80 hover:text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
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
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center">
                    <span className="px-3 text-[11px] uppercase tracking-widest text-white/40 bg-[#161b22]">or use email</span>
                </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className={labelCls}>Email</label>
                    <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            className={`${inputCls} pl-10`}
                        />
                    </div>
                </div>
                <div>
                    <label className={labelCls}>Password</label>
                    <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`${inputCls} pl-10`}
                        />
                    </div>
                </div>
                <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold"
                >
                    {loading ? 'Signing in...' : 'Sign In & Continue'}
                </Button>
            </form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center">
                    <span className="px-3 text-[11px] uppercase tracking-widest text-white/40 bg-[#161b22]">New to AutoSPF+?</span>
                </div>
            </div>

            <div className="text-center">
                 <p className="text-xs text-white/50">
                    Don't have an account?{' '}
                    <Link to="/login" className="text-orange-400 hover:text-orange-300 font-medium ml-1">
                        Sign up here
                    </Link>
                 </p>
            </div>
        </div>
    );
}

/* ── Step 1: Vehicle Info ── */
function StepVehicle({
    data, onChange,
}: {
    data: { model: string; year: string; color: string; pkg: string };
    onChange: (k: string, v: string) => void;
}) {
    return (
        <div className="space-y-5">
            {/* Package selection */}
            <div>
                <p className={labelCls}>Select Package</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {PACKAGES.map(({ id, label, sub, icon: Icon, accent, check }) => {
                        const selected = data.pkg === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => onChange('pkg', id)}
                                className={`relative flex flex-col gap-1.5 p-4 rounded-xl border text-left
                                    transition-all duration-200 ${selected ? accent : 'border-white/8 bg-white/[0.03] hover:border-white/15'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <Icon className={`w-4 h-4 ${selected ? 'text-orange-400' : 'text-white/30'}`} />
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
                                        ${selected ? check : 'border-white/20'}`}>
                                        {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                    </div>
                                </div>
                                <p className={`text-sm font-bold tracking-tight ${selected ? 'text-white' : 'text-white/60'}`}>{label}</p>
                                <p className="text-[10px] text-white/30 leading-snug">{sub}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Vehicle model */}
            <div>
                <label className={labelCls}>Vehicle Model</label>
                <input
                    value={data.model}
                    onChange={e => onChange('model', e.target.value)}
                    placeholder="e.g. Toyota GR86, Honda Civic, Range Rover"
                    className={inputCls}
                />
            </div>

            {/* Year + Color row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                    <label className={labelCls}>Year</label>
                    <div className="relative">
                        <select
                            value={data.year}
                            onChange={e => onChange('year', e.target.value)}
                            className={`${inputCls} pr-9 cursor-pointer`}
                        >
                            <option value="" disabled>Select year</option>
                            {YEARS.map(y => <option key={y} value={y} className="bg-[#0B1120]">{y}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                    </div>
                </div>
                <div className="relative">
                    <label className={labelCls}>Color</label>
                    <div className="relative">
                        <select
                            value={data.color}
                            onChange={e => onChange('color', e.target.value)}
                            className={`${inputCls} pr-9 cursor-pointer`}
                        >
                            <option value="" disabled>Select color</option>
                            {CAR_COLORS.map(c => <option key={c} value={c} className="bg-[#0B1120]">{c}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Step 2: Schedule ── */
function StepSchedule({
    data, onChange,
}: {
    data: { date: string; time: string };
    onChange: (k: string, v: string) => void;
}) {
    return (
        <div className="space-y-6">
            {/* Date picker */}
            <div>
                <p className={labelCls}>Preferred Date</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto pr-0.5
                                [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-white/5
                                [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {AVAILABLE_DATES.map(d => {
                        const iso = d.toISOString().split('T')[0];
                        const sel = data.date === iso;
                        return (
                            <button
                                key={iso}
                                type="button"
                                onClick={() => onChange('date', iso)}
                                className={`flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center
                                    transition-all duration-200 text-xs
                                    ${sel
                                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
                                        : 'border-white/8 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70'
                                    }`}
                            >
                                <span className="font-bold text-[10px] uppercase">
                                    {d.toLocaleDateString('en-PH', { weekday: 'short' })}
                                </span>
                                <span className="text-lg font-black leading-none my-0.5">{d.getDate()}</span>
                                <span className="text-[9px] opacity-70">
                                    {d.toLocaleDateString('en-PH', { month: 'short' })}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Time slots */}
            <div>
                <p className={labelCls}>Preferred Time</p>
                <div className="grid grid-cols-4 gap-2">
                    {TIME_SLOTS.map(t => {
                        const sel = data.time === t;
                        return (
                            <button
                                key={t}
                                type="button"
                                onClick={() => onChange('time', t)}
                                className={`flex items-center justify-center gap-1.5 h-10 rounded-xl border text-xs font-medium
                                    transition-all duration-200
                                    ${sel
                                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
                                        : 'border-white/8 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/70'
                                    }`}
                            >
                                <Clock className="w-3 h-3" />
                                {t}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ── Step 3: Confirm ── */
function StepConfirm({
    data, onChange,
}: {
    data: { name: string; phone: string; notes: string };
    onChange: (k: string, v: string) => void;
}) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Full Name</label>
                    <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                        <input
                            value={data.name}
                            onChange={e => onChange('name', e.target.value)}
                            placeholder="Juan dela Cruz"
                            className={`${inputCls} pl-10`}
                        />
                    </div>
                </div>
                <div>
                    <label className={labelCls}>Phone Number</label>
                    <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                        <input
                            value={data.phone}
                            onChange={e => onChange('phone', e.target.value)}
                            placeholder="+63 917 123 4567"
                            className={`${inputCls} pl-10`}
                        />
                    </div>
                </div>
            </div>

            <div>
                <label className={labelCls}>Additional Notes (optional)</label>
                <textarea
                    value={data.notes}
                    onChange={e => onChange('notes', e.target.value)}
                    placeholder="Any pre-existing scratches, ceramic history, specific concerns..."
                    rows={3}
                    className={`${inputCls} h-auto py-3 resize-none`}
                />
            </div>

            {/* Summary box */}
            <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3">Booking Summary</p>
                {[
                    ['Package', data.name ? `${data.name}` : '—'],
                ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                        <span className="text-white/30">{k}</span>
                        <span className="text-white/70 font-medium">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────── Success screen ─────────────────────── */
function SuccessScreen() {
    return (
        <motion.div
            className="flex flex-col items-center justify-center text-center py-12 px-6"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
            initial="hidden" animate="visible"
        >
            <motion.div variants={popIn}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-600
                           flex items-center justify-center shadow-2xl shadow-orange-500/30 mb-7">
                <CheckCircle2 className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h2 variants={fadeUp}
                className="text-3xl md:text-4xl font-serif font-medium text-white tracking-tight mb-3">
                Booking Request{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                    Sent!
                </span>
            </motion.h2>

            <motion.p variants={fadeUp} className="text-white/40 text-sm leading-relaxed max-w-sm mb-10">
                Our team in <span className="text-white/70 font-medium">Las Piñas</span> will review your request
                and contact you shortly to confirm your appointment.
            </motion.p>

            <motion.div variants={fadeUp} className="flex items-center gap-4 flex-wrap justify-center">
                <Link to="/">
                    <motion.span
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-white
                                   bg-gradient-to-r from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25
                                   hover:from-orange-600 hover:to-amber-700 transition-all duration-200 cursor-pointer"
                    >
                        Back to Home <ArrowRight className="w-4 h-4" />
                    </motion.span>
                </Link>
                <Link to="/login">
                    <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium text-white/40
                                    hover:text-white border border-white/10 hover:border-white/25 transition-all duration-200">
                        Sign In to Track
                    </span>
                </Link>
            </motion.div>
        </motion.div>
    );
}

/* ════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════ */
const STEPS = [
    { label: 'Account', icon: LogIn },
    { label: 'Vehicle', icon: Car },
    { label: 'Schedule', icon: CalendarDays },
    { label: 'Confirm', icon: CheckCircle2 },
];

export default function BookingPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const defaultPkg = searchParams.get('pkg') ?? 'elite';

    const [step, setStep] = useState(0);
    const [dir, setDir] = useState(1);
    const [submitted, setSubmitted] = useState(false);

    /* Form state */
    const [vehicle, setVehicle] = useState({ model: '', year: '', color: '', pkg: defaultPkg });
    const [schedule, setSchedule] = useState({ date: '', time: '' });
    const [contact, setContact] = useState({ name: '', phone: '', notes: '' });

    const updateVehicle = (k: string, v: string) => setVehicle(p => ({ ...p, [k]: v }));
    const updateSchedule = (k: string, v: string) => setSchedule(p => ({ ...p, [k]: v }));
    const updateContact = (k: string, v: string) => setContact(p => ({ ...p, [k]: v }));

    /* Validation per step */
        const canNext = [
        !!user, // Step 0: Account requires user to be logged in
        vehicle.model.trim() && vehicle.year && vehicle.color && vehicle.pkg,
        schedule.date && schedule.time,
        contact.name.trim() && contact.phone.trim(),
    ];

    const goNext = () => { setDir(1); setStep(s => s + 1); };
    const goPrev = () => { setDir(-1); setStep(s => s - 1); };
    
    // We already have user from context
    const handleSubmit = async () => {
        if (!user) {
            toast.error("You must be logged in to book.");
            setStep(0);
            return;
        }

        try {
            // Replicate order payload format
            const payload = {
                customer: user.id,
                customerName: contact.name || user.name || 'Guest User',
                vehicleYear: vehicle.year,
                vehicleMake: vehicle.model.split(' ')[0] || '', // Rough split for make
                vehicleModel: vehicle.model,
                vehicleColor: vehicle.color,
                serviceType: selectedPkg?.label || vehicle.pkg,
                price: selectedPkg?.id === 'essential' ? 3500 : selectedPkg?.id === 'elite' ? 8500 : 22000, // Basic mock price
                bookingDate: schedule.date,
                bookingTime: schedule.time,
                notes: contact.notes,
                items: JSON.stringify([{
                    product: 'custom_pkg', // Ideally from actual service DB if using IDs
                    quantity: 1,
                    price: selectedPkg?.id === 'essential' ? 3500 : selectedPkg?.id === 'elite' ? 8500 : 22000
                }])
            };
            
            const response = await OrderService.createOrder(payload);

            if (response?.success) {
                setSubmitted(true);
                // Send the customer straight to My Bookings so they see it immediately
                setTimeout(() => navigate('/customer/dashboard?tab=bookings'), 600);
            } else {
                toast.error(response?.message || 'Failed to submit booking');
            }

        } catch (error: any) {
            console.error('Booking failed:', error);
            const backendMessage =
                error?.response?.data?.message
                || error?.response?.data?.error
                || error?.message;
            toast.error(backendMessage || 'Error submitting booking');
        }
    };

    const selectedPkg = PACKAGES.find(p => p.id === vehicle.pkg);

    /* Inject pkg label into contact summary */
    const contactWithPkg = { ...contact, name: contact.name || '—', phone: contact.phone || '—' };
    // Override summary field
    const summaryData = {
        Package: selectedPkg?.label ?? '—',
        Vehicle: vehicle.model ? `${vehicle.year} ${vehicle.model} (${vehicle.color})` : '—',
        Date: schedule.date ? new Date(schedule.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }) : '—',
        Time: schedule.time || '—',
        Name: contactWithPkg.name,
        Phone: contactWithPkg.phone,
    };

    return (
        <div className="min-h-screen bg-[#0B1120] text-white font-sans selection:bg-orange-500/30 overflow-x-hidden">
            {/* Background blobs */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-orange-500/4 blur-[130px] rounded-full pointer-events-none z-0" />
            <div className="fixed bottom-0 right-0 w-[400px] h-[280px] bg-indigo-500/4 blur-[100px] rounded-full pointer-events-none z-0" />

            <div className="relative z-[1] flex flex-col items-center justify-start pt-28 pb-20 px-4 min-h-screen">

                {/* ── Page title ── */}
                <motion.div
                    className="text-center mb-10"
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65, ease: EASE }}
                >
                    <p className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-2">
                        AutoSPF+ Las Piñas
                    </p>
                    <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">
                        Book a{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                            Detail
                        </span>
                    </h1>
                </motion.div>

                {!submitted ? (
                    <motion.div
                        className="w-full max-w-lg"
                        initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.65, ease: EASE, delay: 0.1 }}
                    >
                        {/* ── Stepper ── */}
                        <div className="flex items-center justify-center gap-0 mb-8">
                            {STEPS.map(({ label, icon: Icon }, i) => {
                                const done = i < step;
                                const active = i === step;
                                return (
                                    <div key={label} className="flex items-center">
                                        <div className="flex flex-col items-center gap-1.5">
                                            <motion.div
                                                animate={active
                                                    ? { borderColor: 'rgba(249,115,22,0.8)', backgroundColor: 'rgba(249,115,22,0.15)' }
                                                    : done
                                                        ? { borderColor: 'rgba(249,115,22,0.5)', backgroundColor: 'rgba(249,115,22,0.2)' }
                                                        : { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' }}
                                                transition={{ duration: 0.3 }}
                                                className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
                                            >
                                                {done
                                                    ? <Check className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
                                                    : <Icon className={`w-4 h-4 ${active ? 'text-orange-400' : 'text-white/25'}`} />
                                                }
                                            </motion.div>
                                            <span className={`text-[9px] uppercase tracking-widest font-semibold hidden sm:block ${active ? 'text-orange-400' : done ? 'text-white/40' : 'text-white/20'}`}>
                                                {label}
                                            </span>
                                        </div>
                                        {i < STEPS.length - 1 && (
                                            <div className={`h-px w-12 sm:w-16 mx-2 transition-colors duration-500 ${i < step ? 'bg-orange-500/40' : 'bg-white/8'}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Glass card ── */}
                        <div className="bg-white/[0.06] backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden
                                        shadow-[0_32px_80px_rgba(0,0,0,0.5)] relative">
                            {/* top highlight */}
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                            {/* Step header */}
                            <div className="px-7 pt-7 pb-5 border-b border-white/6">
                                <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-0.5">
                                    Step {step + 1} of {STEPS.length}
                                </p>
                                <h2 className="text-xl font-semibold text-white tracking-tight">
                                    {step === 0 && 'Your Account'}
                                    {step === 1 && 'Your Vehicle & Package'}
                                    {step === 2 && 'Pick a Date & Time'}
                                    {step === 3 && 'Contact & Confirm'}
                                </h2>
                            </div>

                            {/* Animated step body */}
                            <div className="px-7 py-6 overflow-hidden">
                                <AnimatePresence mode="wait" custom={dir}>
                                    {step === 0 && (
                                        <motion.div key="step0" custom={dir}
                                            variants={slideIn} initial="hidden" animate="visible" exit="exit">
                                            <StepAuth onNext={goNext} />
                                        </motion.div>
                                    )}
                                    {step === 1 && (
                                        <motion.div key="step1" custom={dir}
                                            variants={slideIn} initial="hidden" animate="visible" exit="exit">
                                            <StepVehicle data={vehicle} onChange={updateVehicle} />
                                        </motion.div>
                                    )}
                                    {step === 2 && (
                                        <motion.div key="step2" custom={dir}
                                            variants={slideIn} initial="hidden" animate="visible" exit="exit">
                                            <StepSchedule data={schedule} onChange={updateSchedule} />
                                        </motion.div>
                                    )}
                                    {step === 3 && (
                                        <motion.div key="step3" custom={dir}
                                            variants={slideIn} initial="hidden" animate="visible" exit="exit">
                                            {/* Override summary inside StepConfirm */}
                                            <StepConfirm data={contact} onChange={updateContact} />
                                            {/* Full summary */}
                                            <div className="mt-4 rounded-xl bg-white/[0.04] border border-white/8 p-4">
                                                <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3">Booking Summary</p>
                                                <div className="space-y-2">
                                                    {Object.entries(summaryData).map(([k, v]) => (
                                                        <div key={k} className="flex items-start justify-between gap-3 text-xs">
                                                            <span className="text-white/30 shrink-0">{k}</span>
                                                            <span className="text-white/70 font-medium text-right">{v}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Navigation */}
                            <div className="px-7 pb-7 flex items-center justify-between gap-3">
                                {step > 0 ? (
                                    <button
                                        onClick={goPrev}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                                                   text-white/40 hover:text-white border border-white/10 hover:border-white/20
                                                   transition-all duration-200"
                                    >
                                        <ArrowLeft className="w-4 h-4" /> Back
                                    </button>
                                ) : <div />}

                                {step < STEPS.length - 1 ? (
                                    <motion.button
                                        onClick={goNext}
                                        disabled={!canNext[step]}
                                        whileHover={canNext[step] ? { scale: 1.025 } : {}}
                                        whileTap={canNext[step] ? { scale: 0.975 } : {}}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white
                                                   bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                                                   shadow-md shadow-orange-500/20 transition-all duration-200
                                                   disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                    >
                                        Continue <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                ) : (
                                    <motion.button
                                        onClick={handleSubmit}
                                        disabled={!canNext[3]}
                                        whileHover={canNext[3] ? { scale: 1.025 } : {}}
                                        whileTap={canNext[3] ? { scale: 0.975 } : {}}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white
                                                   bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                                                   shadow-md shadow-orange-500/20 transition-all duration-200
                                                   disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                    >
                                        Submit Booking <CheckCircle2 className="w-4 h-4" />
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    /* ── Success ── */
                    <div className="w-full max-w-lg bg-white/[0.06] backdrop-blur-2xl border border-white/10
                                    rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden relative">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <SuccessScreen />
                    </div>
                )}
            </div>
        </div>
    );
}
