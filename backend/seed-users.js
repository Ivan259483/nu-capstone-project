/**
 * Retired legacy demo-user seeder.
 *
 * The old script reset passwords, promoted roles, and marked staff accounts as
 * verified. Those operations bypass the verification-link and login-OTP flows,
 * so this entry point now fails closed without touching the database.
 */

console.error(
  'This legacy user seeder is retired. Run `npm run bootstrap:administrator -- inspect` for Administrator provisioning.',
);
process.exitCode = 1;
