import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Mail,
    RefreshCw,
    Sparkles,
    UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FloatingLabelField } from "@/components/auth/FloatingLabelField";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { buildRegisterE164, validateRegisterNationalDigits } from "@/lib/phone";
import { REGISTER_COUNTRY_DIALS } from "@/lib/countries-dial-data";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

type FieldKey = "firstName" | "lastName" | "email";
type FieldErrors = Partial<Record<FieldKey | "phone", string>>;

function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 2) return `${local[0] ?? ""}*@${domain}`;
    return `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`;
}

function validateFirstName(value: string): string | undefined {
    const v = value.trim().replace(/\s+/g, " ");
    if (!v) return "First name is required.";
    if (v.length > 40) return "First name must be 40 characters or fewer.";
    if (!NAME_PART_REGEX.test(v)) return "Please enter a valid first name.";
    return undefined;
}

function validateLastName(value: string): string | undefined {
    const v = value.trim().replace(/\s+/g, " ");
    if (!v) return "Last name is required.";
    if (v.length > 40) return "Last name must be 40 characters or fewer.";
    if (!NAME_PART_REGEX.test(v)) return "Please enter a valid last name.";
    return undefined;
}

function validateEmail(value: string): string | undefined {
    const v = value.trim().toLowerCase();
    if (!v) return "Email address is required.";
    if (!EMAIL_REGEX.test(v)) return "Please enter a valid email address.";
    return undefined;
}

type ManualRegisterFormProps = {
    onBack: () => void;
    onSignIn: () => void;
};

export function ManualRegisterForm({ onBack, onSignIn }: ManualRegisterFormProps) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phoneCountryIso, setPhoneCountryIso] = useState("PH");
    const [phoneNational, setPhoneNational] = useState("");
    const [errors, setErrors] = useState<FieldErrors>({});
    const [touched, setTouched] = useState<Partial<Record<FieldKey | "phone", boolean>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [phase, setPhase] = useState<"form" | "success">("form");
    const [submittedEmail, setSubmittedEmail] = useState("");
    const [successPop, setSuccessPop] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const dial = useMemo(
        () => REGISTER_COUNTRY_DIALS.find((c) => c.iso === phoneCountryIso)?.dial ?? "63",
        [phoneCountryIso]
    );

    const phoneError = useMemo(() => {
        if (!phoneNational.replace(/\D/g, "").length) {
            return touched.phone ? "Mobile number is required." : undefined;
        }
        const check = validateRegisterNationalDigits(dial, phoneNational);
        return check.ok ? undefined : check.message;
    }, [dial, phoneNational, touched.phone]);

    const fieldValidators = useMemo(
        () => ({
            firstName: () => validateFirstName(firstName),
            lastName: () => validateLastName(lastName),
            email: () => validateEmail(email),
            phone: () => phoneError,
        }),
        [email, firstName, lastName, phoneError]
    );

    const runFieldValidation = useCallback(
        (key: FieldKey | "phone") => {
            const message = fieldValidators[key]();
            setErrors((prev) => {
                const next = { ...prev };
                if (message) next[key] = message;
                else delete next[key];
                return next;
            });
            return !message;
        },
        [fieldValidators]
    );

    const validateAll = useCallback(() => {
        const next: FieldErrors = {};
        (["firstName", "lastName", "email", "phone"] as const).forEach((key) => {
            const message = fieldValidators[key]();
            if (message) next[key] = message;
        });
        setErrors(next);
        setTouched({ firstName: true, lastName: true, email: true, phone: true });
        return Object.keys(next).length === 0;
    }, [fieldValidators]);

    useEffect(() => {
        if (phase !== "success") return;
        const t = window.setTimeout(() => setSuccessPop(true), 80);
        return () => window.clearTimeout(t);
    }, [phase]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = window.setInterval(() => setResendCooldown((c) => c - 1), 1000);
        return () => window.clearInterval(timer);
    }, [resendCooldown]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateAll()) return;

        const emailNorm = email.trim().toLowerCase();
        const phoneE164 = buildRegisterE164(dial, phoneNational);

        setIsSubmitting(true);
        try {
            const res = await api.post(
                "/auth/chat-registration/start",
                {
                    firstName: firstName.trim().replace(/\s+/g, " "),
                    lastName: lastName.trim().replace(/\s+/g, " "),
                    email: emailNorm,
                    phone: phoneE164,
                },
                { meta: { suppressErrorToast: true } } as Parameters<typeof api.post>[2]
            );

            const sentEmail = res.data?.data?.email || emailNorm;
            setSubmittedEmail(sentEmail);
            setPhase("success");
            setSuccessPop(false);
            toast.success("Verification email sent", {
                description: "Open the secure link in your inbox to create your password.",
            });
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string }; status?: number } };
            const message = err.response?.data?.message || "Registration failed. Please try again.";
            toast.error(message);
            if (err.response?.status === 409) {
                setErrors((prev) => ({ ...prev, email: message }));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResend = async () => {
        if (!submittedEmail || isResending || resendCooldown > 0) return;
        setIsResending(true);
        try {
            await api.post(
                "/auth/chat-registration/resend",
                { email: submittedEmail },
                { meta: { suppressErrorToast: true } } as Parameters<typeof api.post>[2]
            );
            toast.success("Setup email resent");
            setResendCooldown(60);
        } catch (error: unknown) {
            const err = error as {
                response?: { data?: { message?: string; data?: { retryAfterSeconds?: number } } };
            };
            const retryAfter = err.response?.data?.data?.retryAfterSeconds;
            if (retryAfter) setResendCooldown(retryAfter);
            toast.error(err.response?.data?.message || "Unable to resend email right now.");
        } finally {
            setIsResending(false);
        }
    };

    if (phase === "success") {
        return (
            <div className="space-y-5 animate-slide-up">
                <style>{`
                    @keyframes manual-reg-success-pop {
                        0% { transform: scale(0.6); opacity: 0; }
                        70% { transform: scale(1.08); opacity: 1; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    @keyframes manual-reg-success-ring {
                        0% { transform: scale(0.85); opacity: 0; }
                        100% { transform: scale(1.35); opacity: 0; }
                    }
                `}</style>

                <div className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-slate-950/95 via-emerald-950/40 to-black/95 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_80px_-36px_rgba(16,185,129,0.35)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
                    <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
                        <span
                            className={cn(
                                "absolute inset-0 rounded-full border border-emerald-400/30",
                                successPop && "animate-[manual-reg-success-ring_1.1s_ease-out_forwards]"
                            )}
                        />
                        <div
                            className={cn(
                                "flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30",
                                successPop && "animate-[manual-reg-success-pop_0.55s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
                            )}
                        >
                            <CheckCircle2 className="h-8 w-8" strokeWidth={2.25} />
                        </div>
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/80">Account pending</p>
                    <h2 className="mt-2 text-xl font-black tracking-tight text-white">Check your inbox</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                        We sent a secure password setup link to{" "}
                        <span className="font-semibold text-white/85">{maskEmail(submittedEmail)}</span>. Open it on this
                        device to finish creating your account. Your password is never set on this page.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleResend}
                        disabled={isResending || resendCooldown > 0}
                        className="h-11 flex-1 rounded-2xl border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                    >
                        {isResending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                    </Button>
                    <Button
                        type="button"
                        onClick={onSignIn}
                        className="h-11 flex-1 rounded-2xl bg-orange-600 font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-500"
                    >
                        Back to sign in
                    </Button>
                </div>

                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                    Did not receive it? Check spam or wait a minute, then resend.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up" noValidate>
            <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-black/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                <div className="relative flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 transition-colors hover:border-orange-400/40 hover:text-white"
                        aria-label="Back to AI onboarding"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400">Manual setup</p>
                        <p className="text-sm font-semibold text-white">Create your account — no password yet</p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600/20 text-orange-400">
                        <Sparkles className="h-4 w-4" />
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <FloatingLabelField
                    id="manual-reg-first-name"
                    label="First name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(v) => {
                        setFirstName(v);
                        if (touched.firstName) runFieldValidation("firstName");
                    }}
                    onBlur={() => {
                        setTouched((t) => ({ ...t, firstName: true }));
                        runFieldValidation("firstName");
                    }}
                    error={touched.firstName ? errors.firstName : undefined}
                    disabled={isSubmitting}
                />
                <FloatingLabelField
                    id="manual-reg-last-name"
                    label="Last name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(v) => {
                        setLastName(v);
                        if (touched.lastName) runFieldValidation("lastName");
                    }}
                    onBlur={() => {
                        setTouched((t) => ({ ...t, lastName: true }));
                        runFieldValidation("lastName");
                    }}
                    error={touched.lastName ? errors.lastName : undefined}
                    disabled={isSubmitting}
                />
            </div>

            <FloatingLabelField
                id="manual-reg-email"
                label="Email address"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(v) => {
                    setEmail(v);
                    if (touched.email) runFieldValidation("email");
                }}
                onBlur={() => {
                    setTouched((t) => ({ ...t, email: true }));
                    runFieldValidation("email");
                }}
                error={touched.email ? errors.email : undefined}
                disabled={isSubmitting}
            />

            <div>
                <div
                    className={cn(
                        "rounded-2xl border bg-white/[0.04] p-1 backdrop-blur-md transition-colors duration-300",
                        phoneError && touched.phone
                            ? "border-red-500/60 ring-1 ring-red-500/15"
                            : "border-white/10 focus-within:border-orange-400/55 focus-within:ring-1 focus-within:ring-orange-500/20"
                    )}
                >
                    <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-400">
                        Mobile number
                    </p>
                    <div
                        onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                setTouched((t) => ({ ...t, phone: true }));
                                runFieldValidation("phone");
                            }
                        }}
                    >
                        <RegisterPhoneField
                            countryIso={phoneCountryIso}
                            onCountryIsoChange={(iso) => {
                                setPhoneCountryIso(iso);
                                if (touched.phone) runFieldValidation("phone");
                            }}
                            nationalDigits={phoneNational}
                            onNationalDigitsChange={(v) => {
                                setPhoneNational(v);
                                if (touched.phone) runFieldValidation("phone");
                            }}
                            hasError={Boolean(phoneError && touched.phone)}
                            nationalInputId="manual-reg-phone"
                        />
                    </div>
                </div>
                {touched.phone && phoneError ? (
                    <p className="mt-1.5 px-1 text-xs font-medium text-red-400 animate-slide-up" role="alert">
                        {phoneError}
                    </p>
                ) : null}
            </div>

            <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-2xl bg-orange-600 text-sm font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-500 disabled:opacity-70"
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending secure link…
                    </>
                ) : (
                    <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Continue
                    </>
                )}
            </Button>

            <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400/80" />
                You will set your password only from the secure email link — never on this form.
            </p>
        </form>
    );
}
