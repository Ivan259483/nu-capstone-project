/**
 * The single Apple App Store review account for the Customer mobile app.
 *
 * appreview@autospf.test cannot receive real email (".test" is a reserved,
 * non-routable TLD), so it cannot complete the mandatory login-OTP second
 * factor the normal way. This file only identifies that one address; the
 * fixed code it is allowed to use lives in the APP_REVIEW_LOGIN_OTP_CODE
 * environment variable (see config/environment.js) and is never stored here
 * or on the client. Every other account — customer, sales, office_admin,
 * staff_quality_checker, administrator — always goes through the normal
 * randomly generated, emailed OTP with no special-casing.
 *
 * To remove this mechanism after review, delete APP_REVIEW_LOGIN_OTP_CODE
 * from the backend's environment (Render) and the path below becomes
 * permanently inert without needing a code change or redeploy.
 */
export const APP_REVIEW_ACCOUNT_EMAIL = 'appreview@autospf.test';

export const isAppReviewAccountEmail = (email) =>
  typeof email === 'string' && email.trim().toLowerCase() === APP_REVIEW_ACCOUNT_EMAIL;
