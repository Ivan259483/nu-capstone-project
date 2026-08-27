export const PASSWORD_SPECIAL_CHARACTER_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

/**
 * Mirrors the password policy enforced by the backend change-password endpoints.
 */
export function getPasswordPolicyError(password: string): string | null {
  if (!password) return 'New password is required';
  if (password.length < 8) return 'New password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'New password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'New password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'New password must contain at least one number';
  if (!PASSWORD_SPECIAL_CHARACTER_RE.test(password)) {
    return 'New password must contain at least one special character (e.g. ! @ # *)';
  }
  return null;
}
