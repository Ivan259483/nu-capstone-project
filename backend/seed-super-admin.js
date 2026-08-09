/**
 * Retired legacy administrator seeder.
 *
 * Administrator provisioning must use the audited, one-time bootstrap workflow.
 * This entry point intentionally performs no database or identity-provider writes.
 */

console.error(
  'This legacy administrator seeder is retired. Run `npm run bootstrap:administrator -- inspect` first.',
);
process.exitCode = 1;
