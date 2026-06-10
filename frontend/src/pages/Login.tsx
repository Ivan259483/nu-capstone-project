import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    Eye,
    EyeOff,
    Loader2,
    ArrowLeft,
    ShieldCheck,
    RefreshCw,
    AlertTriangle,
    Clock,
} from "lucide-react";

import { AnimatePresence, motion } from "motion/react";
import { toast, type ExternalToast } from "sonner";
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
import AuthSpotlight from "@/components/effects/AuthSpotlight";
const DEFAULT_LOGIN_REDIRECT = "/customer/dashboard";

const LOGIN_TAB_CONTENT_TRANSITION = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1] as const,
};

const AUTH_INPUT_CLASS =
    "h-12 rounded-[14px] border-white/[0.12] bg-white/[0.065] text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] placeholder:text-zinc-500 transition-[border-color,background-color,box-shadow] duration-300 focus-visible:border-white/30 focus-visible:bg-white/[0.085] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/[0.09]";

const AUTH_PRIMARY_BUTTON_CLASS =
    "h-[46px] w-full rounded-[14px] border border-white/[0.085] bg-zinc-950/60 text-sm font-semibold text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_18px_48px_-36px_rgba(255,255,255,0.24)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-black/75 hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_22px_58px_-38px_rgba(255,255,255,0.28)] disabled:translate-y-0 disabled:border-white/[0.045] disabled:bg-zinc-900/25 disabled:text-zinc-600 disabled:shadow-none";

const AUTH_MUTED_LINK_CLASS =
    "font-medium text-zinc-300 transition-colors hover:text-white";

const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_EMAIL_STEP_LOADER_MS = 650;
const LOGIN_INVALID_CREDENTIALS_MESSAGE =
    "Invalid credentials. Please make sure you are using the correct email and password.";
const LOGIN_INVALID_CREDENTIALS_TOAST_ID = "login-invalid-credentials";
const LOGIN_LEGACY_ATTEMPT_WARNING_TOAST_ID = "login-attempt-warning";
const LOGIN_AUTH_ERROR_TOAST_ID = "login-auth-error";
const LOGIN_AUTH_TOAST_IDS = [
    LOGIN_INVALID_CREDENTIALS_TOAST_ID,
    LOGIN_LEGACY_ATTEMPT_WARNING_TOAST_ID,
    LOGIN_AUTH_ERROR_TOAST_ID,
] as const;
const LOGIN_AUTH_TOAST_BASE_STYLE: CSSProperties = {
    background: "rgba(9, 9, 11, 0.96)",
    color: "#f4f4f5",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 14,
    boxShadow: "0 22px 70px -34px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
};
const LOGIN_AUTH_TOAST_CLASS_NAMES: ExternalToast["classNames"] = {
    title: "text-[13px] font-medium leading-5 text-zinc-100",
    description: "text-xs leading-5 text-zinc-400",
    closeButton:
        "!border-white/10 !bg-zinc-900 !text-zinc-300 transition-colors hover:!bg-zinc-800 hover:!text-white",
};

function isInvalidCredentialsMessage(message?: string): boolean {
    const normalized = (message || "").trim().toLowerCase();
    return normalized.includes("invalid credentials") || normalized.includes("invalid email or password");
}

function dismissLoginAuthToasts() {
    LOGIN_AUTH_TOAST_IDS.forEach((id) => toast.dismiss(id));
}

function showLoginAuthToast(
    message: string,
    id: (typeof LOGIN_AUTH_TOAST_IDS)[number],
    description?: string
) {
    const options: ExternalToast = {
        id,
        description,
        position: "bottom-right",
        closeButton: true,
        duration: 5200,
        style: {
            ...LOGIN_AUTH_TOAST_BASE_STYLE,
            borderColor: "rgba(248, 113, 113, 0.42)",
        },
        className: "login-auth-toast",
        classNames: LOGIN_AUTH_TOAST_CLASS_NAMES,
    };

    toast.error(message, options);
}

function getFailedAttemptsToastMessage(loginAttempts: number, remainingAttempts: number) {
    const failedLabel = loginAttempts === 1 ? "failed attempt" : "failed attempts";
    const remainingLabel = remainingAttempts === 1 ? "attempt" : "attempts";
    return `${loginAttempts} ${failedLabel}. ${remainingAttempts} ${remainingLabel} remaining before your account is locked for 15 minutes.`;
}

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
    const [loginStep, setLoginStep] = useState<"email" | "password">("email");
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [isLoading, setIsLoading] = useState(false);
    const [isButtonLoading, setIsButtonLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const passwordInputRef = useRef<HTMLInputElement | null>(null);

    /* ── Login attempt tracking & lock state ── */
    const [loginAttempts, setLoginAttempts] = useState(0);
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

    const loginEmailValue = loginForm.email.trim();
    const isLoginEmailValid = LOGIN_EMAIL_PATTERN.test(loginEmailValue);
    const isPasswordStep = loginStep === "password";
    const isLoginActionBlocked = isLoading || isButtonLoading || isAuthLoading || isLocked;
    const isLoginButtonDisabled = isPasswordStep
        ? !isLoginEmailValid || !loginForm.password || isLoginActionBlocked
        : !isLoginEmailValid || isLoginActionBlocked;
    const showLoginButtonDots = isButtonLoading || isLoading;

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
    const handleLoginEmailContinue = async () => {
        if (isLoading || isButtonLoading || isAuthLoading) return;
        if (isLocked) {
            showLoginAuthToast(
                `Account locked. Try again in ${lockCountdown || "15:00"}.`,
                LOGIN_AUTH_ERROR_TOAST_ID
            );
            return;
        }
        const emailNorm = loginForm.email.trim().toLowerCase();
        if (!emailNorm) {
            showLoginAuthToast(t("validation.enterEmail"), LOGIN_AUTH_ERROR_TOAST_ID);
            return;
        }
        if (!LOGIN_EMAIL_PATTERN.test(emailNorm)) {
            showLoginAuthToast(t("validation.emailInvalid"), LOGIN_AUTH_ERROR_TOAST_ID);
            return;
        }
        setLoginForm((current) => ({ ...current, email: emailNorm }));
        setIsButtonLoading(true);
        await new Promise((resolve) => window.setTimeout(resolve, LOGIN_EMAIL_STEP_LOADER_MS));
        setLoginStep("password");
        window.setTimeout(() => passwordInputRef.current?.focus(), 120);
        setIsButtonLoading(false);
    };

    const handlePasswordLoginAttempt = async () => {
        if (isLoading || isButtonLoading || isAuthLoading) return;
        if (!isLoginEmailValid) {
            showLoginAuthToast(t("validation.emailInvalid"), LOGIN_AUTH_ERROR_TOAST_ID);
            return;
        }
        setIsButtonLoading(true);
        try {
            await handleLoginSubmit();
        } finally {
            setIsButtonLoading(false);
        }
    };

    const handleLoginEmailKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (isPasswordStep) {
            void handlePasswordLoginAttempt();
            return;
        }
        void handleLoginEmailContinue();
    };

    const handleForgotPasswordClick = () => {
        const emailParam = loginForm.email.trim();
        navigate(emailParam ? `/reset-password?email=${encodeURIComponent(emailParam)}` : "/reset-password");
    };

    async function handleLoginSubmit() {
        if (!loginForm.email || !loginForm.password) {
            showLoginAuthToast(t("validation.fillAllFields"), LOGIN_AUTH_ERROR_TOAST_ID);
            return;
        }
        if (isLocked) {
            showLoginAuthToast(
                `Account locked. Try again in ${lockCountdown || "15:00"}.`,
                LOGIN_AUTH_ERROR_TOAST_ID
            );
            return;
        }
        setIsLoading(true);
        try {
            const emailNorm = loginForm.email.trim().toLowerCase();
            const result = await login(emailNorm, loginForm.password);

            // ── Unverified account: redirect to OTP verification page ──
            if (result.requiresOtp || result.data?.requiresOtp) {
                dismissLoginAuthToasts();
                const emailToVerify = result.data?.email || emailNorm;
                navigate(`/verify-otp?email=${encodeURIComponent(emailToVerify)}`);
                toast.info(t("auth.verifyEmailContinue"));
                return;
            }

            // ── Staff first login: force password change ──
            if (result.requiresPasswordChange || result.data?.requiresPasswordChange) {
                dismissLoginAuthToasts();
                const tempToken = result.data?.token || result.token;
                if (tempToken) localStorage.setItem("autospf_set_password_token", tempToken);
                navigate("/set-password");
                toast.info(t("auth.setPasswordContinue"));
                return;
            }

            // ── 2FA: non-customer role ──
            if (result.requiresOTP) {
                dismissLoginAuthToasts();
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
                    showLoginAuthToast(result.message || t("auth.accountLocked"), LOGIN_AUTH_ERROR_TOAST_ID);
                } else if (result.data?.remainingAttempts !== undefined) {
                    const nextLoginAttempts = result.data.loginAttempts ?? loginAttempts + 1;
                    const nextRemainingAttempts = result.data.remainingAttempts;
                    setLoginAttempts(nextLoginAttempts);
                    showLoginAuthToast(
                        LOGIN_INVALID_CREDENTIALS_MESSAGE,
                        LOGIN_INVALID_CREDENTIALS_TOAST_ID,
                        getFailedAttemptsToastMessage(nextLoginAttempts, nextRemainingAttempts)
                    );
                } else if (!result.message || isInvalidCredentialsMessage(result.message)) {
                    showLoginAuthToast(
                        LOGIN_INVALID_CREDENTIALS_MESSAGE,
                        LOGIN_INVALID_CREDENTIALS_TOAST_ID
                    );
                } else {
                    showLoginAuthToast(result.message, LOGIN_AUTH_ERROR_TOAST_ID);
                }
                return;
            }
            // Success — reset attempt state
            dismissLoginAuthToasts();
            setLoginAttempts(0);
            setIsLocked(false);
            setLockUntilMs(null);
            if (rememberMe) localStorage.setItem("remembered_email", emailNorm);
            else localStorage.removeItem("remembered_email");
            performRedirect(getSafeUserRole(result.role || user?.role || "customer"));
        } catch {
            showLoginAuthToast(t("auth.loginFailed"), LOGIN_AUTH_ERROR_TOAST_ID);
        } finally {
            setIsLoading(false);
        }
    }

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
            dismissLoginAuthToasts();
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

    /* ═══════════════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════════════ */
    return (
        <div className="auth-page relative isolate flex min-h-screen flex-col overflow-y-auto bg-[#030303] text-white">
            <div className="auth-spotlight-layer">
                <AuthSpotlight className="auth-spotlight-main" fill="white" />
            </div>

            <Link
                to="/"
                className="fixed left-5 top-5 z-20 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 sm:left-10 sm:top-10"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("nav.home")}
            </Link>

            <div
                className={cn(
                    "relative z-10 flex min-h-screen w-full flex-col items-center px-5 py-16 sm:px-6",
                    tab === "register" ? "justify-start sm:justify-center" : "justify-center"
                )}
            >
                <div className={cn("w-full animate-fade-in", tab === "register" ? "max-w-[28rem]" : "max-w-[27rem]")}>
                    <div className={cn("text-center", tab === "register" ? "mb-6" : "mb-7")}>
                        <Link
                            to="/"
                            className="group mb-5 inline-flex h-11 min-w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.035] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-300 hover:bg-white/[0.055]"
                            aria-label="AutoSPF+ Home"
                        >
                            <img
                                src="/images/autospf-logo.png"
                                alt="AutoSPF+"
                                className="h-6 w-auto max-w-[80px] object-contain opacity-100 [filter:none]"
                            />
                        </Link>
                        <AnimatePresence initial={false} mode="sync">
                            <motion.h1
                                key={tab === "register" ? "register-title" : "login-title"}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={LOGIN_TAB_CONTENT_TRANSITION}
                                className="text-[1.875rem] font-semibold leading-tight tracking-normal text-zinc-50"
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
                                className="mt-2 text-sm leading-5 text-zinc-500"
                            >
                                {tab === "register" ? (
                                    <>
                                        {t("login.alreadyAccount")}{" "}
                                        <button
                                            type="button"
                                            onClick={() => setTab("login")}
                                            className="font-semibold text-zinc-200 transition-colors hover:text-white"
                                        >
                                            {t("login.signIn")}
                                        </button>
                                        .
                                    </>
                                ) : (
                                    <>
                                        {t("login.noAccount")}{" "}
                                        <button
                                            type="button"
                                            onClick={() => setTab("register")}
                                            className="font-semibold text-zinc-200 transition-colors hover:text-white"
                                        >
                                            {t("login.signUp")}
                                        </button>
                                        .
                                    </>
                                )}
                            </motion.p>
                        </AnimatePresence>
                    </div>

                    <div className="relative mx-auto w-full">
                        {/* ══ Form content — crossfade + animated height ══ */}
                        <LoginAuthFormSwitcher
                            activeTab={tab}
                            visible={loginOtpStep === "form"}
                            registerPanel={
                                <div className="mx-auto w-full">
                                    <ManualRegisterForm
                                        onRegistrationComplete={(role) => performRedirect(role)}
                                    />
                                </div>
                            }
                            loginPanel={
                                <div className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label htmlFor="login-email" className="block text-[13px] font-medium text-zinc-400">
                                            {t("login.email")}
                                        </label>
                                        <Input
                                            ref={emailInputRef}
                                            id="login-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            value={loginForm.email}
                                            onChange={(e) => {
                                                dismissLoginAuthToasts();
                                                setLoginForm((f) => ({ ...f, email: e.target.value }));
                                            }}
                                            onKeyDown={handleLoginEmailKeyDown}
                                            placeholder={t("login.emailPlaceholder")}
                                            className={AUTH_INPUT_CLASS}
                                        />
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {isPasswordStep && (
                                            <motion.div
                                                key="login-password-step"
                                                initial={{ opacity: 0, y: -6, height: 0 }}
                                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                                exit={{ opacity: 0, y: -6, height: 0 }}
                                                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
                                                className="overflow-hidden"
                                            >
                                                <div className="space-y-3">
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <label htmlFor="login-password" className="block text-[13px] font-medium text-zinc-400">
                                                                {t("login.password")}
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={handleForgotPasswordClick}
                                                                className={cn("text-xs", AUTH_MUTED_LINK_CLASS)}
                                                            >
                                                                {t("login.forgotPassword")}
                                                            </button>
                                                        </div>
                                                        <div className="relative">
                                                            <Input
                                                                ref={passwordInputRef}
                                                                id="login-password"
                                                                name="password"
                                                                type={showPassword ? "text" : "password"}
                                                                autoComplete="current-password"
                                                                value={loginForm.password}
                                                                onChange={(e) => {
                                                                    dismissLoginAuthToasts();
                                                                    setLoginForm((f) => ({ ...f, password: e.target.value }));
                                                                }}
                                                                placeholder={t("login.passwordPlaceholder")}
                                                                className={cn(AUTH_INPUT_CLASS, "pr-11")}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        handlePasswordLoginAttempt();
                                                                    }
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowPassword(!showPassword)}
                                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-200"
                                                                aria-label={showPassword ? "Hide password" : "Show password"}
                                                            >
                                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (isPasswordStep) void handlePasswordLoginAttempt();
                                            else void handleLoginEmailContinue();
                                        }}
                                        className={cn(AUTH_PRIMARY_BUTTON_CLASS, "auth-login-button")}
                                        disabled={isLoginButtonDisabled}
                                    >
                                        {showLoginButtonDots ? (
                                            <span className="auth-button-dots" aria-label="Loading">
                                                <span />
                                                <span />
                                                <span />
                                            </span>
                                        ) : (
                                            t("login.signIn")
                                        )}
                                    </Button>

                                    <p className="mx-auto max-w-[25rem] text-center text-xs leading-5 text-zinc-500">
                                        {t("login.legalPrefix")}{" "}
                                        <Link to="/#terms-of-service" className="text-zinc-300 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white">
                                            {t("footer.terms")}
                                        </Link>{" "}
                                        {t("login.legalAnd")}{" "}
                                        <Link to="/#privacy-policy" className="text-zinc-300 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white">
                                            {t("footer.privacy")}
                                        </Link>
                                        .
                                    </p>
                                </div>
                            }
                        />

                        {loginOtpStep === "otp" && (
                            <div className="mx-auto max-w-[30rem] animate-slide-up space-y-6">
                                <div className="space-y-3 text-center">
                                    <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                        <ShieldCheck className="h-6 w-6 text-zinc-200" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-zinc-50">{t("login.otpTitle")}</h2>
                                    <p className="text-sm leading-6 text-zinc-500">
                                        {t("login.otpSent")}{" "}
                                        <span className="font-semibold text-zinc-200">{loginMaskedEmail}</span>
                                    </p>
                                </div>

                                {loginOtpExpiry > 0 && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>{t("login.otpExpires")}{" "}
                                            <span className={cn("font-mono font-semibold", loginOtpExpiry <= 60 ? "text-red-300" : "text-zinc-200")}>
                                                {String(Math.floor(loginOtpExpiry / 60)).padStart(2, "0")}:{String(loginOtpExpiry % 60).padStart(2, "0")}
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {loginOtpExpiry === 0 && (
                                    <p className="text-center text-xs text-red-300">{t("login.otpExpired")}</p>
                                )}

                                <div
                                    className={cn(
                                        "flex justify-center gap-2 transition-all",
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
                                                "h-14 w-11 rounded-[14px] border text-center text-xl font-semibold text-white shadow-inner transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-white/[0.10]",
                                                digit ? "border-white/28 bg-white/[0.08]" : "border-white/[0.12] bg-white/[0.045]",
                                                "focus:border-white/35"
                                            )}
                                        />
                                    ))}
                                </div>

                                {loginOtpError && (
                                    <div className="flex items-start gap-2 rounded-[14px] border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-200">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <span>{loginOtpError}</span>
                                    </div>
                                )}

                                <Button
                                    onClick={handleVerifyLoginOtp}
                                    className={AUTH_PRIMARY_BUTTON_CLASS}
                                    disabled={loginOtpDigits.some((d) => !d) || loginOtpVerifying}
                                >
                                    {loginOtpVerifying ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                    )}
                                    {loginOtpVerifying ? t("login.otpVerifying") : t("login.otpVerify")}
                                </Button>

                                <div className="flex items-center justify-between text-xs">
                                    <button
                                        onClick={() => {
                                            setLoginOtpStep("form");
                                            setPendingUserId("");
                                            setLoginMaskedEmail("");
                                            setLoginOtpDigits(["", "", "", "", "", ""]);
                                            setLoginOtpError("");
                                        }}
                                        className="flex items-center gap-1 text-zinc-500 transition-colors hover:text-zinc-200"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                        {t("login.otpBack")}
                                    </button>

                                    <button
                                        onClick={handleResendLoginOtp}
                                        disabled={loginOtpResend > 0 || loginOtpResending}
                                        className={cn(
                                            "flex items-center gap-1 transition-colors",
                                            loginOtpResend > 0 || loginOtpResending
                                                ? "cursor-not-allowed text-zinc-600"
                                                : AUTH_MUTED_LINK_CLASS
                                        )}
                                    >
                                        {loginOtpResending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        {loginOtpResend > 0
                                            ? t("login.otpResendCountdown").replace("{n}", String(loginOtpResend))
                                            : t("login.otpResend")}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
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
        </div>
    );
}
