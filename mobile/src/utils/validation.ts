/**
 * Core Validation Utilities for AutoSPF+
 * 
 * Provides robust regex, object verifications, and heuristic checkers to
 * ensure reliable UI states and prevent malformed data injections.
 */

export const RegexRules = {
  // E.g., name@example.com (RFC 5322 approximation)
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/,
  
  // Philippine Standard: +639171234567 or 09171234567
  phPhone: /^(?:\+63|0)9[0-9]{9}$/,
  
  // Mirrors backend auth validation: 8+ chars, upper, lower, number, special.
  passwordStrong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/,
};

export const Validation = {
  isValidEmail(email: string): boolean {
    return RegexRules.email.test(email.trim());
  },

  isValidPhone(phone: string): boolean {
    return RegexRules.phPhone.test(phone);
  },

  isStrongPassword(password: string): boolean {
    return RegexRules.passwordStrong.test(password);
  },

  isValidName(name: string): boolean {
    return name.trim().length >= 3;
  },

  /**
   * Validates if an image file size is within acceptable limits.
   * Useful for pre-flight checks before S3/Appwrite bucket uploads.
   * @param sizeInBytes Raw bytes
   * @param maxSizeMB Maximum size in Megabytes (default 10MB)
   */
  isValidImageSize(sizeInBytes: number, maxSizeMB: number = 10): boolean {
    const maxSize = maxSizeMB * 1024 * 1024;
    return sizeInBytes <= maxSize;
  },

  /**
   * Check for acceptable image formats (case-insensitive)
   */
  isValidImageFormat(mimeTypeOrExtension: string): boolean {
    const m = mimeTypeOrExtension.toLowerCase();
    return (
      m.includes('jpeg') ||
      m.includes('jpg') ||
      m.includes('png') ||
      m.includes('webp') // Add webp just in case they have it
    );
  }
};

// ── Granular password rule checkers ──────────────────────────────────
// Each mirrors one clause of RegexRules.passwordStrong / the backend's
// change-password validators, so UI checklists can report per-rule state
// instead of a single pass/fail.
export const PASSWORD_MIN_LENGTH = 8;
const SPECIAL_CHARACTER_PATTERN = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

export function hasMinLength(password: string, minLength: number = PASSWORD_MIN_LENGTH): boolean {
  return password.length >= minLength;
}

export function hasUppercase(password: string): boolean {
  return /[A-Z]/.test(password);
}

export function hasLowercase(password: string): boolean {
  return /[a-z]/.test(password);
}

export function hasNumber(password: string): boolean {
  return /[0-9]/.test(password);
}

export function hasSpecialCharacter(password: string): boolean {
  return SPECIAL_CHARACTER_PATTERN.test(password);
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password.length > 0 && password === confirmPassword;
}

export function isPasswordValid(password: string): boolean {
  return (
    hasMinLength(password) &&
    hasUppercase(password) &&
    hasLowercase(password) &&
    hasNumber(password) &&
    hasSpecialCharacter(password)
  );
}

export type PasswordRequirementKey = 'minLength' | 'uppercase' | 'lowercase' | 'number' | 'specialCharacter';

export interface PasswordRequirement {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
}

/** Ordered checklist used by live password-requirement UIs. */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { key: 'minLength', label: `${PASSWORD_MIN_LENGTH} or more characters`, met: hasMinLength(password) },
    { key: 'uppercase', label: 'One uppercase letter', met: hasUppercase(password) },
    { key: 'lowercase', label: 'One lowercase letter', met: hasLowercase(password) },
    { key: 'number', label: 'One number', met: hasNumber(password) },
    { key: 'specialCharacter', label: 'One special character', met: hasSpecialCharacter(password) },
  ];
}

/**
 * Concise message for an incomplete password. Calls out the special
 * character specifically when it's the only thing missing, since that's
 * the rule people are most likely to overlook.
 */
export function getPasswordRequirementsMessage(password: string): string {
  const missing = getPasswordRequirements(password).filter((r) => !r.met);
  if (missing.length === 0) return '';
  if (missing.length === 1 && missing[0].key === 'specialCharacter') {
    return 'Add at least one special character, such as !, @, #, $, or %.';
  }
  return "Your password doesn't meet all security requirements yet.";
}
