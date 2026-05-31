const REGISTER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

export type TranslateFn = (path: string) => string;

export function registerPasswordRules(password: string) {
    return {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: REGISTER_PASSWORD_SPECIAL_RE.test(password),
    };
}

export function registerPasswordPolicyError(password: string, t: TranslateFn): string | null {
    if (!password) return t("validation.passwordRequired");
    if (password.length < 8) return t("validation.passwordMin");
    if (!/[A-Z]/.test(password)) return t("validation.passwordUpper");
    if (!/[a-z]/.test(password)) return t("validation.passwordLower");
    if (!/[0-9]/.test(password)) return t("validation.passwordNumber");
    if (!REGISTER_PASSWORD_SPECIAL_RE.test(password)) return t("validation.passwordSpecial");
    return null;
}

export function registerPasswordStrength(
    password: string,
    rules: ReturnType<typeof registerPasswordRules>,
    t: TranslateFn
): { text: string; barClass: string; textClass: string } | null {
    if (!password.length) return null;
    const met = [rules.length, rules.upper, rules.lower, rules.number, rules.special].filter(Boolean).length;
    if (met < 3)
        return { text: t("validation.strengthWeak"), barClass: "bg-gradient-to-r from-slate-600 to-slate-500", textClass: "text-slate-400" };
    if (met < 5)
        return { text: t("validation.strengthMedium"), barClass: "bg-gradient-to-r from-orange-800 to-orange-600", textClass: "text-orange-300" };
    if (password.length >= 12)
        return {
            text: t("validation.strengthVeryStrong"),
            barClass: "bg-gradient-to-r from-orange-400 to-amber-300",
            textClass: "text-orange-200",
        };
    return { text: t("validation.strengthStrong"), barClass: "bg-gradient-to-r from-orange-600 to-orange-400", textClass: "text-orange-200" };
}

export function validateFirstName(value: string, t: TranslateFn): string | undefined {
    const v = value.trim().replace(/\s+/g, " ");
    if (!v) return t("validation.firstNameRequired");
    if (v.length > 40) return t("validation.firstNameMax");
    if (!NAME_PART_REGEX.test(v)) return t("validation.firstNameInvalid");
    return undefined;
}

export function validateLastName(value: string, t: TranslateFn): string | undefined {
    const v = value.trim().replace(/\s+/g, " ");
    if (!v) return t("validation.lastNameRequired");
    if (v.length > 40) return t("validation.lastNameMax");
    if (!NAME_PART_REGEX.test(v)) return t("validation.lastNameInvalid");
    return undefined;
}

export function validateEmail(value: string, t: TranslateFn): string | undefined {
    const v = value.trim().toLowerCase();
    if (!v) return t("validation.emailRequired");
    if (!EMAIL_REGEX.test(v)) return t("validation.emailInvalid");
    return undefined;
}

export function validateConfirmPassword(password: string, confirmPassword: string, t: TranslateFn): string | undefined {
    if (!confirmPassword) return t("validation.confirmRequired");
    if (confirmPassword !== password) return t("validation.passwordMismatch");
    return undefined;
}
