import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Calendar, Car, User, CheckCircle, Sparkles, Mail, Key,
  Clock, FileText, Upload, Camera, X, RefreshCw, Bookmark,
  Shield, Phone, Info,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import { toast } from 'sonner';
import { OrderService } from '@/lib/order-service';
import api from '@/lib/api';
import './BookingPage.css';

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

function getDateStatus(d: Date): 'available' | 'closed' | 'full' {
    const day = d.getDay();
    const dateNum = d.getDate();
    if (day === 0) return 'closed';       // Sunday
    if (day === 6) return 'closed';       // Saturday
    if (dateNum % 5 === 0) return 'full'; // mock full days
    return 'available';
}

/* ─────────────────────── Helpers ─────────────────────── */
function generatePreviewRef(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return `ASPF-${yy}${mm}${dd}-${code}`;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ─────────────────────── Auth Component ─────────────────────── */
function StepAuth() {
    const { login, setAuthUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

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
        <div className="bk-auth-split">
            {/* ── Left Brand Panel ── */}
            <div className="bk-auth-brand">
                <div className="bk-auth-brand-glow" />
                <div className="bk-auth-brand-content">
                    <img 
                        src="/images/autospf-logo.png" 
                        alt="AutoSPF+" 
                        className="h-14 object-contain mb-6"
                    />
                    <p>Premium Automotive<br />Detailing & Protection</p>
                    <div className="bk-auth-brand-features">
                        {['Paint Protection Film', 'Ceramic Coating', 'Window Tinting', 'Interior Detailing'].map(f => (
                            <div key={f} className="bk-auth-feature">
                                <CheckCircle size={12} />
                                <span>{f}</span>
                            </div>
                        ))}
                    </div>
                    <div className="bk-auth-brand-trust">
                        {['⭐ 5-Star Rated', '🛡️ Certified', '📍 Las Piñas'].map(t => (
                            <span key={t} className="bk-auth-trust-pill">{t}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Form Panel ── */}
            <div className="bk-auth-form-panel">
                <div className="bk-auth-form-inner">
                    <div className="bk-auth-form-header">
                        <div className="bk-auth-badge">
                            <Shield size={12} />
                            <span>SECURE LOGIN</span>
                        </div>
                        <h2>Sign in to Book</h2>
                        <p>Create or access your account to track appointments</p>
                    </div>

                    {/* Google button */}
                    <button
                        type="button"
                        onClick={handleSocialLogin}
                        disabled={loading}
                        className="bk-google-btn"
                    >
                        <svg className="w-[18px] h-[18px] shrink-0 pointer-events-none" viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 4.9c1.7 0 3.24.62 4.44 1.64l3.32-3.32A11.95 11.95 0 0 0 12 1C8.16 1 4.83 3.06 3 6.14l2.27 3.62z" />
                            <path fill="#34A853" d="M16.04 18.01A7.08 7.08 0 0 1 12 19.1c-2.96 0-5.5-1.82-6.6-4.41L3.12 17.9C4.95 21.05 8.22 23 12 23c2.96 0 5.65-1.07 7.72-2.82l-3.68-2.17z" />
                            <path fill="#4A90D9" d="M19.72 20.18C21.72 18.22 23 15.36 23 12c0-.73-.1-1.44-.25-2.12H12v4.5h6.2a5.3 5.3 0 0 1-2.16 3.07l3.68 2.73z" />
                            <path fill="#FBBC05" d="M5.4 14.69A7.17 7.17 0 0 1 4.9 12c0-.94.17-1.84.47-2.68L3.1 5.7A11.93 11.93 0 0 0 1 12c0 1.92.45 3.74 1.24 5.36l3.16-2.67z" />
                        </svg>
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="bk-auth-divider">
                        <div className="bk-auth-divider-line" />
                        <span>OR</span>
                        <div className="bk-auth-divider-line" />
                    </div>

                    {/* Email form */}
                    <form onSubmit={handleLogin} className="bk-auth-fields">
                        <div className="bk-auth-field-group">
                            <label className="bk-auth-field-label">Email Address</label>
                            <div className={`bk-auth-input-wrap ${focusedField === 'email' ? 'focused' : ''}`}>
                                <Mail size={16} className="bk-auth-input-icon" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder="name@example.com"
                                    className="bk-auth-input"
                                />
                            </div>
                        </div>
                        <div className="bk-auth-field-group">
                            <label className="bk-auth-field-label">Password</label>
                            <div className={`bk-auth-input-wrap ${focusedField === 'password' ? 'focused' : ''}`}>
                                <Key size={16} className="bk-auth-input-icon" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder="••••••••"
                                    className="bk-auth-input"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bk-auth-submit"
                        >
                            {loading ? (
                                <span className="bk-auth-spinner" />
                            ) : (
                                <>Sign In</>
                            )}
                        </button>
                    </form>

                    <div className="bk-auth-footer">
                        <p>
                            Don't have an account?{' '}
                            <Link to="/login" className="bk-auth-link">Sign up here</Link>
                        </p>
                    </div>
                </div>
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [downpaymentProof, setDownpaymentProof] = useState<string | null>(null);
    const today = new Date();
    const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    
    // DB Services
    const [dbServices, setDbServices] = useState<BookingService[]>([]);

    useEffect(() => {
        const fetchServices = async () => {
            try {
                const res = await api.get('/services/published');
                if (res.data.success && Array.isArray(res.data.data)) {
                    const mapped = res.data.data.map((s: any) => ({ ...s, id: s._id || s.id }));
                    setDbServices(mapped);

                    // Resolve the ?pkg= key to the actual DB service _id
                    // Services page sends keys like "spf80", "spf89" etc.
                    // DB services have names like "SPF 80", "SPF 89" etc.
                    if (defaultPkg) {
                        const pkgNorm = defaultPkg.replace(/[^a-z0-9]/gi, '').toLowerCase();
                        const match = mapped.find((s: BookingService) =>
                            s.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === pkgNorm
                        );
                        if (match) {
                            setForm(f => ({ ...f, service: match.id }));
                        } else if (mapped.length > 0) {
                            setForm(f => ({ ...f, service: mapped[0].id }));
                        }
                    } else if (mapped.length > 0 && !form.service) {
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
        service: "",
        carModelAndColor: "",
        vehiclePlate: "",
        date: "",
        time: "",
        name: "",
        phone: "",
        notes: "",
    });

    const [agreed, setAgreed] = useState(false);

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

    const isComplete = form.service && form.carModelAndColor && form.date && form.time && form.name && form.phone && agreed;

    const previewRef = useMemo(() => generatePreviewRef(), []);

    const handleFileUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be under 5MB');
            return;
        }
        const base64 = await fileToBase64(file);
        setDownpaymentProof(base64);
    };

    const handleSubmit = async () => {
        if (!user) return toast.error("Please login first");
        if (!isComplete) return toast.error("Please fill out all required fields.");

        setSubmitting(true);
        try {
            const payload = {
                customer: user.id,
                customerName: form.name || user.name || 'Guest User',
                customerPhone: form.phone,
                vehicleYear: "N/A",
                vehicleMake: form.carModelAndColor.split(' ')[0] || 'Unknown',
                vehicleModel: form.carModelAndColor,
                vehicleColor: "N/A",
                vehiclePlate: form.vehiclePlate || "N/A",
                serviceType: selectedService?.name || form.service,
                price: selectedPrice,
                bookingDate: form.date,
                bookingTime: form.time,
                notes: form.notes,
                downpaymentProof: downpaymentProof || undefined,
                items: JSON.stringify([{
                    product: selectedService?.id || form.service,
                    quantity: 1,
                    price: selectedPrice
                }])
            };
            
            const response = await OrderService.createOrder(payload);

            if (response?.success) {
                setSubmitted(true);
                setTimeout(() => navigate('/customer/dashboard?tab=bookings'), 2500);
            } else {
                toast.error(response?.message || 'Failed to submit booking');
            }
        } catch (error: any) {
            console.error('Booking failed:', error);
            const backendMessage = error?.response?.data?.message || error?.message;
            toast.error(backendMessage || 'Error submitting booking');
        } finally {
            setSubmitting(false);
        }
    };

    /* ─────── Render ─────── */
    return (
        <PageLayout>
            <div className="bk-page">
                {/* ── Hero ── */}
                <div className="bk-hero">
                    <div className="bk-hero-badge">
                        <Calendar size={12} />
                        RESERVE YOUR APPOINTMENT
                    </div>
                    <h1>Book a Service</h1>
                    <p>Premium automotive care — one appointment away</p>
                    <div className="bk-hero-trust">
                        <div className="bk-hero-trust-item">
                            <Shield size={13} />
                            Certified Technicians
                        </div>
                        <div className="bk-hero-trust-dot" />
                        <div className="bk-hero-trust-item">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            4.9 / 5 Customer Rating
                        </div>
                        <div className="bk-hero-trust-dot" />
                        <div className="bk-hero-trust-item">
                            <CheckCircle size={13} />
                            Satisfaction Guarantee
                        </div>
                    </div>
                    <div className="bk-hero-line" />
                </div>

                {/* ── Body ── */}
                <div className="bk-body">
                    <div className="bk-container">
                        {!user ? (
                            /* ── Auth Gate ── */
                            <div className="bk-card bk-auth-wrapper bk-animate">
                                <StepAuth />
                            </div>
                        ) : submitted ? (
                            /* ── Success ── */
                            <div className="bk-success">
                                <div className="bk-success-icon">
                                    <CheckCircle size={40} color="#fff" />
                                </div>
                                <h2>Your booking is successful.</h2>
                                <p>Saved as "Pending". Your request has been forwarded to our Sales Dashboard. We will confirm your booking in 1 to 3 minutes.</p>
                                <div className="bk-success-ref">
                                    <Bookmark size={16} color="#FF6B35" />
                                    <span>{previewRef}</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#555' }}>
                                    Redirecting to your dashboard...
                                </p>
                            </div>
                        ) : (
                            /* ── Booking Form ── */
                            <div className="bk-grid">
                                {/* ═══ LEFT COLUMN ═══ */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                                    {/* 1. Customer Info */}
                                    <div className="bk-card bk-animate">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><User size={16} /></div>
                                            <span className="bk-card-title">Customer Information</span>
                                        </div>
                                        <div className="bk-form-row cols-2">
                                            <div>
                                                <label className="bk-label">FULL NAME</label>
                                                <input
                                                    className="bk-input"
                                                    value={form.name}
                                                    disabled
                                                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                                                    placeholder="Auto-filled from account"
                                                />
                                            </div>
                                            <div>
                                                <label className="bk-label">CONTACT NO.</label>
                                                <input
                                                    className="bk-input"
                                                    type="tel"
                                                    value={form.phone}
                                                    onChange={e => update('phone', e.target.value)}
                                                    placeholder="e.g. +63 912 345 6789"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Vehicle Info */}
                                    <div className="bk-card bk-animate bk-animate-d1">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><Car size={16} /></div>
                                            <span className="bk-card-title">Vehicle Information</span>
                                        </div>
                                        <div className="bk-form-row cols-2">
                                            <div>
                                                <label className="bk-label">CAR MODEL & COLOR</label>
                                                <input
                                                    className="bk-input"
                                                    value={form.carModelAndColor}
                                                    onChange={e => update('carModelAndColor', e.target.value)}
                                                    placeholder="e.g. Toyota GR86 - White"
                                                />
                                            </div>
                                            <div>
                                                <label className="bk-label">CAR PLATE</label>
                                                <input
                                                    className="bk-input"
                                                    value={form.vehiclePlate}
                                                    onChange={e => update('vehiclePlate', e.target.value)}
                                                    placeholder="e.g. ABC 1234"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Service Selection */}
                                    <div className="bk-card bk-animate bk-animate-d2">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><Sparkles size={16} /></div>
                                            <span className="bk-card-title">Select Service</span>
                                        </div>
                                        {dbServices.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#555', fontSize: '0.85rem' }}>
                                                Loading services...
                                            </div>
                                        ) : (
                                            <div className="bk-service-grid">
                                                {dbServices.map(svc => (
                                                    <button
                                                        key={svc.id}
                                                        onClick={() => update('service', svc.id)}
                                                        className={`bk-service-btn ${form.service === svc.id ? 'active' : ''}`}
                                                    >
                                                        <div className="sn">{svc.name}</div>
                                                        <div className="sm">
                                                            <span>{svc.duration}</span>
                                                            <span>{fmt(svc.basePrice)}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* 4. Smart Calendar */}
                                    <div className="bk-card bk-animate bk-animate-d3">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><Calendar size={16} /></div>
                                            <span className="bk-card-title">Preferred Date</span>
                                        </div>

                                        {/* Month navigation */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <button
                                                onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                                                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1 }}
                                            >‹</button>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.05em' }}>
                                                {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
                                            </span>
                                            <button
                                                onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                                                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1 }}
                                            >›</button>
                                        </div>

                                        {/* Day-of-week headers */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                                            {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => (
                                                <div key={d} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#555', letterSpacing: '0.08em', paddingBottom: 4 }}>{d}</div>
                                            ))}
                                        </div>

                                        {/* Calendar grid */}
                                        {(() => {
                                            const year = calMonth.getFullYear();
                                            const month = calMonth.getMonth();
                                            const firstDay = new Date(year, month, 1).getDay();
                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                            const cells: React.ReactNode[] = [];
                                            // leading blanks
                                            for (let i = 0; i < firstDay; i++) cells.push(<div key={`b${i}`} />);
                                            // day cells
                                            for (let d = 1; d <= daysInMonth; d++) {
                                                const date = new Date(year, month, d);
                                                const iso = date.toISOString().split('T')[0];
                                                const isPast = date < new Date(new Date().toDateString());
                                                const status = isPast ? 'closed' : getDateStatus(date);
                                                const disabled = isPast || status !== 'available';
                                                const isSelected = form.date === iso;
                                                const dotColor = status === 'available' ? '#22c55e' : status === 'full' ? '#ef4444' : '#f97316';
                                                cells.push(
                                                    <button
                                                        key={iso}
                                                        disabled={disabled}
                                                        onClick={() => !disabled && update('date', iso)}
                                                        style={{
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                            padding: '6px 2px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                                                            background: isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.04)',
                                                            opacity: isPast ? 0.3 : 1,
                                                            transition: 'all 0.15s',
                                                            outline: isSelected ? '2px solid #f59e0b' : 'none',
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#fff' : disabled ? '#555' : '#ddd', lineHeight: 1.2 }}>{d}</span>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.7)' : dotColor, marginTop: 3, display: 'inline-block' }} />
                                                    </button>
                                                );
                                            }
                                            return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>{cells}</div>;
                                        })()}

                                        <div className="bk-calendar-legend" style={{ marginTop: '1rem' }}>
                                            <div className="legend-item"><span className="dot green" /> Available</div>
                                            <div className="legend-item"><span className="dot orange" /> Closed</div>
                                            <div className="legend-item"><span className="dot red" /> Full</div>
                                        </div>

                                        <div style={{ marginTop: '1.25rem' }}>
                                            <div className="bk-card-header" style={{ marginBottom: '0.75rem' }}>
                                                <div className="bk-card-icon"><Clock size={16} /></div>
                                                <span className="bk-card-title">Preferred Time</span>
                                            </div>
                                            <div className="bk-time-grid">
                                                {timeSlots.map(slot => (
                                                    <button
                                                        key={slot}
                                                        onClick={() => update('time', slot)}
                                                        className={`bk-time-btn ${form.time === slot ? 'active' : ''}`}
                                                    >
                                                        {slot}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 5. GCash Upload */}
                                    <div className="bk-card bk-animate bk-animate-d4">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><Upload size={16} /></div>
                                            <span className="bk-card-title">Down payment via QR CODE PAYMENT</span>
                                            <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: 'auto', fontWeight: 600 }}>OPTIONAL</span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ width: '100px', height: '100px', background: '#fff', padding: '0.5rem', borderRadius: '0.5rem', flexShrink: 0 }}>
                                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=AutoSPFPayment" alt="GCash QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ flex: 1, fontSize: '0.85rem', color: '#bbb' }}>
                                                <p style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>Scan to Pay</p>
                                                <p>Please scan the QR code using your payment app to make your down payment. Upload the receipt below to confirm.</p>
                                            </div>
                                        </div>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) handleFileUpload(file);
                                                e.target.value = '';
                                            }}
                                        />

                                        {!downpaymentProof ? (
                                            <div
                                                className="bk-upload-zone"
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <div className="bk-upload-icon">
                                                    <Camera size={20} />
                                                </div>
                                                <div className="bk-upload-title">Upload Payment Proof</div>
                                                <div className="bk-upload-sub">Click to select an image (max 5MB)</div>
                                            </div>
                                        ) : (
                                            <div className="bk-upload-preview">
                                                <img src={downpaymentProof} alt="GCash proof" />
                                                <div className="bk-upload-actions">
                                                    <button
                                                        className="bk-upload-action-btn"
                                                        onClick={() => fileInputRef.current?.click()}
                                                    >
                                                        <RefreshCw size={12} /> Replace
                                                    </button>
                                                    <button
                                                        className="bk-upload-action-btn"
                                                        onClick={() => setDownpaymentProof(null)}
                                                    >
                                                        <X size={12} /> Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 6. Notes */}
                                    <div className="bk-card bk-animate bk-animate-d5">
                                        <div className="bk-card-header">
                                            <div className="bk-card-icon"><FileText size={16} /></div>
                                            <span className="bk-card-title">Special Requests</span>
                                            <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: 'auto', fontWeight: 600 }}>OPTIONAL</span>
                                        </div>
                                        <textarea
                                            className="bk-textarea"
                                            value={form.notes}
                                            onChange={e => update('notes', e.target.value)}
                                            placeholder="Pre-existing scratches, specific instructions, preferences..."
                                            rows={4}
                                        />
                                    </div>
                                </div>

                                {/* ═══ RIGHT COLUMN — STICKY SIDEBAR ═══ */}
                                <div className="bk-sidebar bk-animate bk-animate-d2">
                                    <div className="bk-sidebar-card">
                                        {/* Gradient header */}
                                        <div className="bk-sidebar-header">
                                            <Car size={14} color="#fff" />
                                            <span>BOOKING SUMMARY</span>
                                        </div>

                                        <div className="bk-sidebar-body">
                                            {/* Summary rows */}
                                            {[
                                                { icon: <User size={14} />, label: 'Customer', value: form.name },
                                                { icon: <Phone size={14} />, label: 'Contact', value: form.phone },
                                                { icon: <Car size={14} />, label: 'Vehicle', value: form.carModelAndColor },
                                                { icon: <Sparkles size={14} />, label: 'Service', value: selectedService?.name },
                                                { icon: <Calendar size={14} />, label: 'Date', value: form.date ? new Date(form.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '' },
                                                { icon: <Clock size={14} />, label: 'Time', value: form.time },
                                            ].map((row, i, arr) => (
                                                <div key={i}>
                                                    <div className="bk-summary-row">
                                                        <div className="bk-summary-left">
                                                            {row.icon}
                                                            <span>{row.label}</span>
                                                        </div>
                                                        <div className={`bk-summary-val ${!row.value ? 'empty' : ''}`}>
                                                            {row.value || '—'}
                                                        </div>
                                                    </div>
                                                    {i < arr.length - 1 && <div className="bk-summary-divider" />}
                                                </div>
                                            ))}

                                            {/* Downpayment badge */}
                                            {downpaymentProof && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    background: 'rgba(52,199,89,0.08)', borderRadius: '0.5rem',
                                                    border: '1px solid rgba(52,199,89,0.2)', padding: '0.5rem 0.75rem',
                                                    marginTop: '0.75rem',
                                                }}>
                                                    <CheckCircle size={14} color="#34C759" />
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34C759' }}>
                                                        GCash proof attached
                                                    </span>
                                                </div>
                                            )}

                                            {/* Booking Reference */}
                                            <div className="bk-ref-card">
                                                <Bookmark size={14} color="#FF6B35" />
                                                <div>
                                                    <div className="bk-ref-label">BOOKING REFERENCE</div>
                                                    <div className="bk-ref-code">{previewRef}</div>
                                                </div>
                                            </div>

                                            {/* Total */}
                                            <div className="bk-total-row">
                                                <span className="bk-total-label">Estimated Total</span>
                                                <span className="bk-total-val">
                                                    {form.service ? fmt(selectedPrice) : '₱0'}
                                                </span>
                                            </div>

                                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginTop: '1.25rem', padding: '0.5rem', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={agreed} 
                                                    onChange={e => setAgreed(e.target.checked)} 
                                                    style={{ marginTop: '0.2rem', accentColor: '#f59e0b', width: '16px', height: '16px' }} 
                                                />
                                                <span style={{ fontSize: '0.75rem', color: '#aaa', lineHeight: 1.4 }}>
                                                    I agree to the terms and conditions and accept the booking policy. I understand that my booking is subject to approval.
                                                </span>
                                            </label>

                                            {/* Confirm */}
                                            <button
                                                className="bk-confirm-btn"
                                                disabled={!isComplete || submitting}
                                                onClick={handleSubmit}
                                            >
                                                {submitting ? (
                                                    'Submitting...'
                                                ) : (
                                                    <>
                                                        <Sparkles size={18} />
                                                        {isComplete ? 'Confirm Booking' : 'Complete All Fields'}
                                                    </>
                                                )}
                                            </button>
                                            {!isComplete && (
                                                <div className="bk-confirm-hint">
                                                    Please fill out all required fields and agree to the terms above.
                                                </div>
                                            )}

                                            {/* Notice */}
                                            <div className="bk-notice">
                                                <Info size={14} color="#FF6B35" style={{ flexShrink: 0, marginTop: 2 }} />
                                                <p>
                                                    By confirming, you agree to the booking terms. Please arrive{' '}
                                                    <strong style={{ color: '#FF6B35' }}>15 min early</strong>.
                                                    Schedule may be adjusted by our team.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}
