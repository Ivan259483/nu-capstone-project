import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { getBaseApiUrl } from "@/lib/api";
import { ShieldCheck, RefreshCw, ArrowLeft, Loader2 } from "lucide-react";

const OTP_LENGTH = 6;
const OTP_SECONDS = 600; // 10 minutes
const normalizeOtp = (value: string) => value.replace(/\D/g, "").slice(0, OTP_LENGTH);
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function VerifyOtpPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const email = normalizeEmail(searchParams.get("email") || "");

    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
    const [seconds, setSeconds] = useState(OTP_SECONDS);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [shake, setShake] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    /* ── countdown ── */
    useEffect(() => {
        if (seconds <= 0) return;
        const t = setInterval(() => setSeconds((s) => s - 1), 1000);
        return () => clearInterval(t);
    }, [seconds]);

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    /* ── input handlers ── */
    const handleChange = (i: number, val: string) => {
        const normalized = normalizeOtp(val);
        const next = [...digits];
        if (normalized.length > 1) {
            normalized.split("").forEach((ch, offset) => {
                const target = i + offset;
                if (target < OTP_LENGTH) next[target] = ch;
            });
            setDigits(next);
            inputRefs.current[Math.min(i + normalized.length, OTP_LENGTH - 1)]?.focus();
            return;
        }
        const ch = normalized.slice(-1);
        next[i] = ch;
        setDigits(next);
        if (ch && i < OTP_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = normalizeOtp(e.clipboardData.getData("text"));
        if (!pasted) return;
        const next = Array(OTP_LENGTH).fill("");
        pasted.split("").forEach((ch, idx) => { next[idx] = ch; });
        setDigits(next);
        inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    };

    /* ── submit ── */
    const handleSubmit = useCallback(async () => {
        if (isVerifying) return;
        const otp = normalizeOtp(digits.join(""));
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
            toast.error("Email address is missing. Please go back and try again.");
            return;
        }
        if (otp.length < OTP_LENGTH) {
            toast.error("Please enter all 6 digits.");
            return;
        }
        setIsVerifying(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail, otp }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setShake(true);
                setTimeout(() => setShake(false), 600);
                setDigits(Array(OTP_LENGTH).fill(""));
                inputRefs.current[0]?.focus();
                toast.error(data.message || "Invalid or expired OTP.");
                return;
            }
            toast.success("Email verified!");
            // Redirect based on role
            const { role, isFirstLogin } = data.data || {};
            if (isFirstLogin && role && role !== "customer") {
                navigate("/set-password");
            } else {
                navigate("/login?verified=1");
            }
        } catch {
            toast.error("Network error. Please try again.");
        } finally {
            setIsVerifying(false);
        }
    }, [digits, email, isVerifying, navigate]);

    /* ── auto-submit when all digits filled ── */
    useEffect(() => {
        if (digits.every((d) => d !== "")) handleSubmit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digits]);

    /* ── resend ── */
    const handleResend = async () => {
        const normalizedEmail = normalizeEmail(email);
        if (isResending || seconds > 0) return;
        if (!normalizedEmail) {
            toast.error("Email address is missing. Please go back and try again.");
            return;
        }
        setIsResending(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/resend-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.message || "Failed to resend OTP.");
                return;
            }
            setDigits(Array(OTP_LENGTH).fill(""));
            setSeconds(OTP_SECONDS);
            inputRefs.current[0]?.focus();
            toast.success("A new verification code was sent to your email.");
        } catch {
            toast.error("Network error. Please try again.");
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="verify-otp-root">
            <style>{`
                .verify-otp-root {
                    min-height: 100vh;
                    background: #080c14;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1.5rem;
                    font-family: 'Inter', -apple-system, sans-serif;
                }
                .verify-card {
                    background: #0e1420;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 24px;
                    padding: 2.5rem 2rem;
                    width: 100%;
                    max-width: 440px;
                    box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.06) inset;
                }
                .verify-icon-ring {
                    width: 72px; height: 72px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(217,119,6,0.08));
                    border: 1.5px solid rgba(251,191,36,0.2);
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 1.5rem;
                }
                .verify-title {
                    font-size: 1.5rem; font-weight: 800;
                    color: #fff; text-align: center; margin-bottom: .375rem;
                    letter-spacing: -0.5px;
                }
                .verify-sub {
                    font-size: .875rem; color: #6b7280;
                    text-align: center; margin-bottom: 2rem; line-height: 1.5;
                }
                .verify-email-badge {
                    display: inline-block;
                    background: rgba(251,191,36,0.08);
                    border: 1px solid rgba(251,191,36,0.15);
                    border-radius: 8px; padding: 2px 10px;
                    color: #fbbf24; font-size: .8rem; font-weight: 600;
                }
                .otp-boxes {
                    display: flex; gap: .625rem; justify-content: center; margin-bottom: 1.75rem;
                }
                .otp-box {
                    width: 48px; height: 60px;
                    background: #161c2c; border: 1.5px solid rgba(255,255,255,0.08);
                    border-radius: 12px; font-size: 1.5rem; font-weight: 800;
                    color: #fbbf24; text-align: center;
                    outline: none; transition: border-color .15s, box-shadow .15s;
                    -moz-appearance: textfield;
                }
                .otp-box:focus {
                    border-color: #fbbf24;
                    box-shadow: 0 0 0 3px rgba(251,191,36,0.15);
                }
                .otp-box::-webkit-outer-spin-button,
                .otp-box::-webkit-inner-spin-button { -webkit-appearance: none; }
                @keyframes shake {
                    0%,100%{transform:translateX(0)}
                    20%,60%{transform:translateX(-6px)}
                    40%,80%{transform:translateX(6px)}
                }
                .shake { animation: shake .5s ease; }
                .verify-timer {
                    display: flex; align-items: center; justify-content: center;
                    gap: .5rem; font-size: .8rem; color: #6b7280; margin-bottom: 1.25rem;
                }
                .verify-timer.expiring { color: #ef4444; }
                .btn-verify {
                    width: 100%; padding: .875rem 1rem;
                    background: linear-gradient(135deg, #fbbf24, #d97706);
                    color: #000; font-weight: 700; font-size: .95rem;
                    border: none; border-radius: 12px; cursor: pointer;
                    transition: opacity .15s, transform .1s;
                    display: flex; align-items: center; justify-content: center; gap: .5rem;
                }
                .btn-verify:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
                .btn-verify:disabled { opacity: .5; cursor: not-allowed; transform: none; }
                .resend-row {
                    text-align: center; margin-top: 1.25rem;
                    font-size: .85rem; color: #6b7280;
                }
                .btn-resend {
                    background: none; border: none; padding: 0;
                    color: #fbbf24; font-size: .85rem; font-weight: 600;
                    cursor: pointer; text-decoration: underline;
                    transition: opacity .15s;
                }
                .btn-resend:disabled { opacity: .4; cursor: not-allowed; text-decoration: none; }
                .back-link {
                    display: flex; align-items: center; gap: .375rem;
                    justify-content: center; margin-top: 1.5rem;
                    font-size: .82rem; color: #4b5563; text-decoration: none;
                    transition: color .15s;
                }
                .back-link:hover { color: #9ca3af; }
            `}</style>

            <div className="verify-card">
                <div className="verify-icon-ring">
                    <ShieldCheck size={32} color="#fbbf24" />
                </div>
                <h1 className="verify-title">Verify Your Email</h1>
                <p className="verify-sub">
                    We sent a 6-digit code to<br />
                    <span className="verify-email-badge">{email || "your email"}</span>
                </p>

                <div className={`otp-boxes ${shake ? "shake" : ""}`} onPaste={handlePaste}>
                    {digits.map((d, i) => (
                        <input
                            key={i}
                            ref={(el) => { inputRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={d}
                            className="otp-box"
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            autoFocus={i === 0}
                            id={`otp-digit-${i}`}
                            aria-label={`OTP digit ${i + 1}`}
                        />
                    ))}
                </div>

                <div className={`verify-timer ${seconds <= 60 ? "expiring" : ""}`}>
                    <span>Code expires in {formatTime(seconds)}</span>
                </div>

                <button
                    className="btn-verify"
                    onClick={handleSubmit}
                    disabled={isVerifying || digits.join("").length < OTP_LENGTH}
                    id="verify-otp-submit"
                >
                    {isVerifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    {isVerifying ? "Verifying…" : "Verify Code"}
                </button>

                <div className="resend-row">
                    {seconds > 0 ? (
                        <span>Didn't receive it? Resend available in {formatTime(seconds)}</span>
                    ) : (
                        <span>
                            Didn't receive it?{" "}
                            <button
                                className="btn-resend"
                                onClick={handleResend}
                                disabled={isResending}
                                id="resend-otp-btn"
                            >
                                {isResending ? <><RefreshCw size={12} className="animate-spin inline mr-1" />Sending…</> : "Resend OTP"}
                            </button>
                        </span>
                    )}
                </div>

                <Link to="/login" className="back-link">
                    <ArrowLeft size={14} />
                    Back to Login
                </Link>
            </div>
        </div>
    );
}
