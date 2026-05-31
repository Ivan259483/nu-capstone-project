import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FloatingLabelField } from "@/components/auth/FloatingLabelField";
import {
    PpfTermsAcceptanceDialog,
    REGISTER_LEGAL_TOAST_MESSAGE,
    RegisterLegalCheckboxes,
    useRegisterLegalAcknowledgement,
} from "@/components/auth/RegisterLegalAcknowledgement";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import { RegisterOtpModal, type RegisterOtpVerifiedPayload } from "@/components/auth/RegisterOtpModal";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseApiUrl } from "@/lib/api";
import { TOKEN_KEY, persistBackendUser, safeLocalStorageSet } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";
import { buildRegisterE164, validateRegisterNationalDigits } from "@/lib/phone";
import { REGISTER_COUNTRY_DIALS } from "@/lib/countries-dial-data";
import { getSafeUserRole } from "@/lib/roles";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;
const REGISTER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

type FieldKey = "firstName" | "lastName" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldKey | "phone", string>>;

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
    if (!password) return "Password is required.";
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

function validateConfirmPassword(password: string, confirmPassword: string): string | undefined {
    if (!confirmPassword) return "Please confirm your password.";
    if (confirmPassword !== password) return "Passwords do not match.";
    return undefined;
}

type ManualRegisterFormProps = {
    onSignIn: () => void;
    onRegistrationComplete: (role: string) => void;
};

export function ManualRegisterForm({ onSignIn, onRegistrationComplete }: ManualRegisterFormProps) {
    const { setAuthUser } = useAuth();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPasswords, setShowPasswords] = useState(false);
    const [phoneCountryIso, setPhoneCountryIso] = useState("PH");
    const [phoneNational, setPhoneNational] = useState("");
    const [errors, setErrors] = useState<FieldErrors>({});
    const [touched, setTouched] = useState<Partial<Record<FieldKey | "phone", boolean>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [otpOpen, setOtpOpen] = useState(false);
    const [otpEmail, setOtpEmail] = useState("");
    const [otpExpiresIn, setOtpExpiresIn] = useState(600);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);
    const legal = useRegisterLegalAcknowledgement();

    const showFieldError = useCallback(
        (key: FieldKey | "phone") => attemptedSubmit || Boolean(touched[key]),
        [attemptedSubmit, touched]
    );

    const dial = useMemo(
        () => REGISTER_COUNTRY_DIALS.find((c) => c.iso === phoneCountryIso)?.dial ?? "63",
        [phoneCountryIso]
    );

    const pwRules = useMemo(() => registerPasswordRules(password), [password]);
    const pwAllValid = useMemo(
        () => pwRules.length && pwRules.upper && pwRules.lower && pwRules.number && pwRules.special,
        [pwRules]
    );
    const pwStrength = useMemo(() => registerPasswordStrength(password, pwRules), [password, pwRules]);
    const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

    const phoneError = useMemo(() => {
        if (!phoneNational.replace(/\D/g, "").length) {
            return touched.phone ? "Phone number is required." : undefined;
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
            password: () => registerPasswordPolicyError(password) || undefined,
            confirmPassword: () => validateConfirmPassword(password, confirmPassword),
        }),
        [confirmPassword, email, firstName, lastName, password, phoneError]
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

    const scrollToFirstInvalid = useCallback((nextErrors: FieldErrors) => {
        const order: { key: FieldKey | "phone"; id: string }[] = [
            { key: "firstName", id: "manual-reg-first-name" },
            { key: "lastName", id: "manual-reg-last-name" },
            { key: "email", id: "manual-reg-email" },
            { key: "phone", id: "manual-reg-phone" },
            { key: "password", id: "manual-reg-password" },
            { key: "confirmPassword", id: "manual-reg-confirm-password" },
        ];
        const target = order.find(({ key }) => nextErrors[key]);
        if (!target) return;
        window.requestAnimationFrame(() => {
            document.getElementById(target.id)?.focus({ preventScroll: true });
            document.getElementById(target.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    }, []);

    useEffect(() => {
        if (touched.confirmPassword && confirmPassword) {
            runFieldValidation("confirmPassword");
        }
    }, [password, confirmPassword, touched.confirmPassword, runFieldValidation]);

    const canSubmit =
        legal.legalAcknowledged &&
        pwAllValid &&
        passwordsMatch &&
        confirmPassword.length > 0 &&
        !isSubmitting &&
        !otpOpen;

    const applyVerifiedSession = useCallback(
        (payload: RegisterOtpVerifiedPayload) => {
            const normalizedRole = getSafeUserRole(payload.role);
            const backendUser = payload.user;
            safeLocalStorageSet(TOKEN_KEY, payload.token);
            persistBackendUser({ ...backendUser, role: normalizedRole });
            setAuthUser({
                id: String(backendUser.id || backendUser._id || ""),
                _id: String(backendUser._id || backendUser.id || ""),
                email: String(backendUser.email || otpEmail),
                name: String(backendUser.name || ""),
                role: normalizedRole,
                createdAt: String(backendUser.createdAt || new Date().toISOString()),
                password: "",
                isActive: (backendUser.isActive as boolean) ?? true,
                lastActive: String(backendUser.lastActive || new Date().toISOString()),
                avatar: backendUser.avatar as string | undefined,
                phone: backendUser.phone as string | undefined,
            });
            setOtpOpen(false);
            onRegistrationComplete(normalizedRole);
        },
        [onRegistrationComplete, otpEmail, setAuthUser]
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextErrors: FieldErrors = {};
        (["firstName", "lastName", "email", "phone", "password", "confirmPassword"] as const).forEach((key) => {
            const message = fieldValidators[key]();
            if (message) nextErrors[key] = message;
        });
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setTouched({
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                password: true,
                confirmPassword: true,
            });
            setAttemptedSubmit(true);
            toast.error("Please complete all required fields.");
            scrollToFirstInvalid(nextErrors);
            return;
        }
        setErrors({});
        if (!legal.legalAcknowledged) {
            toast.error(REGISTER_LEGAL_TOAST_MESSAGE);
            return;
        }

        const emailNorm = email.trim().toLowerCase();
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
        const phoneE164 = buildRegisterE164(dial, phoneNational);

        setIsSubmitting(true);
        try {
            const res = await fetch(`${getBaseApiUrl()}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: fullName,
                    email: emailNorm,
                    password,
                    phone: phoneE164,
                }),
                signal: AbortSignal.timeout(20000),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                const message = data.message || "Registration failed. Please try again.";
                toast.error(message);
                if (res.status === 409) {
                    setErrors((prev) => ({ ...prev, email: message }));
                }
                return;
            }

            const sentEmail = (data.data?.email as string) || emailNorm;
            const expiresIn = typeof data.data?.expiresIn === "number" ? data.data.expiresIn : 600;
            if (data.data?.requiresOtp === false) {
                toast.error("This account is already verified. Please sign in.");
                return;
            }

            setOtpEmail(sentEmail);
            setOtpExpiresIn(expiresIn);
            setOtpOpen(true);
            toast.success("Verification code sent", {
                description: "Enter the 6-digit code we emailed you to finish signing up.",
            });
        } catch {
            toast.error("Registration failed. Check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOtpVerified = async (payload: RegisterOtpVerifiedPayload) => {
        await signOut(auth).catch(() => {});
        applyVerifiedSession(payload);
    };

    return (
        <>
            <form
                onSubmit={handleSubmit}
                className="max-h-[min(calc(100dvh-13rem),42rem)] space-y-2 overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15"
                noValidate
            >
                {attemptedSubmit && Object.keys(errors).length > 0 ? (
                    <p
                        className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] leading-snug text-red-300"
                        role="status"
                    >
                        Some fields need your attention — check the items marked below.
                    </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                    <FloatingLabelField
                        compactError
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
                        error={showFieldError("firstName") ? errors.firstName : undefined}
                        disabled={isSubmitting || otpOpen}
                    />
                    <FloatingLabelField
                        compactError
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
                            error={showFieldError("lastName") ? errors.lastName : undefined}
                        disabled={isSubmitting || otpOpen}
                    />
                </div>

                <FloatingLabelField
                    compactError
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
                        error={showFieldError("email") ? errors.email : undefined}
                    disabled={isSubmitting || otpOpen}
                />

                <div
                    className={cn(
                        "relative overflow-hidden rounded-2xl border bg-white/[0.04] backdrop-blur-md transition-colors",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                        phoneError && touched.phone
                            ? "border-red-500/60 ring-1 ring-red-500/15"
                            : "border-white/10 focus-within:border-orange-400/55 focus-within:ring-1 focus-within:ring-orange-500/20"
                    )}
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setTouched((t) => ({ ...t, phone: true }));
                            runFieldValidation("phone");
                        }
                    }}
                >
                    <span className="pointer-events-none absolute left-4 top-2 z-[1] text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-400/90">
                        Phone number
                    </span>
                    <div className="px-4 pb-2.5 pt-6">
                        <RegisterPhoneField
                            embedded
                            placeholder=""
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
                {showFieldError("phone") && phoneError ? (
                    <p className="-mt-1.5 px-1 text-[11px] leading-tight font-medium text-red-400" role="alert">
                        {phoneError}
                    </p>
                ) : null}

                <FloatingLabelField
                    compactError
                    id="manual-reg-password"
                    label="Password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(v) => {
                        setPassword(v);
                        if (touched.password) runFieldValidation("password");
                    }}
                    onBlur={() => {
                        setTouched((t) => ({ ...t, password: true }));
                        runFieldValidation("password");
                    }}
                    error={showFieldError("password") ? errors.password : undefined}
                    disabled={isSubmitting || otpOpen}
                    className="pr-11"
                    endAdornment={
                        <button
                            type="button"
                            className="text-white/45 hover:text-white/80"
                            onClick={() => setShowPasswords((v) => !v)}
                            aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                            tabIndex={-1}
                        >
                            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    }
                />

                <FloatingLabelField
                    compactError
                    id="manual-reg-confirm-password"
                    label="Confirm password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(v) => {
                        setConfirmPassword(v);
                        if (touched.confirmPassword) runFieldValidation("confirmPassword");
                    }}
                    onBlur={() => {
                        setTouched((t) => ({ ...t, confirmPassword: true }));
                        runFieldValidation("confirmPassword");
                    }}
                    error={showFieldError("confirmPassword") ? errors.confirmPassword : undefined}
                    disabled={isSubmitting || otpOpen}
                    className="pr-11"
                    endAdornment={
                        showFieldError("confirmPassword") && passwordsMatch && !errors.confirmPassword ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                        ) : (
                            <button
                                type="button"
                                className="text-white/45 hover:text-white/80"
                                onClick={() => setShowPasswords((v) => !v)}
                                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                                tabIndex={-1}
                            >
                                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        )
                    }
                />

                {password.length > 0 && pwStrength ? (
                    <p className={cn("px-0.5 text-[11px] font-semibold", pwStrength.textClass)}>
                        Password strength: {pwStrength.text}
                    </p>
                ) : null}

                {password.length > 0 && !pwAllValid ? (
                    <div className="flex flex-wrap gap-1.5 px-0.5">
                        {(
                            [
                                [pwRules.length, "8+ chars"],
                                [pwRules.upper, "A–Z"],
                                [pwRules.lower, "a–z"],
                                [pwRules.number, "0–9"],
                                [pwRules.special, "!@#…"],
                            ] as const
                        ).map(([met, label]) => (
                            <span
                                key={label}
                                className={cn(
                                    "rounded-md px-2 py-0.5 text-[10px] font-medium ring-1",
                                    met
                                        ? "bg-orange-500/15 text-orange-200/90 ring-orange-500/25"
                                        : "bg-white/[0.03] text-white/35 ring-white/10"
                                )}
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                ) : null}

                <div className="space-y-2.5 pt-0.5">
                    <RegisterLegalCheckboxes
                        idPrefix="manual-reg"
                        submitActionLabel="Create Account"
                        ppfTermsAgreed={legal.ppfTermsAgreed}
                        setPpfTermsAgreed={legal.setPpfTermsAgreed}
                        registerWebsiteTermsAgreed={legal.registerWebsiteTermsAgreed}
                        setRegisterWebsiteTermsAgreed={legal.setRegisterWebsiteTermsAgreed}
                        onOpenPpfTermsModal={legal.openPpfTermsModal}
                    />

                    <Button
                        type="submit"
                        disabled={!canSubmit}
                        className="h-12 w-full rounded-2xl bg-orange-600 text-sm font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-500 disabled:opacity-60"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending verification code…
                            </>
                        ) : (
                            <>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Create Account
                            </>
                        )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                        Already have an account?{" "}
                        <button
                            type="button"
                            onClick={onSignIn}
                            className="font-semibold text-orange-500 hover:text-orange-400"
                        >
                            Sign in
                        </button>
                    </p>
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
            </form>

            <RegisterOtpModal
                open={otpOpen}
                email={otpEmail}
                expiresInSeconds={otpExpiresIn}
                onOpenChange={setOtpOpen}
                onVerified={(payload) => void handleOtpVerified(payload)}
            />
        </>
    );
}
