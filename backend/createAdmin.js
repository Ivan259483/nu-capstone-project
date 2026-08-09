/**
 * Retired legacy administrator creator/promoter.
 *
 * Administrator provisioning must use the audited, one-time bootstrap workflow.
 * This entry point intentionally performs no database writes.
 */

console.error(
  'This legacy administrator creator is retired. Run `npm run bootstrap:administrator -- inspect` first.',
);
process.exitCode = 1;
