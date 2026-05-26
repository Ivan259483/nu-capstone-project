import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    Eye,
    EyeOff,
    LogIn,
    Mail,
    Lock,
    Loader2,
    ArrowLeft,
    ShieldCheck,
    RefreshCw,
    AlertTriangle,
    LockKeyhole,
    Clock,
    Bot,
    MessageCircle,
    UserPlus,
    CheckCircle2,
    XCircle,
} from "lucide-react";

import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseApiUrl } from "@/lib/api";
import { getDashboardPathForRole, getSafeUserRole } from "@/lib/roles";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";
import { buildRegisterE164, validateRegisterNationalDigits } from "@/lib/phone";
import { REGISTER_COUNTRY_DIALS } from "@/lib/countries-dial-data";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import { ManualRegisterForm } from "@/components/auth/ManualRegisterForm";
import {
    PPF_TERMS_ACCEPTANCE_NOTE,
    PPF_TERMS_BUSINESS,
    PPF_TERMS_HIGHLIGHTS,
    PPF_TERMS_INTRO,
    PPF_TERMS_SECTIONS,
} from "@/content/ppfRegistrationTerms";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

const PPF_TERMS_HIGHLIGHT_ICONS = [Clock, ShieldCheck, RefreshCw, CheckCircle2];
const DEFAULT_LOGIN_REDIRECT = "/customer/dashboard";

function getSafeLoginRedirect(value: string | null): string {
    if (!value) return "";
    let path = value.trim();
    try {
        path = decodeURIComponent(path);
    } catch {
        return "";
    }
    if (!path.startsWith("/") || path.startsWith("//")) return "";
    return path;
}

/* Must match backend register password policy (validation.middleware.js, auth.controller.js). */
const REGISTER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

function registerPasswordRules(password: string) {
    return {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: REGISTER_PASSWORD_SPECIAL_RE.test(password),
    };
}

function registerPasswordPolicyError(password: string): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!REGISTER_PASSWORD_SPECIAL_RE.test(password))
        return "Password must contain at least one special character (!@#$%^&* etc.).";
    return null;
}

function registerPasswordStrength(
    password: string,
    rules: ReturnType<typeof registerPasswordRules>
): { text: string; barClass: string; textClass: string } | null {
    if (!password.length) return null;
    const met = [rules.length, rules.upper, rules.lower, rules.number, rules.special].filter(Boolean).length;
    if (met < 3) return { text: "Weak", barClass: "bg-gradient-to-r from-slate-600 to-slate-500", textClass: "text-slate-400" };
    if (met < 5) return { text: "Medium", barClass: "bg-gradient-to-r from-orange-800 to-orange-600", textClass: "text-orange-300" };
    if (password.length >= 12)
        return { text: "Very strong", barClass: "bg-gradient-to-r from-orange-400 to-amber-300", textClass: "text-orange-200" };
    return { text: "Strong", barClass: "bg-gradient-to-r from-orange-600 to-orange-400", textClass: "text-orange-200" };
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function Login() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { login, resetPassword, user, isLoading: isAuthLoading, isFirebaseAuthReady, setAuthUser, prepareForLogin } = useAuth();
    const redirectParamTo = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return getSafeLoginRedirect(params.get("redirect") || params.get("next"));
    }, [location.search]);
    const redirectTo = redirectParamTo || DEFAULT_LOGIN_REDIRECT;

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
    const [registerView, setRegisterView] = useState<"ai" | "manual">("ai");

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

    const ppfTermsModalScrollRef = useRef<HTMLDivElement>(null);
    const [ppfTermsModalOpen, setPpfTermsModalOpen] = useState(false);
    const [ppfTermsModalBodyKey, setPpfTermsModalBodyKey] = useState(0);
    const [ppfTermsModalScrolledToEnd, setPpfTermsModalScrolledToEnd] = useState(false);
    const [ppfTermsAgreed, setPpfTermsAgreed] = useState(false);
    const [registerWebsiteTermsAgreed, setRegisterWebsiteTermsAgreed] = useState(false);
    const prevTabRef = useRef<"login" | "register">(tab);
    const [sessionClearedForLogin, setSessionClearedForLogin] = useState(false);

    const registerPwRules = useMemo(() => registerPasswordRules(registerForm.password), [registerForm.password]);
    const registerPwAllValid = useMemo(
        () =>
            registerPwRules.length &&
            registerPwRules.upper &&
            registerPwRules.lower &&
            registerPwRules.number &&
            registerPwRules.special,
        [registerPwRules]
    );
    const registerPwStrength = useMemo(
        () => registerPasswordStrength(registerForm.password, registerPwRules),
        [registerForm.password, registerPwRules]
    );

    /** Both register agreement checkboxes must be true before Create Account (UI + submit guard). */
    const registerLegalAcknowledged = useMemo(
        () => ppfTermsAgreed && registerWebsiteTermsAgreed,
        [ppfTermsAgreed, registerWebsiteTermsAgreed]
    );

    useEffect(() => {
        if (registerForm.password.length === 0) setShowRegisterPassword(false);
    }, [registerForm.password.length]);

    useEffect(() => {
        if (tab === "register" && prevTabRef.current !== "register") {
            setPpfTermsAgreed(false);
            setRegisterWebsiteTermsAgreed(false);
            setPpfTermsModalOpen(false);
            setPpfTermsModalScrolledToEnd(false);
            setPpfTermsModalBodyKey((k) => k + 1);
            setRegisterView("ai");
        }
        if (tab !== "register") {
            setRegisterView("ai");
        }
        prevTabRef.current = tab;
    }, [tab]);

    const checkPpfModalTermsScrollEnd = useCallback(() => {
        const el = ppfTermsModalScrollRef.current;
        if (!el) return;
        const threshold = 56;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
            setPpfTermsModalScrolledToEnd(true);
        }
    }, []);

    useLayoutEffect(() => {
        if (!ppfTermsModalOpen) return;
        const el = ppfTermsModalScrollRef.current;
        if (!el) return;
        if (el.scrollHeight <= el.clientHeight + 8) {
            setPpfTermsModalScrolledToEnd(true);
        }
    }, [ppfTermsModalOpen, ppfTermsModalBodyKey]);

    /* ── ?redirect= or ?next= — safe same-origin path only (e.g. return to a protected route after sign-in) ── */
    useEffect(() => {
        if (!redirectParamTo) return;
        sessionStorage.setItem("redirect_after_login", redirectParamTo);
    }, [redirectParamTo]);

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

    /* ── Clear stale admin/customer session so QC can sign in on a shared browser ── */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            await prepareForLogin();
            if (!cancelled) setSessionClearedForLogin(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [prepareForLogin]);

    /* ── Redirect helper ── */
    const performRedirect = useCallback((role: string) => {
        const redirectUrl = redirectParamTo || getSafeLoginRedirect(sessionStorage.getItem("redirect_after_login"));
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
        const fallbackPath = dashboardPath || redirectTo;
        console.log('🧭 [DEBUG-Login] Navigating to dashboard:', fallbackPath);
        navigate(fallbackPath, { replace: true });
    }, [navigate, redirectParamTo, redirectTo]);

    /* ── Redirect on auth state (only after stale session cleared on /login) ── */
    useEffect(() => {
        if (!sessionClearedForLogin) return;
        if (user && !isAuthLoading && isFirebaseAuthReady) {
            performRedirect(user.role);
        }
    }, [user, isAuthLoading, isFirebaseAuthReady, performRedirect, sessionClearedForLogin]);



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
            const emailNorm = loginForm.email.trim().toLowerCase();
            const result = await login(emailNorm, loginForm.password);

            // ── Unverified account: redirect to OTP verification page ──
            if (result.requiresOtp || result.data?.requiresOtp) {
                const emailToVerify = result.data?.email || emailNorm;
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
                setLoginMaskedEmail(result.maskedEmail ?? emailNorm);
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
            if (rememberMe) localStorage.setItem("remembered_email", emailNorm);
            else localStorage.removeItem("remembered_email");
            toast.success("Welcome back.");
            performRedirect(getSafeUserRole(result.role || user?.role || "customer"));
        } catch {
            toast.error("Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    /* ── Register submit ── */
    const handleRegisterSubmit = async () => {
        const { firstName, lastName, email, password, confirmPassword } = registerForm;
        const emailNorm = email.trim().toLowerCase();
        const dial =
            REGISTER_COUNTRY_DIALS.find((c) => c.iso === registerPhoneCountryIso)?.dial ?? "63";

        if (!firstName || !lastName || !emailNorm || !password || !confirmPassword) {
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
        const pwErr = registerPasswordPolicyError(password);
        if (pwErr) {
            toast.error(pwErr);
            return;
        }
        if (!registerLegalAcknowledged) {
            toast.error(
                "Both checkboxes are required: accept the Paint Protection Film terms in the popup, and confirm the website Terms of Service."
            );
            return;
        }

        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        const phoneE164 = buildRegisterE164(dial, registerPhoneNational);

        setRegisterLoading(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fullName, email: emailNorm, password, phone: phoneE164 }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.message || "Registration failed.");
                return;
            }
            toast.success("Account created! Please check your email for a verification code.");
            navigate(`/verify-otp?email=${encodeURIComponent(emailNorm)}`);
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

            // OTP verified — drop any other Firebase account (e.g. admin) before applying QC JWT.
            await signOut(auth).catch(() => {});

            const backendUser = json.data?.user;
            const backendToken = json.data?.token;

            if (backendToken) {
                localStorage.setItem("autospf_token", backendToken);
            }
            if (backendUser) {
                const normalizedRole = getSafeUserRole(backendUser.role);
                const normalizedBackendUser = { ...backendUser, role: normalizedRole };
                // Keep in localStorage so onAuthStateChanged's backend-only session guard
                // can restore it if it fires before React state propagates.
                localStorage.setItem("autospf_backend_user", JSON.stringify(normalizedBackendUser));

                // ── Critical: set AuthContext user state NOW ──
                // Without this, ProtectedRoute sees null user and bounces to /login
                // before onAuthStateChanged has a chance to restore the session.
                setAuthUser({
                    id: normalizedBackendUser._id || normalizedBackendUser.id || "",
                    _id: normalizedBackendUser._id || normalizedBackendUser.id || "",
                    email: normalizedBackendUser.email || "",
                    name: normalizedBackendUser.name || "",
                    role: normalizedRole,
                    createdAt: normalizedBackendUser.createdAt || new Date().toISOString(),
                    password: "",
                    isActive: normalizedBackendUser.isActive ?? true,
                    lastActive: normalizedBackendUser.lastActive || new Date().toISOString(),
                    avatar: normalizedBackendUser.avatar || undefined,
                    phone: normalizedBackendUser.phone || undefined,
                });
            }

            const role = getSafeUserRole(backendUser?.role);
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

    const openRegistrationChat = () => {
        window.dispatchEvent(new CustomEvent("autospf:open-chat-registration"));
        toast.success("AutoSPF+ concierge is ready", {
            description: "Tell the chatbot the four details it asks for. Your password will be created from the secure email link.",
        });
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
                <div className="absolute top-1/4 -left-32 w-80 h-80 rounded-full border border-orange-500/10 animate-spin-slow" />
                <div
                    className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full border border-orange-500/10"
                    style={{ animation: "spin-slow 20s linear infinite reverse" }}
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12)_0%,transparent_70%)] opacity-40" />
            </div>

            {/* ── Main Content — equal top/bottom padding so logo + card sit visually centered under the fixed navbar ── */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-24 sm:pt-28 sm:pb-28 md:pt-32 md:pb-32">
                <div className="w-full max-w-md animate-scale-in">
                    {/* Logo */}
                    <div className="text-center mb-10">
                        <Link to="/" className="inline-flex items-center justify-center group mb-5">
                            <img
                                src="/images/autospf-logo.png"
                                alt="AutoSPF+ Logo"
                                className="h-28 w-auto max-w-[min(100%,280px)] object-contain sm:h-32 md:h-36 md:max-w-[min(100%,340px)] group-hover:scale-[1.03] transition-transform duration-200"
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
                    <div className="glass rounded-3xl p-8 border border-orange-500/15">

                        {/* ── Tab switcher ── */}
                        {loginOtpStep === "form" && (
                            <div className="flex rounded-2xl bg-muted/30 p-1 mb-6 gap-1">
                                <button
                                    id="tab-login"
                                    onClick={() => setTab("login")}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-semibold rounded-xl transition-all",
                                        tab === "login"
                                            ? "bg-orange-600 text-white shadow-md shadow-orange-600/25"
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
                                            ? "bg-orange-600 text-white shadow-md shadow-orange-600/25"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Register
                                </button>
                            </div>
                        )}

                        {/* ══ Form content ══ */}

                        {/* ══════════ MANUAL REGISTER FORM ══════════ */}
                        {loginOtpStep === "form" && tab === "register" && registerView === "manual" && (
                            <ManualRegisterForm
                                onBack={() => setRegisterView("ai")}
                                onSignIn={() => setTab("login")}
                            />
                        )}

                        {/* ══════════ AI REGISTER ENTRY ══════════ */}
                        {loginOtpStep === "form" && tab === "register" && registerView === "ai" && (
                            <div className="space-y-5 animate-slide-up">
                                <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-black/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_80px_-36px_rgba(249,115,22,0.45)]">
                                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                                    <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-orange-500/15 blur-3xl" />
                                    <div className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

                                    <div className="relative flex items-start gap-4">
                                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/30 ring-1 ring-orange-400/25">
                                            <Bot className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400">
                                                AI-assisted onboarding
                                            </p>
                                            <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                                                Create your AutoSPF+ account with the concierge
                                            </h2>
                                            <p className="mt-2 text-sm leading-relaxed text-white/55">
                                                The chatbot will ask only for your first name, last name, email address, and mobile number. Your password is created later from a secure email link.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="relative mt-5 grid grid-cols-2 gap-2">
                                        {[
                                            "Conversational setup",
                                            "Secure email link",
                                            "No AI passwords",
                                            "Customer dashboard access",
                                        ].map((item) => (
                                            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] font-semibold text-white/60">
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button
                                    id="open-ai-register"
                                    onClick={openRegistrationChat}
                                    className="h-12 w-full rounded-2xl bg-orange-600 text-sm font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-500"
                                >
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    Start with AI Concierge
                                </Button>

                                <button
                                    type="button"
                                    id="continue-manual-register"
                                    onClick={() => setRegisterView("manual")}
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/70 backdrop-blur-md transition-all duration-300 hover:border-orange-400/35 hover:bg-white/[0.07] hover:text-white"
                                >
                                    Continue manually
                                </button>

                                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                                    Already received a setup email? Open the link in your inbox to create your password.
                                </p>
                            </div>
                        )}

                        {/* ══════════ REGISTER FORM ══════════ */}
                        {false && loginOtpStep === "form" && tab === "register" && (
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
                                    {registerForm.password.length > 0 ? (
                                        <div className="relative mt-3 overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-slate-950/[0.96] via-slate-900/95 to-slate-950/[0.94] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_48px_-20px_rgba(0,0,0,0.55)] backdrop-blur-md">
                                            <div
                                                className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full opacity-25 blur-2xl"
                                                style={{ background: "radial-gradient(circle at center, rgba(249,115,22,0.45), transparent 65%)" }}
                                            />
                                            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
                                            <div className="relative space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-orange-500/35 bg-orange-500/15">
                                                        <ShieldCheck className="h-3.5 w-3.5 text-orange-400" aria-hidden />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-200/85">
                                                            Secure password
                                                        </p>
                                                        {registerPwStrength ? (
                                                            <div className="mt-1 flex items-center justify-between gap-2">
                                                                <span className="text-[11px] font-medium text-white/50">Strength</span>
                                                                <span
                                                                    className={cn(
                                                                        "text-[11px] font-semibold tracking-tight",
                                                                        registerPwStrength.textClass
                                                                    )}
                                                                >
                                                                    {registerPwStrength.text}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {registerPwStrength ? (
                                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08] ring-1 ring-orange-500/15">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out",
                                                                registerPwStrength.barClass,
                                                                registerPwStrength.text === "Weak" && "w-[22%]",
                                                                registerPwStrength.text === "Medium" && "w-[58%]",
                                                                registerPwStrength.text === "Strong" && "w-[88%]",
                                                                registerPwStrength.text === "Very strong" && "w-full"
                                                            )}
                                                            style={{
                                                                boxShadow:
                                                                    registerPwStrength.text === "Weak"
                                                                        ? "0 0 10px rgba(148,163,184,0.25)"
                                                                        : "0 0 14px rgba(249,115,22,0.35)",
                                                            }}
                                                        />
                                                    </div>
                                                ) : null}
                                                <ul className="space-y-1.5 border-t border-white/[0.08] pt-2.5" aria-label="Password requirements">
                                                    {(
                                                        [
                                                            [registerPwRules.length, "8+ characters"] as const,
                                                            [registerPwRules.upper, "Uppercase letter (A–Z)"] as const,
                                                            [registerPwRules.lower, "Lowercase letter (a–z)"] as const,
                                                            [registerPwRules.number, "Number (0–9)"] as const,
                                                            [
                                                                registerPwRules.special,
                                                                "Special character (!@#$…)",
                                                            ] as const,
                                                        ] as const
                                                    ).map(([met, label]) => (
                                                        <li
                                                            key={label}
                                                            className={cn(
                                                                "flex items-center gap-2.5 rounded-lg px-2 py-1 text-[11px] font-medium leading-snug transition-colors",
                                                                met
                                                                    ? "bg-orange-500/15 text-orange-100/95 ring-1 ring-orange-500/20"
                                                                    : "text-white/45"
                                                            )}
                                                        >
                                                            {met ? (
                                                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden />
                                                            ) : (
                                                                <XCircle className="h-3.5 w-3.5 shrink-0 text-orange-300/50" aria-hidden />
                                                            )}
                                                            <span>{label}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    ) : null}
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
                                    className="w-full bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 font-semibold mt-2 group"
                                    disabled={
                                        !registerForm.firstName ||
                                        !registerForm.lastName ||
                                        !registerPhoneNational.replace(/\D/g, "").length ||
                                        !registerForm.email ||
                                        !registerForm.password ||
                                        !registerForm.confirmPassword ||
                                        !registerPwAllValid ||
                                        !registerLegalAcknowledged ||
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

                                <div className="flex items-start gap-2.5">
                                    <Checkbox
                                        id="reg-ppf-terms"
                                        checked={ppfTermsAgreed}
                                        aria-required
                                        onCheckedChange={(c) => {
                                            if (c === true) {
                                                setPpfTermsModalScrolledToEnd(false);
                                                setPpfTermsModalBodyKey((k) => k + 1);
                                                setPpfTermsModalOpen(true);
                                            } else {
                                                setPpfTermsAgreed(false);
                                            }
                                        }}
                                        className={cn(
                                            "h-[18px] w-[18px] shrink-0 rounded-[5px] border shadow-none ring-offset-0 mt-0.5",
                                            "border-amber-400/55 bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
                                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(249,115,22,0.18),0_2px_12px_-4px_rgba(249,115,22,0.22)]",
                                            "data-[state=checked]:border-amber-300 data-[state=checked]:from-orange-500 data-[state=checked]:to-orange-600 data-[state=checked]:bg-gradient-to-b",
                                            "data-[state=checked]:text-white data-[state=checked]:shadow-[0_0_20px_-4px_rgba(249,115,22,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-0",
                                            "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[3]"
                                        )}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <Label
                                            htmlFor="reg-ppf-terms"
                                            className="text-xs text-muted-foreground font-normal leading-relaxed cursor-pointer text-left block"
                                        >
                                            I acknowledge the{" "}
                                            <span className="text-primary font-medium">
                                                Paint Protection Film General Terms and Conditions
                                            </span>
                                            . Select this to read and accept in the popup, then use{" "}
                                            <span className="text-primary/90 font-medium">Create Account</span> above.
                                        </Label>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <Checkbox
                                        id="reg-website-tos"
                                        checked={registerWebsiteTermsAgreed}
                                        aria-required
                                        onCheckedChange={(c) => setRegisterWebsiteTermsAgreed(c === true)}
                                        className={cn(
                                            "h-[18px] w-[18px] shrink-0 rounded-[5px] border shadow-none ring-offset-0 mt-0.5",
                                            "border-amber-400/55 bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
                                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(249,115,22,0.18),0_2px_12px_-4px_rgba(249,115,22,0.22)]",
                                            "data-[state=checked]:border-amber-300 data-[state=checked]:from-orange-500 data-[state=checked]:to-orange-600 data-[state=checked]:bg-gradient-to-b",
                                            "data-[state=checked]:text-white data-[state=checked]:shadow-[0_0_20px_-4px_rgba(249,115,22,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-0",
                                            "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[3]"
                                        )}
                                    />
                                    <Label
                                        htmlFor="reg-website-tos"
                                        className="text-xs text-muted-foreground font-normal leading-relaxed cursor-pointer text-left block min-w-0 flex-1"
                                    >
                                        By registering, you confirm the PPF terms (via the popup) and our website{" "}
                                        <span className="text-primary font-medium hover:underline">Terms of Service</span>
                                        .
                                    </Label>
                                </div>
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
                                            rememberMe ? "bg-orange-600 border-orange-600" : "border-border group-hover:border-orange-400/50"
                                        )}
                                    >
                                        {rememberMe && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">Remember me</span>
                                </label>

                                {/* Submit */}
                                <Button
                                    onClick={handleLoginSubmit}
                                    className="w-full bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 font-semibold mt-2 group"
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
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 border border-orange-500/20 mb-1">
                                        <ShieldCheck className="w-7 h-7 text-orange-500" />
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
                                                digit ? "border-orange-500/50 bg-orange-500/5" : "border-border",
                                                "focus:border-orange-500 shadow-inner"
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
                                    className="w-full bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 font-semibold group"
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

            {/* ═══════════════ PPF Terms (register) — opens from checkbox ═══════════════ */}
            <Dialog open={ppfTermsModalOpen} onOpenChange={setPpfTermsModalOpen}>
                <DialogContent
                    className={cn(
                        "max-h-[min(92vh,880px)] w-[min(680px,calc(100vw-1rem))] max-w-[min(680px,calc(100vw-1rem))]",
                        "gap-0 overflow-hidden border-orange-400/25 bg-stone-50 p-0 shadow-2xl shadow-black/40 sm:max-w-[min(680px,calc(100vw-1rem))]",
                        "[&>button]:right-4 [&>button]:top-4 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-1.5 [&>button]:text-white/75 [&>button]:opacity-100 [&>button]:ring-offset-transparent hover:[&>button]:bg-white/15 hover:[&>button]:text-white"
                    )}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <DialogHeader className="space-y-0 p-0 text-left">
                        <div className="relative overflow-hidden border-b border-orange-500/25 bg-[radial-gradient(circle_at_15%_0%,rgba(251,146,60,0.25),transparent_32%),linear-gradient(135deg,#09090b_0%,#1c1917_54%,#431407_100%)] px-5 py-5 pr-14 text-white sm:px-6">
                            <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full border border-orange-300/20" />
                            <div className="pointer-events-none absolute bottom-0 right-16 h-px w-32 bg-gradient-to-r from-transparent via-orange-300/45 to-transparent" />
                            <div className="flex items-start gap-3.5">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-300/30 bg-orange-400/15 shadow-[0_0_35px_-10px_rgba(251,146,60,0.95)]">
                                    <ShieldCheck className="h-6 w-6 text-orange-200" aria-hidden />
                                </div>
                                <div className="min-w-0">
                                    <p className="mb-1.5 inline-flex rounded-full border border-orange-300/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-100">
                                        Client service brief
                                    </p>
                                    <DialogTitle className="text-left text-xl font-semibold leading-tight text-white sm:text-2xl">
                                        Paint Protection Film Terms & Acknowledgement
                                    </DialogTitle>
                                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100/90">
                                        AUTOSPF+ SUN PROTECTION FILM
                                    </p>
                                    <p className="mt-1 text-xs leading-snug text-zinc-300">
                                        {PPF_TERMS_BUSINESS.name}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>
                    <DialogDescription className="sr-only">
                        Review the Paint Protection Film terms. Scroll to the bottom of the document, then accept to
                        continue registration.
                    </DialogDescription>
                    <div
                        key={ppfTermsModalBodyKey}
                        ref={ppfTermsModalScrollRef}
                        onScroll={checkPpfModalTermsScrollEnd}
                        className="max-h-[min(58vh,540px)] overflow-y-auto bg-[linear-gradient(180deg,#fbf7ef_0%,#fffaf2_38%,#f8fafc_100%)] px-4 py-4 text-left text-[12px] leading-relaxed text-zinc-800 sm:px-5 sm:py-5"
                        role="document"
                        tabIndex={0}
                    >
                        <div className="mb-4 rounded-2xl border border-amber-900/10 bg-white/90 p-3.5 shadow-sm shadow-amber-950/5 sm:p-4">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-900/10 pb-3 text-[11px] font-medium text-zinc-600">
                                <span>{PPF_TERMS_BUSINESS.address}</span>
                                <span className="hidden h-1 w-1 rounded-full bg-orange-400 sm:inline-block" aria-hidden />
                                <span>{PPF_TERMS_BUSINESS.phone}</span>
                            </p>
                            <p className="pt-3 text-sm leading-relaxed text-zinc-800">{PPF_TERMS_INTRO}</p>
                        </div>

                        <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
                            {PPF_TERMS_HIGHLIGHTS.map((item, i) => {
                                const HighlightIcon = PPF_TERMS_HIGHLIGHT_ICONS[i % PPF_TERMS_HIGHLIGHT_ICONS.length];
                                return (
                                    <div
                                        key={item.label}
                                        className="rounded-2xl border border-orange-900/10 bg-white p-3 shadow-sm shadow-orange-950/5"
                                    >
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                                                <HighlightIcon className="h-4 w-4" aria-hidden />
                                            </span>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                                                    {item.label}
                                                </p>
                                                <p className="text-sm font-bold text-zinc-950">{item.value}</p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] leading-relaxed text-zinc-600">{item.detail}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {PPF_TERMS_SECTIONS.map((sec, i) => (
                            <section
                                key={sec.title}
                                className={cn(
                                    "relative mb-3.5 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-950/5",
                                    i === PPF_TERMS_SECTIONS.length - 1 && "mb-0 border-orange-300/60 bg-orange-50/80"
                                )}
                            >
                                <div className="absolute right-3 top-3 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-black tracking-wider text-zinc-400">
                                    {String(i + 1).padStart(2, "0")}
                                </div>
                                <div className="pr-12">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                                        PPF client note
                                    </p>
                                    <h3 className="mt-1 text-sm font-bold text-zinc-950">{sec.title}</h3>
                                    <p className="mt-1 text-[12px] font-semibold leading-relaxed text-zinc-700">
                                        {sec.summary}
                                    </p>
                                </div>
                                <p className="mt-3 text-[12px] leading-relaxed text-zinc-700">{sec.body}</p>
                                <ul className="mt-3 space-y-2">
                                    {sec.bullets.map((bullet) => (
                                        <li key={bullet} className="flex gap-2 text-[12px] leading-relaxed text-zinc-600">
                                            <CheckCircle2
                                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600"
                                                aria-hidden
                                            />
                                            <span>{bullet}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                        <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 text-[12px] font-medium leading-relaxed text-zinc-100 shadow-sm">
                            {PPF_TERMS_ACCEPTANCE_NOTE}
                        </p>
                    </div>
                    <div
                        className={cn(
                            "flex items-center gap-2 border-t px-4 py-2.5 text-[11px] font-medium sm:px-5",
                            ppfTermsModalScrolledToEnd
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-900"
                        )}
                    >
                        {ppfTermsModalScrolledToEnd ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span>
                            {ppfTermsModalScrolledToEnd
                                ? "You reached the acknowledgement. You may now accept."
                                : "Please scroll through the complete service brief to unlock acceptance."}
                        </span>
                    </div>
                    <DialogFooter className="flex-col-reverse items-stretch justify-between gap-2 border-t border-zinc-200 bg-white p-3 sm:flex-row sm:justify-between sm:space-x-0 sm:p-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-zinc-300 bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white sm:min-w-[116px]"
                            onClick={() => setPpfTermsModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={!ppfTermsModalScrolledToEnd}
                            className="bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-zinc-950 shadow-lg shadow-orange-600/20 hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[260px]"
                            onClick={() => {
                                if (!ppfTermsModalScrolledToEnd) return;
                                setPpfTermsAgreed(true);
                                setPpfTermsModalOpen(false);
                            }}
                        >
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            I have read and accept
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ═══════════════ Forgot Password Modal ═══════════════ */}
            <Dialog open={showForgotModal} onOpenChange={setShowForgotModal}>
                <DialogContent className="glass border-orange-500/15 sm:max-w-md">
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
                            className="w-full bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 font-semibold"
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
