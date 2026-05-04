/** Emails that never incur login lockout (failed-attempt counter / lockUntil). */
export const LOGIN_LOCKOUT_EXEMPT_EMAILS = new Set(['customer@test.com', 'admin@test.com']);

export const isLoginLockoutExemptEmail = (email) =>
  typeof email === 'string' && LOGIN_LOCKOUT_EXEMPT_EMAILS.has(email.trim().toLowerCase());
