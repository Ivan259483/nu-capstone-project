// Shared password policy + reuse-rejection contract used by every backend
// endpoint that writes a new password hash (register, forgot/reset password,
// first-time password setup, change password, admin user restore). Having
// one canonical copy prevents the policy rules or the PASSWORD_REUSE
// response shape from silently drifting between call sites.

export const PASSWORD_REUSE_CODE = 'PASSWORD_REUSE';
export const PASSWORD_REUSE_MESSAGE = 'New password must be different from your current password.';

export const PASSWORD_SPECIAL_CHARACTER_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

export function getPasswordPolicyErrors(password = '') {
  const passwordErrors = [];
  if (password.length < 8) passwordErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) passwordErrors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) passwordErrors.push('one number');
  if (!PASSWORD_SPECIAL_CHARACTER_RE.test(password)) passwordErrors.push('one special character');
  return passwordErrors;
}

export function passwordPolicyErrorResponse(passwordErrors) {
  return { success: false, message: `Password must contain: ${passwordErrors.join(', ')}` };
}

export function passwordReuseErrorResponse() {
  return {
    success: false,
    code: PASSWORD_REUSE_CODE,
    errorCode: PASSWORD_REUSE_CODE,
    message: PASSWORD_REUSE_MESSAGE,
  };
}
