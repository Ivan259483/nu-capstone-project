import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getBaseApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

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
            setError("Email is missing. Close this dialog and try again.");
            return;
        }
        if (otp.length < OTP_LENGTH) {
            setError("Please enter the complete 6-digit code.");
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
                setError(data.message || "Invalid or expired code. Please try again.");
                return;
            }

            const backendUser = data.data?.user as Record<string, unknown> | undefined;
            const backendToken = data.data?.token as string | undefined;
            if (!backendToken || !backendUser) {
                setError("Verification succeeded but sign-in failed. Please sign in with your password.");
                return;
            }

            toast.success("Email verified. Welcome to AutoSPF+!");
            onVerified({
                user: backendUser,
                token: backendToken,
                role: String(data.data?.role || backendUser.role || "customer"),
            });
        } catch {
            setError("Network error. Please check your connection and try again.");
        } finally {
            setIsVerifying(false);
        }
    }, [digits, isVerifying, normalizedEmail, onVerified, shakeAndClear]);

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
                setError(data.message || "Could not resend code. Please try again.");
                return;
            }
            const nextExpiry =
                typeof data.data?.expiresIn === "number" ? data.data.expiresIn : DEFAULT_OTP_EXPIRY_SEC;
            setExpirySec(nextExpiry);
            setResendSec(RESEND_COOLDOWN_SEC);
            setDigits(Array(OTP_LENGTH).fill(""));
            autoSubmitRef.current = false;
            inputRefs.current[0]?.focus();
            toast.success("A new code was sent to your email.");
        } catch {
            setError("Could not resend code. Please try again.");
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
            <DialogContent
                className="glass border-orange-500/15 sm:max-w-md duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:zoom-out-[0.98] data-[state=closed]:slide-out-to-bottom-2"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <ShieldCheck className="h-5 w-5 text-orange-500" />
                        Verify your email
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Enter the 6-digit code we sent to{" "}
                        <span className="font-semibold text-foreground">{maskEmail(normalizedEmail)}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-1">
                    <div
                        className={cn(
                            "flex gap-2 justify-center",
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
                                    "w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-muted/40 text-foreground",
                                    "focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40",
                                    digit ? "border-orange-500/50 bg-orange-500/5" : "border-border"
                                )}
                                onChange={(e) => handleChange(idx, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(idx, e)}
                            />
                        ))}
                    </div>

                    <p
                        className={cn(
                            "text-center text-xs",
                            expirySec <= 60 ? "text-red-400" : "text-muted-foreground"
                        )}
                    >
                        Code expires in {formatTime(Math.max(0, expirySec))}
                    </p>

                    {error ? (
                        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    ) : null}

                    <Button
                        type="button"
                        onClick={() => void handleVerify()}
                        disabled={digits.some((d) => !d) || isVerifying}
                        className="w-full bg-orange-600 text-white hover:bg-orange-700 font-semibold"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying…
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Confirm & continue
                            </>
                        )}
                    </Button>

                    <div className="flex items-center justify-center text-xs">
                        <button
                            type="button"
                            onClick={() => void handleResend()}
                            disabled={resendSec > 0 || isResending || isVerifying}
                            className={cn(
                                "inline-flex items-center gap-1 font-semibold transition-colors",
                                resendSec > 0 || isResending
                                    ? "text-muted-foreground/50 cursor-not-allowed"
                                    : "text-orange-500 hover:text-orange-400"
                            )}
                        >
                            {isResending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {resendSec > 0 ? `Resend code in ${resendSec}s` : "Resend code"}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
