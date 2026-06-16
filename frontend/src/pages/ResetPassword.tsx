import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import AuthSpotlight from "@/components/effects/AuthSpotlight";
import { getBaseApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { registerPasswordPolicyError } from "@/lib/register-validation";

const OTP_LENGTH = 6;

const AUTH_INPUT_CLASS =
    "h-12 rounded-[14px] border-white/[0.12] bg-white/[0.065] text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] placeholder:text-zinc-500 transition-[border-color,background-color,box-shadow] duration-300 focus-visible:border-white/30 focus-visible:bg-white/[0.085] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/[0.09]";

const AUTH_ICON_CLASS =
    "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500";

const AUTH_PRIMARY_BUTTON_CLASS =
    "h-[46px] w-full rounded-[14px] border border-white/[0.085] bg-zinc-950/60 text-sm font-semibold text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_18px_48px_-36px_rgba(255,255,255,0.24)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-black/75 hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_22px_58px_-38px_rgba(255,255,255,0.28)] disabled:translate-y-0 disabled:border-white/[0.045] disabled:bg-zinc-900/25 disabled:text-zinc-600 disabled:shadow-none";

type ResetStep = "email" | "otp" | "password";

function LoadingDots() {
    return (
        <span className="inline-flex h-5 items-center justify-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
                <span
                    key={index}
                    className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                    style={{ animationDelay: `${index * 120}ms`, animationDuration: "0.85s" }}
                />
            ))}
        </span>
    );
}

function ResetSubtitle({ step, email }: { step: ResetStep; email: string }) {
    if (step === "otp") {
        return (
            <>
                Enter the 6-digit code we sent to{" "}
                <span className="font-semibold text-zinc-200">{email}</span>.
            </>
        );
    }

    if (step === "password") {
        return <>Choose a new password for your account.</>;
    }

    return <>Enter your email address and we'll send a 6-digit reset code.</>;
}

export default function ResetPassword() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialEmail = searchParams.get("email")?.trim() ?? "";

    const [step, setStep] = useState<ResetStep>("email");
    const [email, setEmail] = useState(initialEmail);
    const [isLoading, setIsLoading] = useState(false);
    const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
    const [otpError, setOtpError] = useState("");
    const [otpShake, setOtpShake] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const newPasswordInputRef = useRef<HTMLInputElement | null>(null);
    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (initialEmail) setEmail(initialEmail);
    }, [initialEmail]);

    const resetOtpState = () => {
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        setOtpError("");
        setOtpShake(false);
    };

    const handleSendResetCode = async () => {
        const emailNorm = email.trim().toLowerCase();
        if (!emailNorm) {
            toast.error(t("validation.enterEmail"));
            return;
        }

        setIsLoading(true);
        setOtpError("");
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

            setEmail(emailNorm);
            setStep("otp");
            resetOtpState();
            toast.success(t("auth.resetSent"));
            window.setTimeout(() => otpInputRefs.current[0]?.focus(), 120);
        } catch {
            toast.error(t("auth.resetSendFailed"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const updated = [...otpDigits];
        updated[index] = value.slice(-1);
        setOtpDigits(updated);
        setOtpError("");
        if (value && index < OTP_LENGTH - 1) otpInputRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
        if (e.key === "Enter" && otpDigits.join("").length === OTP_LENGTH) {
            void handleVerifyOtp();
        }
    };

    const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!pasted) return;
        e.preventDefault();
        const updated = Array(OTP_LENGTH).fill("");
        for (let index = 0; index < pasted.length; index += 1) updated[index] = pasted[index];
        setOtpDigits(updated);
        otpInputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    };

    const handleVerifyOtp = async () => {
        const code = otpDigits.join("");
        if (code.length !== OTP_LENGTH) {
            setOtpError(t("validation.otpIncomplete"));
            return;
        }

        setIsLoading(true);
        setOtpError("");
        try {
            const resp = await fetch(`${getBaseApiUrl()}/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp: code }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                setOtpShake(true);
                window.setTimeout(() => setOtpShake(false), 600);
                setOtpDigits(Array(OTP_LENGTH).fill(""));
                setOtpError(json.message || t("auth.invalidCode"));
                window.setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
                return;
            }

            setStep("password");
            window.setTimeout(() => newPasswordInputRef.current?.focus(), 120);
        } catch {
            setOtpError(t("auth.verifyFailed"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        const policyError = registerPasswordPolicyError(newPassword, t);
        if (policyError) {
            toast.error(policyError);
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error(t("validation.passwordMismatch"));
            return;
        }

        setIsLoading(true);
        try {
            const resp = await fetch(`${getBaseApiUrl()}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    otp: otpDigits.join(""),
                    newPassword,
                }),
                signal: AbortSignal.timeout(12000),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                toast.error(json.message || t("auth.resetFailed"));
                return;
            }

            toast.success(t("auth.passwordUpdated"));
            navigate("/login", { replace: true });
        } catch {
            toast.error(t("auth.resetFailed"));
        } finally {
            setIsLoading(false);
        }
    };

    const buttonLabel =
        step === "email" ? "Send reset code" : step === "otp" ? t("login.forgotVerify") : t("login.forgotUpdate");
    const loadingLabel =
        step === "email" ? t("login.forgotSending") : step === "otp" ? t("login.otpVerifying") : t("login.forgotUpdating");

    return (
        <div className="auth-page relative isolate flex min-h-screen flex-col overflow-y-auto bg-[#030303] text-white">
            <style>{`
                @keyframes reset-password-shake {
                    0%,100%{transform:translateX(0)}
                    20%{transform:translateX(-6px)}
                    40%{transform:translateX(6px)}
                    60%{transform:translateX(-4px)}
                    80%{transform:translateX(4px)}
                }
            `}</style>

            <div className="auth-spotlight-layer">
                <AuthSpotlight className="auth-spotlight-main" fill="white" />
            </div>

            <main className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-5 py-16 sm:px-6">
                <div className="w-full max-w-[27rem] animate-fade-in">
                    <div className="mb-7 text-center">
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
                        <h1 className="text-[1.875rem] font-semibold leading-tight tracking-normal text-zinc-50">
                            Reset password
                        </h1>
                        <p className="mx-auto mt-2 max-w-[25rem] text-sm leading-5 text-zinc-500">
                            <ResetSubtitle step={step} email={email} />
                        </p>
                    </div>

                    <div className="space-y-5">
                        {step === "email" && (
                            <div className="space-y-1.5">
                                <label htmlFor="reset-email" className="block text-[13px] font-medium text-zinc-400">
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail className={AUTH_ICON_CLASS} />
                                    <Input
                                        ref={emailInputRef}
                                        id="reset-email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                void handleSendResetCode();
                                            }
                                        }}
                                        placeholder="name@example.com"
                                        className={cn(AUTH_INPUT_CLASS, "pl-10")}
                                    />
                                </div>
                            </div>
                        )}

                        {step === "otp" && (
                            <div className="space-y-4">
                                <div
                                    className={cn("flex justify-center gap-2", otpShake && "animate-[reset-password-shake_0.4s_ease-in-out]")}
                                >
                                    {otpDigits.map((digit, index) => (
                                        <input
                                            key={index}
                                            ref={(element) => {
                                                otpInputRefs.current[index] = element;
                                            }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(event) => handleOtpChange(index, event.target.value)}
                                            onKeyDown={(event) => handleOtpKeyDown(index, event)}
                                            onPaste={index === 0 ? handleOtpPaste : undefined}
                                            aria-label={`Reset code digit ${index + 1}`}
                                            className={cn(
                                                "h-14 w-11 rounded-[14px] border text-center text-xl font-semibold text-white shadow-inner transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-white/[0.10]",
                                                digit ? "border-white/28 bg-white/[0.08]" : "border-white/[0.12] bg-white/[0.045]",
                                                "focus:border-white/35"
                                            )}
                                        />
                                    ))}
                                </div>

                                {otpError && (
                                    <p className="text-center text-xs font-medium text-red-300">{otpError}</p>
                                )}
                            </div>
                        )}

                        {step === "password" && (
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="reset-new-password" className="block text-[13px] font-medium text-zinc-400">
                                        New password
                                    </label>
                                    <div className="relative">
                                        <Lock className={AUTH_ICON_CLASS} />
                                        <Input
                                            ref={newPasswordInputRef}
                                            id="reset-new-password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={newPassword}
                                            onChange={(event) => setNewPassword(event.target.value)}
                                            placeholder={t("login.forgotNewPassword")}
                                            className={cn(AUTH_INPUT_CLASS, "pl-10 pr-11")}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-200"
                                            onClick={() => setShowPassword((value) => !value)}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="reset-confirm-password" className="block text-[13px] font-medium text-zinc-400">
                                        Confirm password
                                    </label>
                                    <div className="relative">
                                        <Lock className={AUTH_ICON_CLASS} />
                                        <Input
                                            id="reset-confirm-password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    void handleResetPassword();
                                                }
                                            }}
                                            placeholder={t("login.forgotConfirmPassword")}
                                            className={cn(AUTH_INPUT_CLASS, "pl-10")}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <Button
                            type="button"
                            onClick={() => {
                                if (step === "email") void handleSendResetCode();
                                else if (step === "otp") void handleVerifyOtp();
                                else void handleResetPassword();
                            }}
                            className={cn(AUTH_PRIMARY_BUTTON_CLASS, "auth-login-button")}
                            disabled={
                                isLoading ||
                                (step === "email" && !email.trim()) ||
                                (step === "otp" && otpDigits.join("").length !== OTP_LENGTH) ||
                                (step === "password" && (!newPassword || !confirmPassword))
                            }
                        >
                            {isLoading ? (
                                <>
                                    <LoadingDots />
                                    <span className="sr-only">{loadingLabel}</span>
                                </>
                            ) : (
                                buttonLabel
                            )}
                        </Button>

                        {step === "otp" && (
                            <button
                                type="button"
                                className="w-full text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200"
                                onClick={() => {
                                    setStep("email");
                                    resetOtpState();
                                    window.setTimeout(() => emailInputRef.current?.focus(), 80);
                                }}
                            >
                                {t("login.forgotDifferentEmail")}
                            </button>
                        )}

                        <Link
                            to="/login"
                            className="mx-auto inline-flex w-full items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back to login
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
