/** No account, including demo and administrator accounts, bypasses lockout. */
export const LOGIN_LOCKOUT_EXEMPT_EMAILS = new Set();

export const isLoginLockoutExemptEmail = (email) =>
  typeof email === 'string' && LOGIN_LOCKOUT_EXEMPT_EMAILS.has(email.trim().toLowerCase());
