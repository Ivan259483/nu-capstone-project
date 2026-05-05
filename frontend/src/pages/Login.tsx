import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, Mail, Lock, Loader2, ArrowLeft, ShieldCheck, RefreshCw, AlertTriangle, LockKeyhole, Clock, UserPlus } from "lucide-react";

import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseApiUrl } from "@/lib/api";
import { getDashboardPathForRole } from "@/lib/roles";
import { buildRegisterE164, validateRegisterNationalDigits } from "@/lib/phone";
import { REGISTER_COUNTRY_DIALS } from "@/lib/countries-dial-data";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";




/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function Login() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { login, resetPassword, user, isLoading: isAuthLoading, isFirebaseAuthReady, setAuthUser } = useAuth();

    /* ── Form state ── */
    const [showPassword, setShowPassword] = useState(false);
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    /* ── Login attempt tracking & lock state ── */
    const [loginAttempts, setLoginAttempts] = useState(0);
    const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
    const [lockCountdown, setLockCountdown] = useState("");



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

    /* ── Tab ── */
    const [tab, setTab] = useState<"login" | "register">("login");

    /* ── Register form ── */
    const [registerForm, setRegisterForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [registerPhoneCountryIso, setRegisterPhoneCountryIso] = useState("PH");
    const [registerPhoneNational, setRegisterPhoneNational] = useState("");
    const [registerPhoneError, setRegisterPhoneError] = useState("");
    const [registerLoading, setRegisterLoading] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);

    useEffect(() => {
        if (registerForm.password.length === 0) setShowRegisterPassword(false);
    }, [registerForm.password.length]);

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

    /* ── Load remembered email ── */
    useEffect(() => {
        const rememberedEmail = localStorage.getItem("remembered_email");
        if (rememberedEmail) {
            setLoginForm((current) => ({ ...current, email: rememberedEmail }));
            setRememberMe(true);
        }
    }, []);

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

            // ── Unverified account: redirect to OTP verification page ──
            if (result.requiresOtp || result.data?.requiresOtp) {
                const emailToVerify = result.data?.email || loginForm.email;
                navigate(`/verify-otp?email=${encodeURIComponent(emailToVerify)}`);
                toast.info("Please verify your email to continue.");
                return;
            }

            // ── Staff first login: force password change ──
            if (result.requiresPasswordChange || result.data?.requiresPasswordChange) {
                const tempToken = result.data?.token || result.token;
                if (tempToken) localStorage.setItem("autospf_set_password_token", tempToken);
                navigate("/set-password");
                toast.info("Please set your own password to continue.");
                return;
            }

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
        } catch {
            toast.error("Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    /* ── Register submit ── */
    const handleRegisterSubmit = async () => {
        const { firstName, lastName, email, password, confirmPassword } = registerForm;
        const dial =
            REGISTER_COUNTRY_DIALS.find((c) => c.iso === registerPhoneCountryIso)?.dial ?? "63";

        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            toast.error("Please fill in all required fields.");
            return;
        }
        if (password !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        if (!registerPhoneNational.replace(/\D/g, "").length) {
            setRegisterPhoneError("Phone number is required.");
            toast.error("Please enter your phone number.");
            return;
        }
        const phoneCheck = validateRegisterNationalDigits(dial, registerPhoneNational);
        if (!phoneCheck.ok) {
            setRegisterPhoneError(phoneCheck.message || "Invalid phone number.");
            toast.error(phoneCheck.message || "Invalid phone number format.");
            return;
        }
        setRegisterPhoneError("");
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters.");
            return;
        }

        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        const phoneE164 = buildRegisterE164(dial, registerPhoneNational);

        setRegisterLoading(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fullName, email, password, phone: phoneE164 }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.message || "Registration failed.");
                return;
            }
            toast.success("Account created! Please check your email for a verification code.");
            navigate(`/verify-otp?email=${encodeURIComponent(email)}`);
        } catch {
            toast.error("Registration failed. Please try again.");
        } finally {
            setRegisterLoading(false);
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
                    phone: backendUser.phone || undefined,
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
                            {t("login.title")}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t("login.subtitle")}
                        </p>
                    </div>

                    {/* ── Glass Card ── */}
                    <div className="glass rounded-3xl p-8 border border-gold/15">

                        {/* ── Tab switcher ── */}
                        {loginOtpStep === "form" && (
                            <div className="flex rounded-2xl bg-muted/30 p-1 mb-6 gap-1">
                                <button
                                    id="tab-login"
                                    onClick={() => setTab("login")}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-semibold rounded-xl transition-all",
                                        tab === "login"
                                            ? "bg-gradient-gold text-primary-foreground shadow"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Sign In
                                </button>
                                <button
                                    id="tab-register"
                                    onClick={() => setTab("register")}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-semibold rounded-xl transition-all",
                                        tab === "register"
                                            ? "bg-gradient-gold text-primary-foreground shadow"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Register
                                </button>
                            </div>
                        )}

                        {/* ══ Form content ══ */}

                        {/* ══════════ REGISTER FORM ══════════ */}
                        {loginOtpStep === "form" && tab === "register" && (
                            <div className="space-y-4">
                                {/* First Name */}
                                <div>
                                    <Label htmlFor="reg-first-name" className="text-sm text-muted-foreground mb-1.5 block">First Name</Label>
                                    <div className="relative">
                                        <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="reg-first-name"
                                            type="text"
                                            value={registerForm.firstName}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, firstName: e.target.value }))}
                                            placeholder="First name"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                {/* Last Name */}
                                <div>
                                    <Label htmlFor="reg-last-name" className="text-sm text-muted-foreground mb-1.5 block">Last Name</Label>
                                    <div className="relative">
                                        <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="reg-last-name"
                                            type="text"
                                            value={registerForm.lastName}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, lastName: e.target.value }))}
                                            placeholder="Last name"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                {/* Phone Number */}
                                <div>
                                    <Label htmlFor="reg-phone-national" className="text-sm text-muted-foreground mb-1.5 block">
                                        Phone Number <span className="text-red-500">*</span>
                                    </Label>
                                    <RegisterPhoneField
                                        countryIso={registerPhoneCountryIso}
                                        onCountryIsoChange={(iso) => {
                                            setRegisterPhoneCountryIso(iso);
                                            if (registerPhoneError) setRegisterPhoneError("");
                                        }}
                                        nationalDigits={registerPhoneNational}
                                        onNationalDigitsChange={(v) => {
                                            setRegisterPhoneNational(v);
                                            if (registerPhoneError) setRegisterPhoneError("");
                                        }}
                                        hasError={Boolean(registerPhoneError)}
                                        nationalInputId="reg-phone-national"
                                    />
                                    {registerPhoneError ? (
                                        <p className="mt-1 text-xs text-red-600">{registerPhoneError}</p>
                                    ) : null}
                                </div>
                                {/* Email */}
                                <div>
                                    <Label htmlFor="reg-email" className="text-sm text-muted-foreground mb-1.5 block">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="reg-email"
                                            type="email"
                                            value={registerForm.email}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder="Email address"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>
                                {/* Create password + confirm */}
                                <div>
                                    <Label htmlFor="reg-password" className="text-sm text-muted-foreground mb-1.5 block">
                                        Create Password <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="reg-password"
                                            autoComplete="new-password"
                                            type={showRegisterPassword ? "text" : "password"}
                                            value={registerForm.password}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                                            placeholder="Password"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                            onKeyDown={(e) => e.key === "Enter" && handleRegisterSubmit()}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="reg-password-confirm" className="text-sm text-muted-foreground mb-1.5 block">
                                        Confirm Password <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="reg-password-confirm"
                                            autoComplete="new-password"
                                            type={showRegisterPassword ? "text" : "password"}
                                            value={registerForm.confirmPassword}
                                            onChange={(e) => setRegisterForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                                            placeholder="Confirm password"
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                            onKeyDown={(e) => e.key === "Enter" && handleRegisterSubmit()}
                                        />
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        "flex items-center gap-2 overflow-hidden motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-in-out",
                                        registerForm.password.length > 0
                                            ? "pointer-events-auto mt-[10px] max-h-14 opacity-100"
                                            : "pointer-events-none mt-0 max-h-0 opacity-0"
                                    )}
                                    aria-hidden={registerForm.password.length === 0}
                                >
                                    <Checkbox
                                        id="reg-show-passwords"
                                        checked={showRegisterPassword}
                                        onCheckedChange={(c) => setShowRegisterPassword(c === true)}
                                        className={cn(
                                            "h-4 w-4 shrink-0 rounded-[4px] border shadow-none ring-offset-0",
                                            "border-[rgba(255,255,255,0.3)] bg-transparent",
                                            "data-[state=checked]:border-[#F97316] data-[state=checked]:bg-[#F97316]",
                                            "data-[state=checked]:text-white data-[state=unchecked]:bg-transparent",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/40 focus-visible:ring-offset-0",
                                            "[&_svg]:h-3 [&_svg]:w-3 [&_svg]:stroke-[3]"
                                        )}
                                    />
                                    <Label
                                        htmlFor="reg-show-passwords"
                                        className="cursor-pointer text-[13px] font-normal leading-none text-[rgba(255,255,255,0.6)]"
                                    >
                                        Show passwords
                                    </Label>
                                </div>
                                <Button
                                    id="register-submit"
                                    onClick={handleRegisterSubmit}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold mt-2 group"
                                    disabled={
                                        !registerForm.firstName ||
                                        !registerForm.lastName ||
                                        !registerPhoneNational.replace(/\D/g, "").length ||
                                        !registerForm.email ||
                                        !registerForm.password ||
                                        !registerForm.confirmPassword ||
                                        registerLoading
                                    }
                                >
                                    {registerLoading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                                    )}
                                    {registerLoading ? "Creating Account..." : "Create Account"}
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    By registering, you agree to our{" "}
                                    <span className="text-primary cursor-pointer hover:underline">Terms of Service</span>.
                                </p>
                            </div>
                        )}

                        {/* ══════════ LOGIN FORM ══════════ */}
                        {loginOtpStep === "form" && tab === "login" && (

                            <div className="space-y-4">
                                {/* Email */}
                                <div>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="login-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            value={loginForm.email}
                                            onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                                            placeholder={t("login.emailPlaceholder")}
                                            className="pl-9 bg-muted/40 border-border focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <div className="flex items-center justify-end mb-1.5">
                                        <button
                                            type="button"
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
                                            placeholder={t("login.passwordPlaceholder")}
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
                            </div>
                        )}

                        {/* ══════════ LOGIN 2FA OTP SCREEN ══════════ */}
                        {loginOtpStep === "otp" && (
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
