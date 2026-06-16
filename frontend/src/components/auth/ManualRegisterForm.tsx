import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FloatingLabelField } from "@/components/auth/FloatingLabelField";
import {
    PpfTermsAcceptanceDialog,
    RegisterLegalCheckboxes,
    useRegisterLegalAcknowledgement,
} from "@/components/auth/RegisterLegalAcknowledgement";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import { RegisterOtpModal, type RegisterOtpVerifiedPayload } from "@/components/auth/RegisterOtpModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getBaseApiUrl } from "@/lib/api";
import {
    registerPasswordPolicyError,
    registerPasswordRules,
    registerPasswordStrength,
    validateConfirmPassword,
    validateEmail,
    validateFirstName,
    validateLastName,
} from "@/lib/register-validation";
import { TOKEN_KEY, persistBackendUser, safeLocalStorageSet } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";
import {
    AUTH_FLOATING_INPUT_ERROR_CLASS,
    AUTH_FLOATING_INPUT_SHELL_CLASS,
} from "@/components/auth/authInputStyles";
import { buildRegisterE164, validateRegisterNationalDigits } from "@/lib/phone";
import { REGISTER_COUNTRY_DIALS } from "@/lib/countries-dial-data";
import { getSafeUserRole } from "@/lib/roles";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebase";

type FieldKey = "firstName" | "lastName" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldKey | "phone", string>>;

function phoneValidationMessage(
    code: "ph_mobile" | "invalid_length" | undefined,
    t: (path: string) => string
): string | undefined {
    if (!code) return undefined;
    if (code === "ph_mobile") return t("validation.phPhone");
    return t("validation.phoneLength");
}

type ManualRegisterFormProps = {
    onRegistrationComplete: (role: string) => void;
};

export function ManualRegisterForm({ onRegistrationComplete }: ManualRegisterFormProps) {
    const { t } = useLanguage();
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
    const pwStrength = useMemo(() => registerPasswordStrength(password, pwRules, t), [password, pwRules, t]);
    const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

    const phoneError = useMemo(() => {
        if (!phoneNational.replace(/\D/g, "").length) {
            return touched.phone ? t("validation.phoneRequired") : undefined;
        }
        const check = validateRegisterNationalDigits(dial, phoneNational);
        return check.ok ? undefined : phoneValidationMessage(check.code, t);
    }, [dial, phoneNational, touched.phone, t]);

    const fieldValidators = useMemo(
        () => ({
            firstName: () => validateFirstName(firstName, t),
            lastName: () => validateLastName(lastName, t),
            email: () => validateEmail(email, t),
            phone: () => phoneError,
            password: () => registerPasswordPolicyError(password, t) || undefined,
            confirmPassword: () => validateConfirmPassword(password, confirmPassword, t),
        }),
        [confirmPassword, email, firstName, lastName, password, phoneError, t]
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
            toast.error(t("validation.fillRequired"));
            scrollToFirstInvalid(nextErrors);
            return;
        }
        setErrors({});
        if (!legal.legalAcknowledged) {
            toast.error(t("register.legalRequiredToast"));
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
                const message = data.message || t("auth.registrationFailedGeneric");
                toast.error(message);
                if (res.status === 409) {
                    setErrors((prev) => ({ ...prev, email: message }));
                }
                return;
            }

            const sentEmail = (data.data?.email as string) || emailNorm;
            const expiresIn = typeof data.data?.expiresIn === "number" ? data.data.expiresIn : 600;
            if (data.data?.requiresOtp === false) {
                toast.error(t("auth.alreadyVerified"));
                return;
            }

            setOtpEmail(sentEmail);
            setOtpExpiresIn(expiresIn);
            setOtpOpen(true);
            toast.success(t("auth.codeSentSignup"), {
                description: t("auth.codeSentSignupDesc"),
            });
        } catch {
            toast.error(t("auth.networkError"));
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
                className="mx-auto max-h-[min(calc(100dvh-13.25rem),39rem)] w-full space-y-3.5 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
                noValidate
            >
                {attemptedSubmit && Object.keys(errors).length > 0 ? (
                    <p
                        className="rounded-[14px] border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-[11px] leading-snug text-red-300"
                        role="status"
                    >
                        {t("register.summaryError")}
                    </p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                    <FloatingLabelField
                        compactError
                        id="manual-reg-first-name"
                        label={t("register.firstName")}
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
                        label={t("register.lastName")}
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
                    label={t("register.email")}
                    type="email"
                    placeholder="name@example.com"
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
                        AUTH_FLOATING_INPUT_SHELL_CLASS,
                        "px-4 pb-2 pt-5",
                        phoneError && touched.phone && AUTH_FLOATING_INPUT_ERROR_CLASS
                    )}
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setTouched((t) => ({ ...t, phone: true }));
                            runFieldValidation("phone");
                        }
                    }}
                >
                    <span className="pointer-events-none absolute left-4 top-1.5 z-[1] bg-transparent text-[11px] font-medium text-zinc-400 shadow-none">
                        {t("register.phone")}
                    </span>
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
                {showFieldError("phone") && phoneError ? (
                    <p className="-mt-1.5 px-1 text-[11px] font-medium leading-tight text-red-400" role="alert">
                        {phoneError}
                    </p>
                ) : null}

                <FloatingLabelField
                    compactError
                    id="manual-reg-password"
                    label={t("register.password")}
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
                            className="text-zinc-500 transition-colors hover:text-zinc-200"
                            onClick={() => setShowPasswords((v) => !v)}
                            aria-label={showPasswords ? t("register.hidePasswords") : t("register.showPasswords")}
                            tabIndex={-1}
                        >
                            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    }
                />

                <FloatingLabelField
                    compactError
                    id="manual-reg-confirm-password"
                    label={t("register.confirmPassword")}
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
                                className="text-zinc-500 transition-colors hover:text-zinc-200"
                                onClick={() => setShowPasswords((v) => !v)}
                                aria-label={showPasswords ? t("register.hidePasswords") : t("register.showPasswords")}
                                tabIndex={-1}
                            >
                                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        )
                    }
                />

                {password.length > 0 && pwStrength ? (
                    <p className="px-1 text-[11px] font-semibold text-zinc-400">
                        {t("register.strengthLabel")} {pwStrength.text}
                    </p>
                ) : null}

                {password.length > 0 && !pwAllValid ? (
                    <div className="flex flex-wrap gap-1.5 px-1">
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
                                        ? "bg-white/[0.09] text-zinc-200 ring-white/15"
                                        : "bg-white/[0.025] text-slate-500 ring-white/10"
                                )}
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                ) : null}

                <div className="space-y-3 pt-0.5">
                    <RegisterLegalCheckboxes
                        idPrefix="manual-reg"
                        ppfTermsAgreed={legal.ppfTermsAgreed}
                        setPpfTermsAgreed={legal.setPpfTermsAgreed}
                        registerWebsiteTermsAgreed={legal.registerWebsiteTermsAgreed}
                        setRegisterWebsiteTermsAgreed={legal.setRegisterWebsiteTermsAgreed}
                        onOpenPpfTermsModal={legal.openPpfTermsModal}
                    />

                    <Button
                        type="submit"
                        disabled={!canSubmit}
                        className="h-[46px] w-full rounded-[14px] border border-white/[0.085] bg-zinc-950/70 text-sm font-semibold text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_18px_48px_-36px_rgba(255,255,255,0.24)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-black/80 hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_22px_58px_-38px_rgba(255,255,255,0.28)] disabled:translate-y-0 disabled:!opacity-100 disabled:border-white/[0.12] disabled:bg-white/[0.045] disabled:text-zinc-300 disabled:shadow-[inset_0_1px_0_rgba(255,255,255,0.065),0_16px_42px_-36px_rgba(255,255,255,0.22)]"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("register.sendingCode")}
                            </>
                        ) : (
                            t("register.createAccount")
                        )}
                    </Button>
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
