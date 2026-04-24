import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Car, LogIn, UserPlus, Mail, Lock, User, Loader2, ArrowLeft, ShieldCheck, RefreshCw, AlertTriangle, LockKeyhole, Clock } from "lucide-react";
import { signInWithPopup, signOut } from "firebase/auth";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseApiUrl } from "@/lib/api";
import { getDashboardPathForRole } from "@/lib/roles";
import { auth, googleProvider, isFirebaseInitialized } from "@/config/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/* ─────────────────────── Password validation ─────────────────────── */
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


/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function Login() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { login, signup, resetPassword, user, isLoading: isAuthLoading, isFirebaseAuthReady, setAuthUser, markLoginInProgress, markLoginComplete } = useAuth();

    /* ── Form state ── */
    const [tab, setTab] = useState<"login" | "register">("login");
    const prevTabRef = useRef<"login" | "register">("login");
    const handleTabSwitch = useCallback((next: "login" | "register") => {
        prevTabRef.current = tab;
        setTab(next);
    }, [tab]);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", confirm: "", agree: false });
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [passwordValidation, setPasswordValidation] = useState(validatePassword(""));
    const [confirmPasswordError, setConfirmPasswordError] = useState("");

    /* ── Login attempt tracking & lock state ── */
    const [loginAttempts, setLoginAttempts] = useState(0);
    const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
    const [lockCountdown, setLockCountdown] = useState("");

    /* ── OTP verification state (Registration flow) ── */
    const [otpStep, setOtpStep] = useState<"form" | "verify">("form");
    const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);
    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    /* ── Login 2FA OTP state ── */
    // pendingUserId lives only in React state, NEVER in localStorage.
    const [loginOtpStep, setLoginOtpStep] = useState<"form" | "otp">("form");
    const [loginOtpDigits, setLoginOtpDigits] = useState(["", "", "", "", "", ""]);
    const [loginOtpExpiry, setLoginOtpExpiry] = useState(0);   // seconds until OTP expires
    const [loginOtpResend, setLoginOtpResend] = useState(0);   // seconds until resend allowed
    const [loginOtpVerifying, setLoginOtpVerifying] = useState(false);
    const [loginOtpResending, setLoginOtpResending] = useState(false);
    const [loginOtpShake, setLoginOtpShake] = useState(false);
    const [pendingUserId, setPendingUserId] = useState("");
    const [loginMaskedEmail, setLoginMaskedEmail] = useState("");
    const [loginOtpError, setLoginOtpError] = useState("");
    const loginOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    /* ── Forgot password ── */
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotLoading, setForgotLoading] = useState(false);

    const isRegister = tab === "register";

    /* ── OTP countdown timer (registration) ── */
    useEffect(() => {
        if (otpCountdown <= 0) return;
        const timer = setInterval(() => setOtpCountdown((c) => c - 1), 1000);
        return () => clearInterval(timer);
    }, [otpCountdown]);

    /* ── Login OTP expiry countdown (5 min) ── */
    useEffect(() => {
        if (loginOtpExpiry <= 0) return;
        const timer = setInterval(() => setLoginOtpExpiry((c) => c - 1), 1000);
        return () => clearInterval(timer);
    }, [loginOtpExpiry]);

    /* ── Login OTP resend cooldown (60 s) ── */
    useEffect(() => {
        if (loginOtpResend <= 0) return;
        const timer = setInterval(() => setLoginOtpResend((c) => c - 1), 1000);
        return () => clearInterval(timer);
    }, [loginOtpResend]);

    /* ── Lock countdown timer ── */
    useEffect(() => {
        if (!isLocked || !lockUntilMs) return;
        const tick = () => {
            const diff = lockUntilMs - Date.now();
            if (diff <= 0) {
                setIsLocked(false);
                setLockUntilMs(null);
                setLockCountdown("");
                return;
            }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setLockCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [isLocked, lockUntilMs]);

    /* ── Reset OTP state when switching tabs ── */
    useEffect(() => {
        if (tab === "login") {
            setOtpStep("form");
            setOtpDigits(["", "", "", "", "", ""]);
            setOtpCountdown(0);
            // Also reset login OTP step when switching to login tab explicitly
            setLoginOtpStep("form");
            setLoginOtpDigits(["", "", "", "", "", ""]);
            setPendingUserId("");
            setLoginMaskedEmail("");
            setLoginOtpError("");
        }
    }, [tab]);

    /* ── Load remembered email ── */
    useEffect(() => {
        const rememberedEmail = localStorage.getItem("remembered_email");
        if (rememberedEmail) {
            setLoginForm((current) => ({ ...current, email: rememberedEmail }));
            setRememberMe(true);
        }
    }, []);

    /* ── Validate password in register mode ── */
    useEffect(() => {
        if (isRegister) {
            setPasswordValidation(validatePassword(registerForm.password));
            setConfirmPasswordError(
                registerForm.confirm && registerForm.password !== registerForm.confirm
                    ? "Passwords do not match"
                    : ""
            );
        }
    }, [registerForm.password, registerForm.confirm, isRegister]);

    /* ── Redirect helper ── */
    const performRedirect = useCallback((role: string) => {
        const redirectUrl = sessionStorage.getItem("redirect_after_login");
        const dashboardPath = getDashboardPathForRole(role);
        console.log('🧭 [DEBUG-Login] performRedirect called:', {
            inputRole: role,
            typeofRole: typeof role,
            computedDashboardPath: dashboardPath,
            hasRedirectOverride: !!redirectUrl,
            redirectOverride: redirectUrl,
        });
        if (redirectUrl) {
            sessionStorage.removeItem("redirect_after_login");
            console.log('🧭 [DEBUG-Login] Navigating to override:', redirectUrl);
            navigate(redirectUrl, { replace: true });
            return;
        }
        console.log('🧭 [DEBUG-Login] Navigating to dashboard:', dashboardPath);
        navigate(dashboardPath, { replace: true });
    }, [navigate]);

    /* ── Redirect on auth state ── */
    useEffect(() => {
        console.log('🔄 [DEBUG-Login] useEffect triggered =>', {
            hasUser: !!user,
            role: user?.role,
            isAuthLoading,
            isFirebaseAuthReady,
            hasToken: !!localStorage.getItem('autospf_token'),
        });
        // GUARD: Only redirect once Firebase has confirmed the session.
        // Without this, a stale localStorage user would trigger a redirect
        // before onAuthStateChanged verifies the token is still valid.
        if (user && !isAuthLoading && isFirebaseAuthReady) {
            console.log('🚀 [DEBUG-Login] REDIRECTING user with role:', user.role, '=> path:', getDashboardPathForRole(user.role));
            performRedirect(user.role);
        }
    }, [user, isAuthLoading, isFirebaseAuthReady, performRedirect]);

    /* ── Social login ── */
    const handleSocialLogin = async (providerName: "google") => {
        if (!isFirebaseInitialized) {
            toast.error("Firebase configuration is missing.");
            return;
        }
        setIsLoading(true);

        // ── CRITICAL: Tell onAuthStateChanged to DEFER ──
        // signInWithPopup triggers onAuthStateChanged immediately when the popup
        // closes. Without this flag, onAuthStateChanged races our backend call,
        // sets isLoading=true, and ProtectedRoute shows skeleton instead of dashboard.
        markLoginInProgress();

        try {
            const provider = googleProvider;
            const result = await signInWithPopup(auth, provider);
            const firebaseUser = result.user;

            // ── Call backend /social-login to sync user + get JWT ──
            let didRedirect = false;
            let didBlock = false; // True if account is suspended — prevents "Welcome back!" fallback
            try {
                const backendUrl = getBaseApiUrl();
                const resp = await fetch(`${backendUrl}/auth/social-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: firebaseUser.email,
                        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                        provider: providerName,
                        providerId: firebaseUser.uid,
                        photoURL: firebaseUser.photoURL || undefined,
                    }),
                    signal: AbortSignal.timeout(8000),
                });
                if (resp.ok) {
                    const json = await resp.json();
                    const backendUser = json.data?.user;
                    const backendToken = json.data?.token;

                    if (backendToken) {
                        localStorage.setItem('autospf_token', backendToken);
                    }

                    if (backendUser) {
                        // Block suspended/inactive accounts before setting session
                        if (backendUser.isActive === false) {
                            didBlock = true;
                            await signOut(auth).catch(() => {});
                            markLoginComplete();
                            localStorage.removeItem('autospf_token');
                            localStorage.removeItem('autospf_backend_user');
                            localStorage.removeItem('autospf_session_cache');
                            toast.error('Account Suspended', {
                                description: 'This account is disabled. Please try to contact the administrator.',
                                duration: 6000,
                            });
                            setIsLoading(false);
                            return;
                        }

                        localStorage.setItem('autospf_backend_user', JSON.stringify(backendUser));

                        // Build the user object for AuthContext
                        const userData = {
                            id: backendUser.id || backendUser._id || firebaseUser.uid,
                            _id: backendUser.id || backendUser._id || '',
                            email: backendUser.email || firebaseUser.email || '',
                            name: backendUser.name || firebaseUser.displayName || 'User',
                            role: backendUser.role || 'customer',
                            createdAt: backendUser.createdAt || new Date().toISOString(),
                            password: '',
                            isActive: backendUser.isActive ?? true,
                            lastActive: backendUser.lastActive || new Date().toISOString(),
                            avatar: backendUser.avatar || firebaseUser.photoURL || undefined,
                        };

                        // Persist session cache for instant restore
                        try {
                            localStorage.setItem('autospf_session_cache', JSON.stringify({
                                user: userData,
                                token: backendToken || '',
                                timestamp: Date.now(),
                            }));
                        } catch { /* quota */ }

                        // Hydrate AuthContext — sets user + isFirebaseAuthReady + loginResolved
                        setAuthUser(userData);

                        toast.success("Welcome back!");
                        didRedirect = true;

                        // Navigate after React commits the state
                        const role = backendUser.role || 'customer';
                        const dashPath = getDashboardPathForRole(role);
                        setTimeout(() => {
                            navigate(dashPath, { replace: true });
                        }, 80);
                        return;
                    }
                    console.log('✅ [Login] Backend social-login synced successfully');
                } else {
                    // Handle 403 ACCOUNT_INACTIVE from backend
                    const errBody = await resp.json().catch(() => ({}));
                    if (resp.status === 403 && errBody?.code === 'ACCOUNT_INACTIVE') {
                        didBlock = true;
                        await signOut(auth).catch(() => {});
                        markLoginComplete();
                        localStorage.removeItem('autospf_token');
                        localStorage.removeItem('autospf_backend_user');
                        localStorage.removeItem('autospf_session_cache');
                        toast.error('Account Suspended', {
                            description: errBody?.message || 'This account is disabled. Please try to contact the administrator.',
                            duration: 6000,
                        });
                        setIsLoading(false);
                        return;
                    }
                    console.warn('⚠️ [Login] Backend social-login returned', resp.status);
                }
            } catch (backendErr) {
                console.warn('⚠️ [Login] Backend social-login call failed:', backendErr);
            }

            if (!didRedirect && !didBlock) {
                // Fallback: let onAuthStateChanged handle the rest
                markLoginComplete();
                toast.success("Welcome back!");
            }
        } catch (error: any) {
            markLoginComplete();
            // Don't show error for user-cancelled popup
            if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
                return;
            }
            toast.error(error.message || "Social login failed");
        } finally {
            setIsLoading(false);
        }
    };

    /* ── Login submit ── */
    const handleLoginSubmit = async () => {
        if (!loginForm.email || !loginForm.password) {
            toast.error("Please fill in all fields.");
            return;
        }
        if (isLocked) {
            toast.error(`Account locked. Try again in ${lockCountdown}.`);
            return;
        }
        setIsLoading(true);
        try {
            const result = await login(loginForm.email, loginForm.password);

            // ── 2FA: non-customer role ──
            if (result.requiresOTP) {
                setPendingUserId(result.userId ?? "");
                setLoginMaskedEmail(result.maskedEmail ?? loginForm.email);
                setLoginOtpDigits(["", "", "", "", "", ""]);
                setLoginOtpExpiry(300); // 5 min
                setLoginOtpResend(60);  // 60 s cooldown
                setLoginOtpError("");
                setLoginOtpStep("otp");
                toast.success("Verification code sent to your email.");
                setTimeout(() => loginOtpInputRefs.current[0]?.focus(), 120);
                return;
            }

            if (!result.success) {
                // Handle structured lock / attempt data from backend
                if (result.data?.locked || result.data?.lockUntilMs) {
                    setIsLocked(true);
                    setLockUntilMs(result.data.lockUntilMs ?? Date.now() + 15 * 60 * 1000);
                    setLoginAttempts(0);
                    setRemainingAttempts(0);
                    toast.error(result.message || "Account locked.");
                } else if (result.data?.remainingAttempts !== undefined) {
                    setLoginAttempts(result.data.loginAttempts ?? loginAttempts + 1);
                    setRemainingAttempts(result.data.remainingAttempts);
                    toast.error(result.message || "Invalid credentials.");
                } else {
                    // Firebase-level error or unknown (no structured data)
                    toast.error(result.message || "Invalid credentials.");
                }
                return;
            }
            // Success — reset attempt state
            setLoginAttempts(0);
            setRemainingAttempts(null);
            setIsLocked(false);
            setLockUntilMs(null);
            if (rememberMe) localStorage.setItem("remembered_email", loginForm.email);
            else localStorage.removeItem("remembered_email");
            toast.success("Welcome back.");
            // Redirect is handled by the useEffect that watches [user, isAuthLoading, isFirebaseAuthReady].
            // The useEffect fires AFTER React commits the setUser() state update from login(),
            // so ProtectedRoute is guaranteed to see the authenticated user when it renders.
            // DO NOT call performRedirect() here — it races with React's state commit and
            // causes ProtectedRoute to see user=null, triggering a redirect loop.
        } catch {
            toast.error("Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    /* ── Login OTP: digit input handler ── */
    const handleLoginOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const updated = [...loginOtpDigits];
        updated[index] = value.slice(-1);
        setLoginOtpDigits(updated);
        setLoginOtpError("");
        if (value && index < 5) loginOtpInputRefs.current[index + 1]?.focus();
    };

    const handleLoginOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !loginOtpDigits[index] && index > 0) {
            loginOtpInputRefs.current[index - 1]?.focus();
        }
        if (e.key === "Enter" && loginOtpDigits.every((d) => d)) {
            handleVerifyLoginOtp();
        }
    };

    const handleLoginOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length > 0) {
            const updated = Array.from({ length: 6 }, (_, i) => pasted[i] || "");
            setLoginOtpDigits(updated);
            loginOtpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
        }
    };

    /* ── Login OTP: verify ── */
    const handleVerifyLoginOtp = async () => {
        const code = loginOtpDigits.join("");
        if (code.length !== 6) {
            setLoginOtpError("Please enter the complete 6-digit code.");
            return;
        }
        setLoginOtpVerifying(true);
        setLoginOtpError("");
        try {
            const backendUrl = getBaseApiUrl();
            const resp = await fetch(`${backendUrl}/auth/verify-login-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: pendingUserId, otp: code }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();

            if (!resp.ok || !json.success) {
                // Shake animation
                setLoginOtpShake(true);
                setTimeout(() => setLoginOtpShake(false), 600);
                setLoginOtpDigits(["", "", "", "", "", ""]);
                setTimeout(() => loginOtpInputRefs.current[0]?.focus(), 50);

                if (resp.status === 429) {
                    setLoginOtpError(json.message || "Too many failed attempts. Request a new code.");
                } else {
                    setLoginOtpError(json.message || "Invalid code. Please try again.");
                }
                return;
            }

            // OTP verified — store JWT and hydrate AuthContext immediately.
            const backendUser = json.data?.user;
            const backendToken = json.data?.token;

            if (backendToken) {
                localStorage.setItem("autospf_token", backendToken);
            }
            if (backendUser) {
                // Keep in localStorage so onAuthStateChanged's backend-only session guard
                // can restore it if it fires before React state propagates.
                localStorage.setItem("autospf_backend_user", JSON.stringify(backendUser));

                // ── Critical: set AuthContext user state NOW ──
                // Without this, ProtectedRoute sees null user and bounces to /login
                // before onAuthStateChanged has a chance to restore the session.
                setAuthUser({
                    id: backendUser._id || backendUser.id || "",
                    _id: backendUser._id || backendUser.id || "",
                    email: backendUser.email || "",
                    name: backendUser.name || "",
                    role: backendUser.role || "customer",
                    createdAt: backendUser.createdAt || new Date().toISOString(),
                    password: "",
                    isActive: backendUser.isActive ?? true,
                    lastActive: backendUser.lastActive || new Date().toISOString(),
                    avatar: backendUser.avatar || undefined,
                });
            }

            const role = backendUser?.role ?? "customer";
            if (rememberMe) localStorage.setItem("remembered_email", loginForm.email);
            toast.success("Verification successful. Welcome!");
            setLoginOtpStep("form");
            setPendingUserId("");
            setLoginMaskedEmail("");
            performRedirect(role);
        } catch {
            setLoginOtpError("Verification failed. Please try again.");
        } finally {
            setLoginOtpVerifying(false);
        }
    };

    /* ── Login OTP: resend ── */
    const handleResendLoginOtp = async () => {
        if (loginOtpResend > 0 || !pendingUserId) return;
        setLoginOtpResending(true);
        try {
            const backendUrl = getBaseApiUrl();
            const resp = await fetch(`${backendUrl}/auth/resend-login-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: pendingUserId }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();
            if (resp.ok && json.success) {
                toast.success("New verification code sent!");
                setLoginOtpDigits(["", "", "", "", "", ""]);
                setLoginOtpExpiry(300);
                setLoginOtpResend(60);
                setLoginOtpError("");
                setTimeout(() => loginOtpInputRefs.current[0]?.focus(), 50);
            } else {
                toast.error(json.message || "Failed to resend code.");
            }
        } catch {
            toast.error("Failed to resend code. Please try again.");
        } finally {
            setLoginOtpResending(false);
        }
    };

    /* ── Register Step 1: Validate form & send OTP ── */
    const handleRegisterSubmit = async () => {
        if (!registerForm.name || !registerForm.email || !registerForm.password || !registerForm.confirm) {
            toast.error("Please fill in all fields.");
            return;
        }
        if (!registerForm.agree) {
            toast.error("Please accept the Terms & Conditions.");
            return;
        }
        if (!validatePassword(registerForm.password).isValid) {
            toast.error("Please use a stronger password.");
            return;
        }
        if (registerForm.password !== registerForm.confirm) {
            toast.error("Passwords do not match.");
            return;
        }

        // Send OTP to the user's email
        setOtpSending(true);
        try {
            const backendUrl = getBaseApiUrl();
            const resp = await fetch(`${backendUrl}/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registerForm.email }),
                signal: AbortSignal.timeout(15000),
            });
            const json = await resp.json();
            if (resp.ok && json.success) {
                toast.success(`Verification code sent to ${registerForm.email}`);
                setOtpStep("verify");
                setOtpDigits(["", "", "", "", "", ""]);
                setOtpCountdown(60);
                // Auto-focus first OTP input
                setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
            } else {
                toast.error(json.message || "Failed to send verification code.");
            }
        } catch {
            toast.error("Failed to send verification code. Please try again.");
        } finally {
            setOtpSending(false);
        }
    };

    /* ── Resend OTP ── */
    const handleResendOtp = async () => {
        if (otpCountdown > 0) return;
        setOtpSending(true);
        try {
            const backendUrl = getBaseApiUrl();
            const resp = await fetch(`${backendUrl}/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registerForm.email }),
                signal: AbortSignal.timeout(15000),
            });
            const json = await resp.json();
            if (resp.ok && json.success) {
                toast.success("New code sent!");
                setOtpDigits(["", "", "", "", "", ""]);
                setOtpCountdown(60);
                otpInputRefs.current[0]?.focus();
            } else {
                toast.error(json.message || "Failed to resend code.");
            }
        } catch {
            toast.error("Failed to resend code.");
        } finally {
            setOtpSending(false);
        }
    };

    /* ── OTP digit input handler ── */
    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // digits only
        const updated = [...otpDigits];
        updated[index] = value.slice(-1); // single digit
        setOtpDigits(updated);
        // Auto-advance to next input
        if (value && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
        if (e.key === "Enter" && otpDigits.every((d) => d)) {
            handleVerifyOtp();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length > 0) {
            const updated = [...otpDigits];
            for (let i = 0; i < 6; i++) updated[i] = pasted[i] || "";
            setOtpDigits(updated);
            const focusIdx = Math.min(pasted.length, 5);
            otpInputRefs.current[focusIdx]?.focus();
        }
    };

    /* ── Verify OTP & Create Account ── */
    const handleVerifyOtp = async () => {
        const code = otpDigits.join("");
        if (code.length !== 6) {
            toast.error("Please enter the complete 6-digit code.");
            return;
        }

        setOtpVerifying(true);
        try {
            const backendUrl = getBaseApiUrl();

            // Step 1: Verify OTP with backend
            const verifyResp = await fetch(`${backendUrl}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registerForm.email, otp: code }),
                signal: AbortSignal.timeout(10000),
            });
            const verifyJson = await verifyResp.json();

            if (!verifyResp.ok || !verifyJson.success) {
                toast.error(verifyJson.message || "Invalid verification code.");
                setOtpDigits(["", "", "", "", "", ""]);
                otpInputRefs.current[0]?.focus();
                return;
            }

            // Step 2: OTP verified — now create the account
            const result = await signup(registerForm.email, registerForm.password, registerForm.name);
            if (!result.success) {
                toast.error(result.message || "Failed to create account.");
                return;
            }

            toast.success("Account created successfully!");
            setOtpStep("form");
            setOtpDigits(["", "", "", "", "", ""]);
            setTab("login");
            setLoginForm({ email: registerForm.email, password: "" });
            setRegisterForm({ name: "", email: "", password: "", confirm: "", agree: false });
        } catch {
            toast.error("Verification failed. Please try again.");
        } finally {
            setOtpVerifying(false);
        }
    };

    /* ── Forgot password ── */
    const handleForgotPassword = async () => {
        if (!forgotEmail) {
            toast.error("Enter your email address");
            return;
        }
        setForgotLoading(true);
        try {
            const result = await resetPassword(forgotEmail);
            if (result.success) {
                toast.success("Password reset email sent! Check your inbox.");
                setShowForgotModal(false);
                setForgotEmail("");
            } else {
                toast.error(result.message || "Failed to request reset");
            }
        } catch {
            toast.error("Failed to request reset");
        } finally {
            setForgotLoading(false);
        }
    };


    /* ═══════════════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════════════ */
    return (
        <div className="min-h-screen flex flex-col bg-background">
            {/* Navbar is rendered globally by App.tsx for all public routes including /login */}

            {/* ── Ambient Background ── */}
            <div className="absolute inset-0 bg-hero-pattern pointer-events-none" />
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-32 w-80 h-80 rounded-full border border-gold/5 animate-spin-slow" />
                <div
                    className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full border border-gold/5"
                    style={{ animation: "spin-slow 20s linear infinite reverse" }}
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-radial-gold opacity-30" />
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-12 relative z-10">
                <div className="w-full max-w-md animate-scale-in">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <Link to="/" className="inline-flex items-center justify-center group mb-4">
                            <img
                                src="/images/autospf-logo.png"
                                alt="AutoSPF+ Logo"
                                className="h-20 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                        </Link>
                        <h1 className="text-2xl font-bold text-foreground mt-2">
                            {tab === "login" ? t("login.title") : t("login.register")}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tab === "login" ? t("login.subtitle") : t("login.registerSubtitle")}
                        </p>
                    </div>

                    {/* ── Glass Card ── */}
                    <div className="glass rounded-3xl p-8 border border-gold/15">
                        {/* Tabs */}
                        <div className="flex rounded-xl p-1 bg-muted/30 mb-8 gap-1">
                            <button
                                onClick={() => handleTabSwitch("login")}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
                                    tab === "login"
                                        ? "bg-gradient-gold text-primary-foreground glow-gold-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                {t("login.tabLogin")}
                            </button>
                            <button
                                onClick={() => handleTabSwitch("register")}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2",
                                    tab === "register"
                                        ? "bg-gradient-gold text-primary-foreground glow-gold-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <UserPlus className="w-3.5 h-3.5" />
                                {t("login.tabRegister")}
                            </button>
                        </div>

                        {/* ══ Animated form content ══ */}
                        <div className="overflow-hidden">
                        <div
                            key={tab}
                            className={cn(
                                tab === "register" ? "animate-tab-from-right" : "animate-tab-from-left"
                            )}
                        >

                        {/* ══════════ LOGIN FORM ══════════ */}
                        {tab === "login" && loginOtpStep === "form" && (
                            <div className="space-y-4">
                                {/* Email */}
                                <div>
                                    <Label htmlFor="login-email" className="text-sm text-muted-foreground mb-1.5 block">{t("login.email")}</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="login-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            value={loginForm.email}
                                            onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder="your@email.com"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <Label htmlFor="login-password" className="text-sm text-muted-foreground">{t("login.password")}</Label>
                                        <button
                                            onClick={() => setShowForgotModal(true)}
                                            className="text-xs text-primary hover:text-accent transition-colors"
                                        >
                                            {t("login.forgotPassword")}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="login-password"
                                            name="password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="current-password"
                                            value={loginForm.password}
                                            onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                                            placeholder="••••••••"
                                            className="pl-9 pr-9 bg-muted/40 border-border focus:border-primary"
                                            onKeyDown={(e) => e.key === "Enter" && handleLoginSubmit()}
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* ── Failed-attempt warning banner ── */}
                                {loginAttempts > 0 && !isLocked && remainingAttempts !== null && (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs animate-slide-up">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-amber-300">
                                                {loginAttempts} failed attempt{loginAttempts !== 1 ? "s" : ""}
                                            </p>
                                            <p className="text-amber-400/80 mt-0.5">
                                                {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""} remaining before your account is locked for 15 minutes.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* ── Account locked countdown banner ── */}
                                {isLocked && (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-xs animate-slide-up">
                                        <LockKeyhole className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-red-300">Account Temporarily Locked</p>
                                            <p className="text-red-400/80 mt-0.5">
                                                Too many failed attempts. Try again in{" "}
                                                <span className="font-mono font-bold text-red-300">{lockCountdown || "15:00"}</span>.
                                            </p>
                                        </div>
                                        <Clock className="w-4 h-4 text-red-400/60 shrink-0 mt-0.5" />
                                    </div>
                                )}

                                {/* Remember me */}
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div
                                        onClick={() => setRememberMe(!rememberMe)}
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                                            rememberMe ? "bg-gradient-gold border-gold" : "border-border group-hover:border-gold/40"
                                        )}
                                    >
                                        {rememberMe && <span className="text-primary-foreground text-[10px] font-bold leading-none">✓</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">Remember me</span>
                                </label>

                                {/* Submit */}
                                <Button
                                    onClick={handleLoginSubmit}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold mt-2 group"
                                    disabled={!loginForm.email || !loginForm.password || isLoading || isLocked}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <LogIn className="w-4 h-4 mr-2 group-hover:translate-x-0.5 transition-transform" />
                                    )}
                                    {isLoading ? "Signing in..." : t("login.signIn")}
                                </Button>

                                {/* Divider */}
                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-border" />
                                    </div>
                                    <div className="relative flex justify-center text-xs text-muted-foreground bg-transparent">
                                        <span className="bg-card px-2">{t("login.orContinueWith")}</span>
                                    </div>
                                </div>

                                {/* Google Sign-in */}
                                <Button
                                    variant="outline"
                                    onClick={() => handleSocialLogin("google")}
                                    disabled={isLoading}
                                    className="w-full relative overflow-hidden bg-background/50 border-border text-white text-xs hover:text-white transition-all duration-300 rounded-lg group hover:border-[#4285F4]/30 hover:shadow-[0_0_15px_rgba(66,133,244,0.15)]"
                                >
                                    {/* Google-inspired accent glow */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-[#4285F4]/10 via-[#EA4335]/10 via-[#FBBC05]/10 to-[#34A853]/10" />

                                    <div className="relative flex items-center justify-center gap-2.5">
                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        <span className="font-medium tracking-wide">Google</span>
                                    </div>
                                </Button>
                            </div>
                        )}

                        {/* ══════════ LOGIN 2FA OTP SCREEN ══════════ */}
                        {tab === "login" && loginOtpStep === "otp" && (
                            <div className="space-y-5 animate-slide-up">
                                {/* Header */}
                                <div className="text-center space-y-2">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 mb-1">
                                        <ShieldCheck className="w-7 h-7 text-gold" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">Two-Factor Verification</h2>
                                    <p className="text-sm text-muted-foreground">
                                        We sent a 6-digit code to{" "}
                                        <span className="font-semibold text-foreground">{loginMaskedEmail}</span>
                                    </p>
                                </div>

                                {/* Expiry timer */}
                                {loginOtpExpiry > 0 && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Code expires in{" "}
                                            <span className={cn("font-mono font-semibold", loginOtpExpiry <= 60 ? "text-red-400" : "text-foreground")}>
                                                {String(Math.floor(loginOtpExpiry / 60)).padStart(2, "0")}:{String(loginOtpExpiry % 60).padStart(2, "0")}
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {loginOtpExpiry === 0 && (
                                    <p className="text-center text-xs text-red-400">Code expired. Please resend.</p>
                                )}

                                {/* Digit inputs */}
                                <div
                                    className={cn(
                                        "flex gap-2 justify-center transition-all",
                                        loginOtpShake && "animate-[shake_0.4s_ease-in-out]"
                                    )}
                                    style={loginOtpShake ? { animation: "shake 0.4s ease-in-out" } : undefined}
                                >
                                    <style>{`
                                        @keyframes shake {
                                          0%,100%{transform:translateX(0)}
                                          20%{transform:translateX(-6px)}
                                          40%{transform:translateX(6px)}
                                          60%{transform:translateX(-4px)}
                                          80%{transform:translateX(4px)}
                                        }
                                    `}</style>
                                    {loginOtpDigits.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={(el) => { loginOtpInputRefs.current[idx] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleLoginOtpChange(idx, e.target.value)}
                                            onKeyDown={(e) => handleLoginOtpKeyDown(idx, e)}
                                            onPaste={idx === 0 ? handleLoginOtpPaste : undefined}
                                            className={cn(
                                                "w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-muted/40 text-foreground",
                                                "focus:outline-none focus:ring-0 transition-all duration-200",
                                                digit ? "border-gold/60 bg-gold/5" : "border-border",
                                                "focus:border-gold shadow-inner"
                                            )}
                                        />
                                    ))}
                                </div>

                                {/* Error message */}
                                {loginOtpError && (
                                    <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>{loginOtpError}</span>
                                    </div>
                                )}

                                {/* Verify button */}
                                <Button
                                    onClick={handleVerifyLoginOtp}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold group"
                                    disabled={loginOtpDigits.some((d) => !d) || loginOtpVerifying}
                                >
                                    {loginOtpVerifying ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <ShieldCheck className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                                    )}
                                    {loginOtpVerifying ? "Verifying..." : "Verify Access"}
                                </Button>

                                {/* Resend + back */}
                                <div className="flex items-center justify-between text-xs">
                                    <button
                                        onClick={() => {
                                            setLoginOtpStep("form");
                                            setPendingUserId("");
                                            setLoginMaskedEmail("");
                                            setLoginOtpDigits(["", "", "", "", "", ""]);
                                            setLoginOtpError("");
                                        }}
                                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        Back to login
                                    </button>

                                    <button
                                        onClick={handleResendLoginOtp}
                                        disabled={loginOtpResend > 0 || loginOtpResending}
                                        className={cn(
                                            "flex items-center gap-1 transition-colors",
                                            loginOtpResend > 0 || loginOtpResending
                                                ? "text-muted-foreground/50 cursor-not-allowed"
                                                : "text-primary hover:text-accent"
                                        )}
                                    >
                                        {loginOtpResending ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        )}
                                        {loginOtpResend > 0 ? `Resend in ${loginOtpResend}s` : "Resend code"}
                                    </button>
                                </div>
                            </div>
                        )}


                        {tab === "register" && otpStep === "form" && (
                            <div className="space-y-4 animate-slide-up">
                                {/* Full Name */}
                                <div>
                                    <Label htmlFor="register-name" className="text-sm text-muted-foreground mb-1.5 block">{t("login.fullName")}</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="register-name"
                                            name="name"
                                            autoComplete="name"
                                            value={registerForm.name}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                                            placeholder="Juan dela Cruz"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <Label htmlFor="register-email" className="text-sm text-muted-foreground mb-1.5 block">{t("login.email")}</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="register-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            value={registerForm.email}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder="your@email.com"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <Label htmlFor="register-password" className="text-sm text-muted-foreground mb-1.5 block">{t("login.password")}</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="register-password"
                                            name="password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={registerForm.password}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                                            placeholder="••••••••"
                                            className="pl-9 pr-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {/* Password strength indicators */}
                                    {registerForm.password && (
                                        <div className="mt-2 space-y-1">
                                            {Object.entries(passwordValidation.requirements).map(([key, met]) => (
                                                <div key={key} className="flex items-center gap-1.5 text-[10px]">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full transition-colors",
                                                        met ? "bg-emerald-500" : "bg-muted-foreground/30"
                                                    )} />
                                                    <span className={cn(
                                                        "transition-colors",
                                                        met ? "text-emerald-400" : "text-muted-foreground"
                                                    )}>
                                                        {key === "length" && "8+ characters"}
                                                        {key === "uppercase" && "Uppercase letter"}
                                                        {key === "lowercase" && "Lowercase letter"}
                                                        {key === "number" && "Number"}
                                                        {key === "specialChar" && "Special character"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <Label htmlFor="register-confirm" className="text-sm text-muted-foreground mb-1.5 block">{t("login.confirmPassword")}</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="register-confirm"
                                            name="confirm-password"
                                            type={showConfirm ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={registerForm.confirm}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, confirm: e.target.value }))}
                                            placeholder="••••••••"
                                            className={cn(
                                                "pl-9 pr-9 bg-muted/40 border-border focus:border-primary",
                                                confirmPasswordError && "border-destructive"
                                            )}
                                        />
                                        <button
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {confirmPasswordError && (
                                        <p className="text-xs text-destructive mt-1">{confirmPasswordError}</p>
                                    )}
                                </div>

                                {/* Terms */}
                                <label className="flex items-start gap-2.5 cursor-pointer group">
                                    <div
                                        onClick={() => setRegisterForm((f) => ({ ...f, agree: !f.agree }))}
                                        className={cn(
                                            "w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-all",
                                            registerForm.agree ? "bg-gradient-gold border-gold" : "border-border group-hover:border-gold/40"
                                        )}
                                    >
                                        {registerForm.agree && <span className="text-primary-foreground text-[10px] font-bold leading-none">✓</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{t("login.agreeTerms")}</span>
                                </label>

                                {/* Submit — sends OTP first */}
                                <Button
                                    onClick={handleRegisterSubmit}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold mt-2 group"
                                    disabled={!registerForm.name || !registerForm.email || !registerForm.password || !registerForm.agree || otpSending}
                                >
                                    {otpSending ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Mail className="w-4 h-4 mr-2" />
                                    )}
                                    {otpSending ? "Sending code..." : "Send Verification Code"}
                                </Button>
                            </div>
                        )}

                        {/* ══════════ OTP VERIFICATION STEP ══════════ */}
                        {tab === "register" && otpStep === "verify" && (
                            <div className="space-y-6 animate-slide-up">
                                {/* Back button */}
                                <button
                                    onClick={() => { setOtpStep("form"); setOtpDigits(["", "", "", "", "", ""]); }}
                                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Back to form
                                </button>

                                {/* Shield icon & instructions */}
                                <div className="text-center space-y-3">
                                    <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-gold flex items-center justify-center glow-gold">
                                        <ShieldCheck className="w-7 h-7 text-primary-foreground" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-foreground">Verify Your Email</h2>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            We sent a 6-digit code to{" "}
                                            <span className="text-primary font-medium">{registerForm.email}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* 6-digit OTP inputs */}
                                <div className="flex justify-center gap-2.5" onPaste={handleOtpPaste}>
                                    {otpDigits.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { otpInputRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            className={cn(
                                                "w-11 h-13 text-center text-xl font-bold rounded-xl border-2 bg-muted/40 text-foreground",
                                                "outline-none transition-all duration-200",
                                                "focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-muted/60",
                                                digit ? "border-primary/50" : "border-border"
                                            )}
                                            style={{ caretColor: 'transparent' }}
                                        />
                                    ))}
                                </div>

                                {/* Countdown & Resend */}
                                <div className="text-center">
                                    {otpCountdown > 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Resend code in <span className="text-primary font-semibold">{otpCountdown}s</span>
                                        </p>
                                    ) : (
                                        <button
                                            onClick={handleResendOtp}
                                            disabled={otpSending}
                                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-accent transition-colors font-medium disabled:opacity-50"
                                        >
                                            <RefreshCw className={cn("w-3 h-3", otpSending && "animate-spin")} />
                                            {otpSending ? "Sending..." : "Resend Code"}
                                        </button>
                                    )}
                                </div>

                                {/* Verify & Create Account */}
                                <Button
                                    onClick={handleVerifyOtp}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold group"
                                    disabled={otpDigits.some((d) => !d) || otpVerifying}
                                >
                                    {otpVerifying ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <ShieldCheck className="w-4 h-4 mr-2" />
                                    )}
                                    {otpVerifying ? "Verifying..." : "Verify & Create Account"}
                                </Button>
                            </div>
                        )}
                        </div>{/* end animated form wrapper */}
                        </div>{/* end overflow-hidden wrapper */}
                    </div>

                    {/* Back to home */}
                    <p className="text-center text-sm text-muted-foreground mt-6">
                        <Link to="/" className="text-primary hover:text-accent transition-colors">
                            ← {t("nav.home")}
                        </Link>
                    </p>
                </div>
            </div>

            {/* ═══════════════ Forgot Password Modal ═══════════════ */}
            <Dialog open={showForgotModal} onOpenChange={setShowForgotModal}>
                <DialogContent className="glass border-gold/15 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Reset Password</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Enter your email address and we'll send you a link to reset your password.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="email"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="pl-9 bg-muted/40 border-border focus:border-primary"
                                onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                            />
                        </div>
                        <Button
                            onClick={handleForgotPassword}
                            className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold"
                            disabled={!forgotEmail || forgotLoading}
                        >
                            {forgotLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Mail className="w-4 h-4 mr-2" />
                            )}
                            {forgotLoading ? "Sending..." : "Send Reset Link"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
