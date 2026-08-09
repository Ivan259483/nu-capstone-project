/**
 * Retired legacy role-promotion utility.
 *
 * It is intentionally impossible to promote an arbitrary email to Administrator
 * through this entry point.
 */

console.error(
  'This legacy Administrator promotion utility is retired. Run `npm run bootstrap:administrator -- inspect` first.',
);
process.exitCode = 1;
