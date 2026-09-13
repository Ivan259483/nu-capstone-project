/**
 * The single Apple App Store review account for the Customer mobile app.
 *
 * appreview@autospf.test cannot receive real email (".test" is a reserved,
 * non-routable TLD), so it can never complete the mandatory login-OTP second
 * factor. This file only identifies that one address; whether it actually
 * skips OTP is controlled entirely by the APP_REVIEW_LOGIN_ENABLED
 * environment variable (see config/environment.js, checked in
 * controllers/auth.controller.js's login()). Every other account —
 * customer, sales, office_admin, staff_quality_checker, administrator —
 * always goes through the normal password + emailed-OTP flow with no
 * special-casing, and so does this account whenever the flag is off.
 *
 * To remove this mechanism after review, delete APP_REVIEW_LOGIN_ENABLED
 * from the backend's environment (Render) and the path becomes permanently
 * inert without needing a code change or redeploy.
 */
export const APP_REVIEW_ACCOUNT_EMAIL = 'appreview@autospf.test';

export const isAppReviewAccountEmail = (email) =>
  typeof email === 'string' && email.trim().toLowerCase() === APP_REVIEW_ACCOUNT_EMAIL;
