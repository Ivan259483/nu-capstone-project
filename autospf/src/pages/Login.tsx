import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Shield, Zap, Star, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { otpStorage, userStorage } from '@/lib/storage';
import { EmailService } from '@/lib/email-service';
import { auth, googleProvider, facebookProvider, isFirebaseInitialized } from '@/config/firebase';
import { signInWithPopup } from 'firebase/auth';
import {
    motion,
    AnimatePresence,
    useScroll,
    useTransform,
} from 'framer-motion';

/* ─────────────────────── Assets ─────────────────────── */
const HERO_IMAGE = '/images/login/hero.png';

/* ─────────────────────── Password utils ─────────────────────── */
const validatePassword = (password: string) => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const errors: string[] = [];
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        specialChar: new RegExp(`[${specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password),
    };
    if (!requirements.length) errors.push('At least 8 characters');
    if (!requirements.uppercase) errors.push('One uppercase letter');
    if (!requirements.lowercase) errors.push('One lowercase letter');
    if (!requirements.number) errors.push('One number');
    if (!requirements.specialChar) errors.push('One special character');
    return { isValid: errors.length === 0, errors, requirements };
};

/* ─────────────────────── Shared input style ─────────────────────── */
const inputCls =
    'h-11 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 ' +
    'focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/20 transition-all backdrop-blur-sm';

/* ─────────────────────── Framer variants ─────────────────────── */
const cardVariants = {
    hidden: { opacity: 0, y: 60 },
    visible: {
        opacity: 1, y: 0,
        transition: { type: 'spring' as const, stiffness: 220, damping: 26 },
    },
};

const fieldStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const fieldItem = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

const featureStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const featureItem = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function Login() {
    const navigate = useNavigate();
    const { login, signup, user, setAuthUser } = useAuth();

    /* ── Parallax refs ── */
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollY } = useScroll({ container: undefined });
    const bgY = useTransform(scrollY, [0, 600], ['0%', '25%']);

    /* ── form state ── */
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [passwordValidation, setPasswordValidation] = useState(validatePassword(''));
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    /* ── OTP ── */
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string; name: string } | null>(null);

    /* ── forgot password ── */
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'reset'>('email');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);

    /* ── terms ── */
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [shakeTerms, setShakeTerms] = useState(false);

    /* ── social login ── */
    const handleSocialLogin = async (providerName: 'google' | 'facebook') => {
        if (!isFirebaseInitialized) { toast.error('Firebase configuration is missing.'); return; }
        setIsLoading(true);
        try {
            const provider = providerName === 'google' ? googleProvider : facebookProvider;
            const result = await signInWithPopup(auth, provider);
            const fu = result.user;
            const response = await api.post('/auth/social-login', {
                email: fu.email, name: fu.displayName, provider: providerName, providerId: fu.uid,
            });
            if (response.data.success) {
                const { token, user: userData } = response.data.data;
                localStorage.setItem('autospf_token', token);
                userStorage.setCurrentUser(userData);
                setAuthUser(userData);
                toast.success(`Welcome ${userData.name}!`);
                if (userData.role === 'admin') window.location.replace('/admin/dashboard');
                else if (userData.role === 'detailer') window.location.replace('/detailer/dashboard');
                else window.location.replace('/customer/dashboard');
            }
        } catch (error: any) { toast.error(error.message || 'Social login failed'); }
        finally { setIsLoading(false); }
    };

    /* ── effects ── */
    useEffect(() => {
        const rem = localStorage.getItem('remembered_email');
        if (rem) { setEmail(rem); setRememberMe(true); }
    }, []);

    useEffect(() => {
        if (user) {
            if (user.role === 'admin') navigate('/admin/dashboard');
            else if (user.role === 'detailer') navigate('/detailer/dashboard');
            else navigate('/customer/dashboard');
        }
    }, [user, navigate]);

    useEffect(() => {
        if (isSignUp) {
            setPasswordValidation(validatePassword(password));
            setConfirmPasswordError(confirmPassword && password !== confirmPassword ? 'Passwords do not match' : '');
        }
    }, [password, confirmPassword, isSignUp]);

    /* ── submit ── */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return void toast.error('Please fill in all fields!');

        if (isSignUp) {
            if (!acceptTerms) {
                setShakeTerms(true); setTimeout(() => setShakeTerms(false), 500);
                return void toast.error('Please accept the Terms & Conditions');
            }
            if (!name) return void toast.error('Please enter your name');
            if (userStorage.getByEmail(email)) return void toast.error('Account already exists');
            if (!passwordValidation.isValid) return void toast.error('Please fix password requirements');
            if (password !== confirmPassword) return void toast.error('Passwords do not match');

            setIsLoading(true);
            try {
                const generatedOtp = EmailService.generateOtp();
                const result = await EmailService.sendOtp(email, generatedOtp);
                if (result.success) {
                    otpStorage.set({ email, otp: generatedOtp, expiresAt: Date.now() + 5 * 60 * 1000 });
                    setPendingSignup({ email, password, name });
                    setShowOtpModal(true);
                    toast.success('OTP sent!');
                } else { toast.error(result.error || 'Failed to send OTP'); }
            } catch { toast.error('Failed to send OTP'); }
            finally { setIsLoading(false); }
            return;
        }

        setIsLoading(true);
        try {
            const result = await login(email, password);
            if (result.success) {
                if (rememberMe) localStorage.setItem('remembered_email', email);
                else localStorage.removeItem('remembered_email');
                toast.success('Welcome back.');
            } else { toast.error(result.message || 'Invalid credentials'); }
        } catch { toast.error('Login failed'); }
        finally { setIsLoading(false); }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length !== 6 || !pendingSignup) return;
        setOtpLoading(true);
        try {
            const res = await api.post('/auth/verify-otp', { email: pendingSignup.email, otp });
            if (res.data?.success) {
                const sr = await signup(pendingSignup.email, pendingSignup.password, pendingSignup.name);
                if (sr.success) {
                    otpStorage.clear(); setShowOtpModal(false); setPendingSignup(null);
                    setIsSignUp(false); toast.success('Account created.');
                } else { toast.error(sr.message); }
            } else { toast.error(res.data?.message || 'Invalid OTP'); }
        } catch (err: any) { toast.error(err.message || 'Verification failed'); }
        finally { setOtpLoading(false); }
    };

    const handleForgotPassword = async () => {
        if (!forgotEmail) return void toast.error('Enter email');
        setForgotLoading(true);
        try {
            const res = await api.post('/auth/forgot-password', { email: forgotEmail });
            if (res.data.success) { setForgotStep('otp'); toast.success('OTP Sent'); }
            else toast.error(res.data.message);
        } catch { toast.error('Failed to request reset'); }
        finally { setForgotLoading(false); }
    };

    const handleResetPassword = async () => {
        if (!newPassword || newPassword !== confirmNewPassword) return void toast.error('Passwords mismatch');
        setForgotLoading(true);
        try {
            const res = await api.post('/auth/reset-password', { email: forgotEmail, otp: forgotOtp, newPassword });
            if (res.data.success) { toast.success('Password reset.'); setShowForgotModal(false); setForgotStep('email'); }
            else toast.error(res.data.message);
        } catch { toast.error('Reset failed'); }
        finally { setForgotLoading(false); }
    };

    const scrollToForm = () => {
        document.getElementById('login-form-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    /* ════════════════════════════════
       RENDER
    ════════════════════════════════ */
    return (
        <div ref={containerRef} className="bg-[#0B1120] text-white font-sans selection:bg-orange-500/30">

            {/* ══════════════════════════════════════════════════
                SECTION 1 — Full-screen Hero (viewport 1)
            ══════════════════════════════════════════════════ */}
            <section className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center">

                {/* Parallax background */}
                <motion.div
                    className="absolute inset-0 z-0 will-change-transform"
                    style={{ y: bgY }}
                    initial={{ scale: 1.12 }}
                    animate={{ scale: 1.0 }}
                    transition={{ duration: 2.6, ease: 'easeOut' }}
                >
                    <img
                        src={HERO_IMAGE}
                        alt="AutoSPF+ hero"
                        className="w-full h-full object-cover scale-110"
                    />
                </motion.div>

                {/* Dark gradient overlay */}
                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0B1120]/70 via-[#0B1120]/40 to-[#0B1120]/90" />
                <div className="absolute inset-0 z-[1] bg-gradient-to-t from-[#0B1120] via-transparent to-transparent" />

                {/* Giant background wordmark */}
                <motion.div
                    className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none select-none overflow-hidden"
                    initial={{ opacity: 0, y: -30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                >
                    <span
                        className="text-[22vw] xl:text-[18vw] font-black uppercase tracking-tighter leading-none whitespace-nowrap"
                        style={{
                            color: 'transparent',
                            WebkitTextStroke: '1.5px rgba(255,255,255,0.06)',
                        }}
                    >
                        AUTOSPF+
                    </span>
                </motion.div>


                {/* Hero headline */}
                <motion.div
                    className="relative z-[5] text-center px-6 max-w-4xl"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-medium text-white tracking-tight drop-shadow-2xl leading-none mb-6">
                        Defined by<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                            Detail.
                        </span>
                    </h1>
                    <p className="text-white/40 text-sm md:text-base uppercase tracking-[0.35em] font-medium">
                        The new standard of automotive excellence
                    </p>
                </motion.div>

                {/* Scroll indicator */}
                <motion.button
                    onClick={scrollToForm}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[5] flex flex-col items-center gap-2 cursor-pointer group"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 1.4 }}
                >
                    <span className="text-[10px] uppercase tracking-[0.4em] text-white/30 group-hover:text-white/60 transition-colors font-medium">
                        Scroll to Explore
                    </span>
                    <motion.div
                        animate={{ y: [0, 6, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <ChevronDown className="w-5 h-5 text-white/30 group-hover:text-orange-400 transition-colors" />
                    </motion.div>
                </motion.button>
            </section>

            {/* ══════════════════════════════════════════════════
                SECTION 2 — Login form (scroll-revealed)
            ══════════════════════════════════════════════════ */}
            <section
                id="login-form-section"
                className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20 overflow-hidden"
            >
                {/* Section background — continuation of the navy */}
                <div className="absolute inset-0 z-0 bg-[#0B1120]">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 blur-[120px] rounded-full" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-500/5 blur-[100px] rounded-full" />
                </div>

                {/* "Sign in" section label */}
                <motion.div
                    className="relative z-[2] mb-8 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                    <p className="text-[11px] uppercase tracking-[0.4em] text-white/25 font-medium mb-2">Client Portal</p>
                    <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                        {isSignUp ? 'Apply for Membership' : 'Sign In'}
                    </h2>
                </motion.div>

                {/* ── Login Glass Card (scroll-revealed) ── */}
                <motion.div
                    className="relative z-[2] w-full max-w-md"
                    variants={cardVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <div className="bg-white/[0.07] backdrop-blur-2xl border border-white/15 shadow-[0_32px_80px_rgba(0,0,0,0.6)] rounded-3xl p-8 overflow-hidden relative">

                        {/* card top highlight */}
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        {/* card bottom ambient glow */}
                        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-72 h-36 bg-orange-500/10 blur-3xl rounded-full pointer-events-none" />

                        {/* Social buttons */}
                        <motion.div
                            variants={fieldStagger} initial="hidden"
                            whileInView="visible" viewport={{ once: true }}
                            className="grid grid-cols-2 gap-3 mb-5"
                        >
                            <motion.div variants={fieldItem}>
                                <button
                                    type="button" onClick={() => handleSocialLogin('google')} disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-white/80 hover:text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                                >
                                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                                        <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 4.9c1.7 0 3.24.62 4.44 1.64l3.32-3.32A11.95 11.95 0 0 0 12 1C8.16 1 4.83 3.06 3 6.14l2.27 3.62z" />
                                        <path fill="#34A853" d="M16.04 18.01A7.08 7.08 0 0 1 12 19.1c-2.96 0-5.5-1.82-6.6-4.41L3.12 17.9C4.95 21.05 8.22 23 12 23c2.96 0 5.65-1.07 7.72-2.82l-3.68-2.17z" />
                                        <path fill="#4A90D9" d="M19.72 20.18C21.72 18.22 23 15.36 23 12c0-.73-.1-1.44-.25-2.12H12v4.5h6.2a5.3 5.3 0 0 1-2.16 3.07l3.68 2.73z" />
                                        <path fill="#FBBC05" d="M5.4 14.69A7.17 7.17 0 0 1 4.9 12c0-.94.17-1.84.47-2.68L3.1 5.7A11.93 11.93 0 0 0 1 12c0 1.92.45 3.74 1.24 5.36l3.16-2.67z" />
                                    </svg>
                                    Google
                                </button>
                            </motion.div>
                            <motion.div variants={fieldItem}>
                                <button
                                    type="button" onClick={() => handleSocialLogin('facebook')} disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-white/80 hover:text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                                >
                                    <svg className="w-4 h-4 shrink-0 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                                    </svg>
                                    Facebook
                                </button>
                            </motion.div>
                        </motion.div>

                        {/* Divider */}
                        <div className="relative mb-5">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                            <div className="relative flex justify-center">
                                <span className="px-3 text-[11px] uppercase tracking-widest text-white/25 font-medium">or email</span>
                            </div>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit}>
                            <motion.div
                                key={isSignUp ? 'su' : 'li'}
                                variants={fieldStagger} initial="hidden"
                                whileInView="visible" viewport={{ once: true }}
                                className="space-y-3"
                            >
                                {/* Name – signup only */}
                                <AnimatePresence>
                                    {isSignUp && (
                                        <motion.div key="name-f" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
                                            <div className="space-y-1.5 pb-0.5">
                                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Full Name</Label>
                                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className={inputCls} />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Email */}
                                <motion.div variants={fieldItem} className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Email Address</Label>
                                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" className={inputCls} />
                                </motion.div>

                                {/* Password */}
                                <motion.div variants={fieldItem} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Password</Label>
                                        {!isSignUp && (
                                            <button type="button" onClick={() => { setShowForgotModal(true); setForgotEmail(email); }} className="text-[11px] text-orange-400 hover:text-orange-300 font-medium transition-colors">
                                                Forgot password?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isSignUp ? 'new-password' : 'current-password'} className={`${inputCls} pr-10`} />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </motion.div>

                                {/* Confirm password – signup only */}
                                <AnimatePresence>
                                    {isSignUp && (
                                        <motion.div key="confirm-f" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
                                            <div className="space-y-1.5 pb-0.5">
                                                <Label className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Confirm Password</Label>
                                                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
                                                {confirmPasswordError && <p className="text-red-400 text-xs">{confirmPasswordError}</p>}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Remember / Terms */}
                                <motion.div variants={fieldItem}>
                                    {isSignUp ? (
                                        <div className={`flex items-start gap-2.5 ${shakeTerms ? 'animate-bounce' : ''}`}>
                                            <Checkbox id="terms" checked={acceptTerms} onCheckedChange={c => setAcceptTerms(c as boolean)} className={`mt-0.5 border-white/25 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 ${shakeTerms ? 'border-red-400' : ''}`} />
                                            <label htmlFor="terms" className={`text-xs leading-relaxed cursor-pointer ${shakeTerms ? 'text-red-400' : 'text-white/40'}`}>
                                                I agree to the <span className="text-orange-400 hover:text-orange-300 hover:underline">Terms & Conditions</span> and <span className="text-orange-400 hover:text-orange-300 hover:underline">Privacy Policy</span>
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2.5">
                                            <Checkbox id="remember" checked={rememberMe} onCheckedChange={c => setRememberMe(c as boolean)} className="border-white/25 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500" />
                                            <label htmlFor="remember" className="text-xs text-white/40 cursor-pointer select-none">Remember this device</label>
                                        </div>
                                    )}
                                </motion.div>

                                {/* CTA */}
                                <motion.div variants={fieldItem}>
                                    <motion.button
                                        type="submit"
                                        disabled={isLoading || (isSignUp && !acceptTerms)}
                                        whileHover={{ scale: 1.025 }}
                                        whileTap={{ scale: 0.975 }}
                                        className="w-full h-12 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 mt-1"
                                    >
                                        {isLoading ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                            </svg>
                                        ) : (
                                            <>{isSignUp ? 'Create Account' : 'Log In'}<ArrowRight className="w-4 h-4" /></>
                                        )}
                                    </motion.button>
                                </motion.div>
                            </motion.div>
                        </form>

                        {/* Switch mode */}
                        <div className="mt-5 text-center">
                            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setPassword(''); setConfirmPassword(''); }} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                                {isSignUp ? 'Already a member? ' : 'Don\'t have an account? '}
                                <span className="text-orange-400 hover:text-orange-300 font-medium">
                                    {isSignUp ? 'Sign In' : 'Sign Up'}
                                </span>
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* ── Feature strip (stagger-reveal on scroll) ── */}
                <motion.div
                    variants={featureStagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    className="relative z-[2] mt-12 flex items-center justify-center gap-10 flex-wrap"
                >
                    {[
                        { icon: Shield, num: '01', label: 'Bank-grade Security' },
                        { icon: Zap, num: '02', label: 'Instant Booking' },
                        { icon: Star, num: '03', label: 'Premium Detailing' },
                    ].map(({ icon: Icon, num, label }) => (
                        <motion.div key={label} variants={featureItem} className="flex items-center gap-2.5 text-white/35 hover:text-white/60 transition-colors">
                            <span className="text-xs font-bold text-orange-500/50">{num}</span>
                            <Icon className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* ══════════════════════════════════════════════════
                SECTION 3 — Footer strip
            ══════════════════════════════════════════════════ */}
            <motion.footer
                className="relative z-[2] border-t border-white/5 py-8 px-8 flex items-center justify-between"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                        <span className="text-white font-black text-[10px]">A+</span>
                    </div>
                    <span className="text-white/30 text-xs font-medium tracking-tight">AutoSPF+</span>
                </div>
                <p className="text-[11px] text-white/20 font-medium">© 2026 AutoSPF+ Inc. All rights reserved.</p>
            </motion.footer>

            {/* ──────────── OTP Modal ──────────── */}
            <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
                <DialogContent className="bg-[#0B1120]/95 border-white/10 text-white backdrop-blur-2xl rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white text-lg font-semibold">Verify Your Email</DialogTitle>
                        <DialogDescription className="text-white/40 text-sm">
                            6-digit code sent to <span className="text-orange-400">{pendingSignup?.email}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <Input value={otp} onChange={e => setOtp(e.target.value.slice(0, 6))} placeholder="000000" className="text-center text-3xl tracking-[1em] bg-white/10 border-white/15 h-16 font-mono text-white focus:border-orange-500/60" />
                        <motion.button onClick={handleVerifyOtp} disabled={otpLoading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold text-sm shadow-lg disabled:opacity-50">
                            {otpLoading ? 'Verifying...' : 'Confirm Code'}
                        </motion.button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ──────────── Forgot Password Modal ──────────── */}
            <Dialog open={showForgotModal} onOpenChange={(o) => { setShowForgotModal(o); if (!o) setForgotStep('email'); }}>
                <DialogContent className="bg-[#0B1120]/95 border-white/10 text-white backdrop-blur-2xl rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white text-lg font-semibold">Reset Password</DialogTitle>
                        <DialogDescription className="text-white/40 text-sm">
                            {forgotStep === 'email' ? "We'll send a reset code to your email." : forgotStep === 'otp' ? 'Enter the OTP sent to your email.' : 'Set your new password.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                        {forgotStep === 'email' && (<>
                            <Input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="Email address" className={inputCls} />
                            <Button onClick={handleForgotPassword} disabled={forgotLoading} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold">
                                {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                            </Button>
                        </>)}
                        {forgotStep === 'otp' && (<>
                            <Input value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} placeholder="OTP Code" className={inputCls} />
                            <Button onClick={() => setForgotStep('reset')} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold">Verify Code</Button>
                        </>)}
                        {forgotStep === 'reset' && (<>
                            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" className={inputCls} />
                            <Input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Confirm Password" className={inputCls} />
                            <Button onClick={handleResetPassword} disabled={forgotLoading} className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold mt-1">
                                {forgotLoading ? 'Resetting...' : 'Set New Password'}
                            </Button>
                        </>)}
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}
