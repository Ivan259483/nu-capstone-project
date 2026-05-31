import { useState, useEffect, useCallback, useRef, useMemo, type KeyboardEvent, type ClipboardEvent } from "react";
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
    UserPlus,
    CheckCircle2,
    XCircle,
} from "lucide-react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { NAV_ACTIVE_PILL_TRANSITION } from "@/components/ui/floating-navbar";
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
import {
    registerPasswordPolicyError,
    registerPasswordRules,
    registerPasswordStrength,
} from "@/lib/register-validation";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import { LoginAuthFormSwitcher } from "@/components/auth/LoginAuthFormSwitcher";
import { ManualRegisterForm } from "@/components/auth/ManualRegisterForm";
import {
    PpfTermsAcceptanceDialog,
    RegisterLegalCheckboxes,
    useRegisterLegalAcknowledgement,
} from "@/components/auth/RegisterLegalAcknowledgement";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
const DEFAULT_LOGIN_REDIRECT = "/customer/dashboard";

const LOGIN_TAB_CONTENT_TRANSITION = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1] as const,
};

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

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function Login() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, isLoading: isAuthLoading, isFirebaseAuthReady, setAuthUser, prepareForLogin } = useAuth();
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

    /* ── Forgot password (backend OTP via Resend — same as mobile) ── */
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<"email" | "otp" | "password">("email");
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotOtpDigits, setForgotOtpDigits] = useState(["", "", "", "", "", ""]);
    const [forgotOtpError, setForgotOtpError] = useState("");
    const [forgotOtpShake, setForgotOtpShake] = useState(false);
    const [forgotNewPassword, setForgotNewPassword] = useState("");
    const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
    const [forgotShowPassword, setForgotShowPassword] = useState(false);
    const forgotOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const resetForgotModal = useCallback(() => {
        setForgotStep("email");
        setForgotEmail("");
        setForgotOtpDigits(["", "", "", "", "", ""]);
        setForgotOtpError("");
        setForgotNewPassword("");
        setForgotConfirmPassword("");
        setForgotShowPassword(false);
    }, []);

    /* ── Tab ── */
    const [tab, setTab] = useState<"login" | "register">("login");

    /* ── Register form (legacy inline — disabled; ManualRegisterForm is used) ── */
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

    const legal = useRegisterLegalAcknowledgement();
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
        () => registerPasswordStrength(registerForm.password, registerPwRules, t),
        [registerForm.password, registerPwRules, t]
    );

    useEffect(() => {
        if (registerForm.password.length === 0) setShowRegisterPassword(false);
    }, [registerForm.password.length]);

    useEffect(() => {
        if (tab === "register" && prevTabRef.current !== "register") {
            legal.resetLegalAcknowledgement();
        }
        prevTabRef.current = tab;
    }, [tab, legal.resetLegalAcknowledgement]);

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
            toast.error(t("validation.fillAllFields"));
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
                toast.info(t("auth.verifyEmailContinue"));
                return;
            }

            // ── Staff first login: force password change ──
            if (result.requiresPasswordChange || result.data?.requiresPasswordChange) {
                const tempToken = result.data?.token || result.token;
                if (tempToken) localStorage.setItem("autospf_set_password_token", tempToken);
                navigate("/set-password");
                toast.info(t("auth.setPasswordContinue"));
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
                toast.success(t("auth.codeSent"));
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
                    toast.error(result.message || t("auth.accountLocked"));
                } else if (result.data?.remainingAttempts !== undefined) {
                    setLoginAttempts(result.data.loginAttempts ?? loginAttempts + 1);
                    setRemainingAttempts(result.data.remainingAttempts);
                    toast.error(result.message || t("auth.invalidCredentials"));
                } else {
                    toast.error(result.message || t("auth.invalidCredentials"));
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
            toast.success(t("auth.welcomeBack"));
            performRedirect(getSafeUserRole(result.role || user?.role || "customer"));
        } catch {
            toast.error(t("auth.loginFailed"));
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
            toast.error(t("validation.fillRequired"));
            return;
        }
        if (password !== confirmPassword) {
            toast.error(t("validation.passwordMismatch"));
            return;
        }
        if (!registerPhoneNational.replace(/\D/g, "").length) {
            setRegisterPhoneError(t("validation.phoneRequired"));
            toast.error(t("validation.phoneRequired"));
            return;
        }
        const phoneCheck = validateRegisterNationalDigits(dial, registerPhoneNational);
        if (!phoneCheck.ok) {
            const phoneMsg =
                phoneCheck.code === "ph_mobile" ? t("validation.phPhone") : t("validation.phoneLength");
            setRegisterPhoneError(phoneMsg);
            toast.error(phoneMsg);
            return;
        }
        setRegisterPhoneError("");
        const pwErr = registerPasswordPolicyError(password, t);
        if (pwErr) {
            toast.error(pwErr);
            return;
        }
        if (!legal.legalAcknowledged) {
            toast.error(t("register.legalRequiredToast"));
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
                toast.error(data.message || t("auth.registrationFailed"));
                return;
            }
            toast.success(t("auth.checkEmailCode"));
            navigate(`/verify-otp?email=${encodeURIComponent(emailNorm)}&from=register`);
        } catch {
            toast.error(t("auth.registrationFailed"));
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
            setLoginOtpError(t("validation.otpIncomplete"));
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
                    setLoginOtpError(json.message || t("auth.tooManyAttempts"));
                } else {
                    setLoginOtpError(json.message || t("auth.invalidCode"));
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
            toast.success(t("auth.verifySuccess"));
            setLoginOtpStep("form");
            setPendingUserId("");
            setLoginMaskedEmail("");
            performRedirect(role);
        } catch {
            setLoginOtpError(t("auth.verifyFailed"));
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
                toast.success(t("auth.codeSent"));
                setLoginOtpDigits(["", "", "", "", "", ""]);
                setLoginOtpExpiry(300);
                setLoginOtpResend(60);
                setLoginOtpError("");
                setTimeout(() => loginOtpInputRefs.current[0]?.focus(), 50);
            } else {
                toast.error(json.message || t("auth.resendFailed"));
            }
        } catch {
            toast.error(t("auth.resendFailed"));
        } finally {
            setLoginOtpResending(false);
        }
    };



    /* ── Forgot password: send OTP (Resend) ── */
    const handleForgotSendOtp = async () => {
        const emailNorm = forgotEmail.trim().toLowerCase();
        if (!emailNorm) {
            toast.error(t("validation.enterEmail"));
            return;
        }
        setForgotLoading(true);
        setForgotOtpError("");
        try {
            const resp = await fetch(`${getBaseApiUrl()}/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailNorm }),
                signal: AbortSignal.timeout(15000),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                toast.error(json.message || t("auth.resetSendFailed"));
                return;
            }
            setForgotEmail(emailNorm);
            setForgotStep("otp");
            setForgotOtpDigits(["", "", "", "", "", ""]);
            toast.success(t("auth.resetSent"));
            setTimeout(() => forgotOtpInputRefs.current[0]?.focus(), 120);
        } catch {
            toast.error(t("auth.resetSendFailed"));
        } finally {
            setForgotLoading(false);
        }
    };

    const handleForgotOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const updated = [...forgotOtpDigits];
        updated[index] = value.slice(-1);
        setForgotOtpDigits(updated);
        setForgotOtpError("");
        if (value && index < 5) forgotOtpInputRefs.current[index + 1]?.focus();
    };

    const handleForgotOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !forgotOtpDigits[index] && index > 0) {
            forgotOtpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleForgotOtpPaste = (e: ClipboardEvent) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (!pasted) return;
        e.preventDefault();
        const updated = ["", "", "", "", "", ""];
        for (let i = 0; i < pasted.length; i++) updated[i] = pasted[i];
        setForgotOtpDigits(updated);
        forgotOtpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
    };

    /* ── Forgot password: verify OTP ── */
    const handleForgotVerifyOtp = async () => {
        const code = forgotOtpDigits.join("");
        if (code.length !== 6) {
            setForgotOtpError(t("validation.otpIncomplete"));
            return;
        }
        setForgotLoading(true);
        setForgotOtpError("");
        try {
            const resp = await fetch(`${getBaseApiUrl()}/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: forgotEmail, otp: code }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                setForgotOtpShake(true);
                setTimeout(() => setForgotOtpShake(false), 600);
                setForgotOtpDigits(["", "", "", "", "", ""]);
                setForgotOtpError(json.message || t("auth.invalidCode"));
                setTimeout(() => forgotOtpInputRefs.current[0]?.focus(), 50);
                return;
            }
            setForgotStep("password");
        } catch {
            setForgotOtpError(t("auth.verifyFailed"));
        } finally {
            setForgotLoading(false);
        }
    };

    /* ── Forgot password: set new password ── */
    const handleForgotResetPassword = async () => {
        const policyError = registerPasswordPolicyError(forgotNewPassword, t);
        if (policyError) {
            toast.error(policyError);
            return;
        }
        if (forgotNewPassword !== forgotConfirmPassword) {
            toast.error(t("validation.passwordMismatch"));
            return;
        }
        setForgotLoading(true);
        try {
            const resp = await fetch(`${getBaseApiUrl()}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: forgotEmail,
                    otp: forgotOtpDigits.join(""),
                    newPassword: forgotNewPassword,
                }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                toast.error(json.message || t("auth.resetFailed"));
                return;
            }
            toast.success(t("auth.passwordUpdated"));
            setShowForgotModal(false);
            resetForgotModal();
        } catch {
            toast.error(t("auth.resetFailed"));
        } finally {
            setForgotLoading(false);
        }
    };

    /* ═══════════════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════════════ */
    return (
        <div className="flex min-h-screen flex-col overflow-y-auto bg-background">
            {/* ── Ambient Background ── */}
            <div className="absolute inset-0 bg-hero-pattern pointer-events-none" />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12)_0%,transparent_70%)] opacity-40" />
            </div>

            <div
                className={cn(
                    "relative z-10 flex w-full flex-1 flex-col items-center px-6 py-10 sm:py-12",
                    tab === "register" ? "justify-start" : "justify-center"
                )}
            >
                <div className="w-full max-w-md animate-scale-in pb-8">
                    {/* Logo */}
                    <div className="text-center mb-10">
                        <Link to="/" className="inline-flex items-center justify-center group mb-5">
                            <img
                                src="/images/autospf-logo.png"
                                alt="AutoSPF+ Logo"
                                className="h-28 w-auto max-w-[min(100%,280px)] object-contain sm:h-32 md:h-36 md:max-w-[min(100%,340px)] group-hover:scale-[1.03] transition-transform duration-200"
                            />
                        </Link>
                        <AnimatePresence initial={false} mode="sync">
                            <motion.h1
                                key={tab === "register" ? "register-title" : "login-title"}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={LOGIN_TAB_CONTENT_TRANSITION}
                                className="text-2xl font-bold text-foreground mt-2"
                            >
                                {tab === "register" ? t("login.registerTitle") : t("login.title")}
                            </motion.h1>
                        </AnimatePresence>
                        <AnimatePresence initial={false} mode="sync">
                            <motion.p
                                key={tab === "register" ? "register-sub" : "login-sub"}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ ...LOGIN_TAB_CONTENT_TRANSITION, duration: 0.4 }}
                                className="text-sm text-muted-foreground mt-1"
                            >
                                {tab === "register" ? t("login.registerSubtitle") : t("login.subtitle")}
                            </motion.p>
                        </AnimatePresence>
                    </div>

                    {/* ── Glass Card ── */}
                    <div className="glass rounded-3xl border border-orange-500/15 p-8">
                        {/* ── Tab switcher ── */}
                        {loginOtpStep === "form" && (
                            <LayoutGroup id="login-auth-tabs">
                                <div className="relative mb-6 flex gap-1 rounded-2xl bg-muted/30 p-1">
                                    <button
                                        id="tab-login"
                                        type="button"
                                        onClick={() => setTab("login")}
                                        className={cn(
                                            "relative z-[1] flex-1 rounded-xl py-2 text-sm font-semibold transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                            tab === "login"
                                                ? "text-white"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {tab === "login" && (
                                            <motion.span
                                                layoutId="login-auth-tab-pill"
                                                className="absolute inset-0 rounded-xl bg-orange-600 shadow-md shadow-orange-600/25"
                                                transition={NAV_ACTIVE_PILL_TRANSITION}
                                                aria-hidden
                                            />
                                        )}
                                        <span className="relative z-[2]">{t("login.tabLogin")}</span>
                                    </button>
                                    <button
                                        id="tab-register"
                                        type="button"
                                        onClick={() => setTab("register")}
                                        className={cn(
                                            "relative z-[1] flex-1 rounded-xl py-2 text-sm font-semibold transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                            tab === "register"
                                                ? "text-white"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {tab === "register" && (
                                            <motion.span
                                                layoutId="login-auth-tab-pill"
                                                className="absolute inset-0 rounded-xl bg-orange-600 shadow-md shadow-orange-600/25"
                                                transition={NAV_ACTIVE_PILL_TRANSITION}
                                                aria-hidden
                                            />
                                        )}
                                        <span className="relative z-[2]">{t("login.tabRegister")}</span>
                                    </button>
                                </div>
                            </LayoutGroup>
                        )}

                        {/* ══ Form content — crossfade + animated height ══ */}
                        <LoginAuthFormSwitcher
                            activeTab={tab}
                            visible={loginOtpStep === "form"}
                            registerPanel={
                                <ManualRegisterForm
                                    onSignIn={() => setTab("login")}
                                    onRegistrationComplete={(role) => performRedirect(role)}
                                />
                            }
                            loginPanel={
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
                                                {loginAttempts === 1
                                                    ? t("login.failedAttemptOne")
                                                    : t("login.failedAttemptMany").replace("{n}", String(loginAttempts))}
                                            </p>
                                            <p className="text-amber-400/80 mt-0.5">
                                                {remainingAttempts === 1
                                                    ? t("login.remainingAttemptOne")
                                                    : t("login.remainingAttemptMany").replace("{n}", String(remainingAttempts ?? 0))}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* ── Account locked countdown banner ── */}
                                {isLocked && (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-xs animate-slide-up">
                                        <LockKeyhole className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-red-300">{t("login.accountLockedTitle")}</p>
                                            <p className="text-red-400/80 mt-0.5">
                                                {t("login.accountLockedTryAgain")}{" "}
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
                                    <span className="text-xs text-muted-foreground">{t("login.rememberMe")}</span>
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
                                    {isLoading ? t("login.signingIn") : t("login.signIn")}
                                </Button>
                                </div>
                            }
                        />

                        {/* ══════════ LOGIN 2FA OTP SCREEN ══════════ */}
                        {loginOtpStep === "otp" && (
                            <div className="space-y-5 animate-slide-up">
                                {/* Header */}
                                <div className="text-center space-y-2">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 border border-orange-500/20 mb-1">
                                        <ShieldCheck className="w-7 h-7 text-orange-500" />
                                    </div>
                                    <h2 className="text-lg font-bold text-foreground">{t("login.otpTitle")}</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {t("login.otpSent")}{" "}
                                        <span className="font-semibold text-foreground">{loginMaskedEmail}</span>
                                    </p>
                                </div>

                                {/* Expiry timer */}
                                {loginOtpExpiry > 0 && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{t("login.otpExpires")}{" "}
                                            <span className={cn("font-mono font-semibold", loginOtpExpiry <= 60 ? "text-red-400" : "text-foreground")}>
                                                {String(Math.floor(loginOtpExpiry / 60)).padStart(2, "0")}:{String(loginOtpExpiry % 60).padStart(2, "0")}
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {loginOtpExpiry === 0 && (
                                    <p className="text-center text-xs text-red-400">{t("login.otpExpired")}</p>
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
                                    {loginOtpVerifying ? t("login.otpVerifying") : t("login.otpVerify")}
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
                                        {t("login.otpBack")}
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
                                        {loginOtpResend > 0
                                            ? t("login.otpResendCountdown").replace("{n}", String(loginOtpResend))
                                            : t("login.otpResend")}
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

            <PpfTermsAcceptanceDialog
                open={legal.ppfTermsModalOpen}
                onOpenChange={legal.setPpfTermsModalOpen}
                modalBodyKey={legal.ppfTermsModalBodyKey}
                scrolledToEnd={legal.ppfTermsModalScrolledToEnd}
                scrollRef={legal.ppfTermsModalScrollRef}
                onScroll={legal.checkPpfModalTermsScrollEnd}
                onAccept={() => legal.setPpfTermsAgreed(true)}
            />

            {/* ═══════════════ Forgot Password Modal (backend OTP) ═══════════════ */}
            <Dialog
                open={showForgotModal}
                onOpenChange={(open) => {
                    setShowForgotModal(open);
                    if (!open) resetForgotModal();
                }}
            >
                <DialogContent className="glass border-orange-500/15 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">{t("login.forgotTitle")}</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {forgotStep === "email" && t("login.forgotEmailStep")}
                            {forgotStep === "otp" &&
                                t("login.forgotOtpStep").replace("{email}", forgotEmail)}
                            {forgotStep === "password" && t("login.forgotPasswordStep")}
                        </DialogDescription>
                    </DialogHeader>

                    {forgotStep === "email" && (
                        <div className="space-y-4 mt-2">
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="email"
                                    value={forgotEmail}
                                    onChange={(e) => setForgotEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="pl-9 bg-muted/40 border-border focus:border-primary"
                                    onKeyDown={(e) => e.key === "Enter" && handleForgotSendOtp()}
                                />
                            </div>
                            <Button
                                onClick={handleForgotSendOtp}
                                className="w-full bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 font-semibold"
                                disabled={!forgotEmail.trim() || forgotLoading}
                            >
                                {forgotLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Mail className="w-4 h-4 mr-2" />
                                )}
                                {forgotLoading ? t("login.forgotSending") : t("login.forgotSend")}
                            </Button>
                        </div>
                    )}

                    {forgotStep === "otp" && (
                        <div className="space-y-4 mt-2">
                            <div
                                className={cn(
                                    "flex gap-2 justify-center",
                                    forgotOtpShake && "animate-[shake_0.4s_ease-in-out]"
                                )}
                            >
                                {forgotOtpDigits.map((digit, idx) => (
                                    <input
                                        key={idx}
                                        ref={(el) => {
                                            forgotOtpInputRefs.current[idx] = el;
                                        }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleForgotOtpChange(idx, e.target.value)}
                                        onKeyDown={(e) => handleForgotOtpKeyDown(idx, e)}
                                        onPaste={idx === 0 ? handleForgotOtpPaste : undefined}
                                        className="w-10 h-12 text-center text-lg font-semibold rounded-lg border border-border bg-muted/40 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
                                    />
                                ))}
                            </div>
                            {forgotOtpError && (
                                <p className="text-center text-xs text-red-400">{forgotOtpError}</p>
                            )}
                            <Button
                                onClick={handleForgotVerifyOtp}
                                className="w-full bg-orange-600 text-white hover:bg-orange-700 font-semibold"
                                disabled={forgotOtpDigits.join("").length !== 6 || forgotLoading}
                            >
                                {forgotLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                {forgotLoading ? t("login.otpVerifying") : t("login.forgotVerify")}
                            </Button>
                            <button
                                type="button"
                                className="w-full text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    setForgotStep("email");
                                    setForgotOtpDigits(["", "", "", "", "", ""]);
                                    setForgotOtpError("");
                                }}
                            >
                                {t("login.forgotDifferentEmail")}
                            </button>
                        </div>
                    )}

                    {forgotStep === "password" && (
                        <div className="space-y-4 mt-2">
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type={forgotShowPassword ? "text" : "password"}
                                    value={forgotNewPassword}
                                    onChange={(e) => setForgotNewPassword(e.target.value)}
                                    placeholder={t("login.forgotNewPassword")}
                                    className="pl-9 pr-9 bg-muted/40 border-border"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    onClick={() => setForgotShowPassword((v) => !v)}
                                >
                                    {forgotShowPassword ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type={forgotShowPassword ? "text" : "password"}
                                    value={forgotConfirmPassword}
                                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                                    placeholder={t("login.forgotConfirmPassword")}
                                    className="pl-9 bg-muted/40 border-border"
                                    onKeyDown={(e) => e.key === "Enter" && handleForgotResetPassword()}
                                />
                            </div>
                            <Button
                                onClick={handleForgotResetPassword}
                                className="w-full bg-orange-600 text-white hover:bg-orange-700 font-semibold"
                                disabled={!forgotNewPassword || !forgotConfirmPassword || forgotLoading}
                            >
                                {forgotLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                {forgotLoading ? t("login.forgotUpdating") : t("login.forgotUpdate")}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
