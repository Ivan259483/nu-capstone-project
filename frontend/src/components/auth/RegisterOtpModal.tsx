import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogDescription,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";
import { getBaseApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const OTP_LENGTH = 6;
const DEFAULT_OTP_EXPIRY_SEC = 600;
const RESEND_COOLDOWN_SEC = 60;

function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 2) return `${local[0] ?? ""}*@${domain}`;
    return `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`;
}

function normalizeOtp(value: string): string {
    return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export type RegisterOtpVerifiedPayload = {
    user: Record<string, unknown>;
    token: string;
    role: string;
};

type RegisterOtpModalProps = {
    open: boolean;
    email: string;
    expiresInSeconds?: number;
    onOpenChange: (open: boolean) => void;
    onVerified: (payload: RegisterOtpVerifiedPayload) => void;
};

export function RegisterOtpModal({
    open,
    email,
    expiresInSeconds = DEFAULT_OTP_EXPIRY_SEC,
    onOpenChange,
    onVerified,
}: RegisterOtpModalProps) {
    const { t } = useLanguage();
    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [expirySec, setExpirySec] = useState(expiresInSeconds);
    const [resendSec, setResendSec] = useState(RESEND_COOLDOWN_SEC);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const autoSubmitRef = useRef(false);

    const normalizedEmail = email.trim().toLowerCase();

    useEffect(() => {
        if (!open) return;
        setDigits(Array(OTP_LENGTH).fill(""));
        setError("");
        setExpirySec(expiresInSeconds);
        setResendSec(RESEND_COOLDOWN_SEC);
        autoSubmitRef.current = false;
        const t = window.setTimeout(() => inputRefs.current[0]?.focus(), 120);
        return () => window.clearTimeout(t);
    }, [open, expiresInSeconds, normalizedEmail]);

    useEffect(() => {
        if (!open || expirySec <= 0) return;
        const timer = window.setInterval(() => setExpirySec((s) => s - 1), 1000);
        return () => window.clearInterval(timer);
    }, [open, expirySec]);

    useEffect(() => {
        if (!open || resendSec <= 0) return;
        const timer = window.setInterval(() => setResendSec((s) => s - 1), 1000);
        return () => window.clearInterval(timer);
    }, [open, resendSec]);

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const handleChange = (index: number, value: string) => {
        const normalized = normalizeOtp(value);
        const next = [...digits];
        if (normalized.length > 1) {
            normalized.split("").forEach((ch, offset) => {
                const target = index + offset;
                if (target < OTP_LENGTH) next[target] = ch;
            });
            setDigits(next);
            setError("");
            inputRefs.current[Math.min(index + normalized.length, OTP_LENGTH - 1)]?.focus();
            return;
        }
        next[index] = normalized.slice(-1);
        setDigits(next);
        setError("");
        if (normalized && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
        if (e.key === "Enter" && digits.every((d) => d)) {
            void handleVerify();
        }
    };

    const handlePaste = (e: ClipboardEvent) => {
        e.preventDefault();
        const pasted = normalizeOtp(e.clipboardData.getData("text"));
        if (!pasted) return;
        const next = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] || "");
        setDigits(next);
        setError("");
        inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    };

    const shakeAndClear = useCallback(() => {
        setShake(true);
        window.setTimeout(() => setShake(false), 600);
        setDigits(Array(OTP_LENGTH).fill(""));
        window.setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }, []);

    const handleVerify = useCallback(async () => {
        if (isVerifying) return;
        const otp = normalizeOtp(digits.join(""));
        if (!normalizedEmail) {
            setError(t("register.otpEmailMissing"));
            return;
        }
        if (otp.length < OTP_LENGTH) {
            setError(t("validation.otpIncomplete"));
            return;
        }

        setIsVerifying(true);
        setError("");
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail, otp }),
                signal: AbortSignal.timeout(15000),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                shakeAndClear();
                setError(data.message || t("register.otpInvalidExpired"));
                return;
            }

            const backendUser = data.data?.user as Record<string, unknown> | undefined;
            const backendToken = data.data?.token as string | undefined;
            if (!backendToken || !backendUser) {
                setError(t("register.otpSuccessNoToken"));
                return;
            }

            toast.success(t("register.otpVerifiedWelcome"));
            onVerified({
                user: backendUser,
                token: backendToken,
                role: String(data.data?.role || backendUser.role || "customer"),
            });
        } catch {
            setError(t("auth.networkError"));
        } finally {
            setIsVerifying(false);
        }
    }, [digits, isVerifying, normalizedEmail, onVerified, shakeAndClear, t]);

    useEffect(() => {
        if (!open || isVerifying) return;
        if (!digits.every((d) => d !== "")) {
            autoSubmitRef.current = false;
            return;
        }
        if (autoSubmitRef.current) return;
        autoSubmitRef.current = true;
        void handleVerify();
    }, [digits, open, isVerifying, handleVerify]);

    const handleResend = async () => {
        if (isResending || resendSec > 0 || !normalizedEmail) return;
        setIsResending(true);
        setError("");
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/resend-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail }),
                signal: AbortSignal.timeout(15000),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                const waitSeconds = data.data?.retryAfterSeconds as number | undefined;
                if (waitSeconds) setResendSec(waitSeconds);
                setError(data.message || t("register.otpResendFailed"));
                return;
            }
            const nextExpiry =
                typeof data.data?.expiresIn === "number" ? data.data.expiresIn : DEFAULT_OTP_EXPIRY_SEC;
            setExpirySec(nextExpiry);
            setResendSec(RESEND_COOLDOWN_SEC);
            setDigits(Array(OTP_LENGTH).fill(""));
            autoSubmitRef.current = false;
            inputRefs.current[0]?.focus();
            toast.success(t("register.otpResendSuccess"));
        } catch {
            setError(t("register.otpResendFailed"));
        } finally {
            setIsResending(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (isVerifying) return;
                onOpenChange(next);
            }}
        >
            <DialogPortal>
                <DialogOverlay className="!bg-[#030712]/40 backdrop-blur-[6px]" />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[27rem] -translate-x-1/2 -translate-y-1/2",
                        "overflow-hidden rounded-[28px] border border-amber-200/15 bg-[#080d18]/90 p-0 text-white outline-none backdrop-blur-2xl",
                        "shadow-[0_30px_100px_-42px_rgba(0,0,0,0.95),0_0_52px_-34px_rgba(245,158,11,0.85),inset_0_1px_0_rgba(255,255,255,0.09)]",
                        "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
                        "data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:slide-out-to-bottom-2"
                    )}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/30 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(245,158,11,0.045)_45%,rgba(255,255,255,0.02))]" />

                    <DialogClose
                        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-amber-200/25 hover:bg-white/[0.07] hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:pointer-events-none"
                        disabled={isVerifying}
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </DialogClose>

                    <div className="relative space-y-6 px-5 pb-6 pt-6 sm:px-6 sm:pb-7 sm:pt-7">
                        <DialogHeader className="space-y-3 pr-10 text-left">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_12px_34px_-24px_rgba(245,158,11,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]">
                                    <ShieldCheck className="h-5 w-5" />
                                </span>
                                <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-white">
                                    {t("register.otpTitle")}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-sm leading-relaxed text-slate-400">
                                {t("register.otpDescription")}{" "}
                                <span className="font-semibold text-slate-100">{maskEmail(normalizedEmail)}</span>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-5">
                            <div
                                className={cn(
                                    "flex justify-center gap-2 sm:gap-2.5",
                                    shake && "animate-[shake_0.4s_ease-in-out]"
                                )}
                                onPaste={handlePaste}
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
                                {digits.map((digit, idx) => (
                                    <input
                                        key={idx}
                                        ref={(el) => {
                                            inputRefs.current[idx] = el;
                                        }}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete={idx === 0 ? "one-time-code" : "off"}
                                        maxLength={1}
                                        value={digit}
                                        disabled={isVerifying}
                                        aria-label={`Digit ${idx + 1} of ${OTP_LENGTH}`}
                                        className={cn(
                                            "h-14 w-11 rounded-2xl border bg-white/[0.045] text-center text-xl font-bold text-white backdrop-blur-xl",
                                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,box-shadow,background-color,transform] duration-200",
                                            "focus:outline-none focus:border-amber-300/60 focus:bg-white/[0.065] focus:ring-2 focus:ring-amber-300/20",
                                            "disabled:cursor-not-allowed disabled:opacity-55 sm:w-12",
                                            digit
                                                ? "border-amber-200/35 bg-amber-300/10 text-amber-50 shadow-[0_12px_30px_-24px_rgba(245,158,11,0.8),inset_0_1px_0_rgba(255,255,255,0.08)]"
                                                : "border-white/10"
                                        )}
                                        onChange={(e) => handleChange(idx, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(idx, e)}
                                    />
                                ))}
                            </div>

                            <p
                                className={cn(
                                    "text-center text-xs font-medium",
                                    expirySec <= 60 ? "text-amber-200/80" : "text-slate-500"
                                )}
                            >
                                {t("register.otpExpiresLabel")} {formatTime(Math.max(0, expirySec))}
                            </p>

                            {error ? (
                                <div className="flex items-start gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-300">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            ) : null}

                            <Button
                                type="button"
                                onClick={() => void handleVerify()}
                                disabled={digits.some((d) => !d) || isVerifying}
                                className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,rgba(255,222,142,0.98),rgba(245,166,35,0.94)_45%,rgba(232,111,30,0.90))] text-sm font-bold text-[#070A12] shadow-[0_18px_46px_-20px_rgba(245,158,11,0.95),inset_0_1px_0_rgba(255,255,255,0.42)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,rgba(255,232,170,1),rgba(251,183,62,0.96)_45%,rgba(242,120,36,0.94))] hover:shadow-[0_22px_58px_-22px_rgba(245,158,11,1),inset_0_1px_0_rgba(255,255,255,0.5)] disabled:translate-y-0 disabled:opacity-55"
                            >
                                {isVerifying ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("login.otpVerifying")}
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        {t("register.otpConfirm")}
                                    </>
                                )}
                            </Button>

                            <div className="flex items-center justify-center text-xs">
                                <button
                                    type="button"
                                    onClick={() => void handleResend()}
                                    disabled={resendSec > 0 || isResending || isVerifying}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 font-semibold transition-colors",
                                        resendSec > 0 || isResending || isVerifying
                                            ? "cursor-not-allowed text-slate-500/60"
                                            : "text-amber-200/80 hover:text-amber-100"
                                    )}
                                >
                                    {isResending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                    {resendSec > 0
                                        ? t("register.otpResendCountdown").replace("{n}", String(resendSec))
                                        : t("register.otpResend")}
                                </button>
                            </div>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
