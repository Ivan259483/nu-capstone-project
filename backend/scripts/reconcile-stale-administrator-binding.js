#!/usr/bin/env node
/**
 * reconcile-stale-administrator-binding.js
 *
 * One-time CLI tool for clearing a stale systemState.protectedAdministratorId
 * after the referenced Administrator document was accidentally deleted out-of-band.
 *
 * USAGE
 * -----
 *   npm run reconcile:stale-administrator-binding
 *       -- --expected-stale-id=<objectid>
 *       [--inspect-only]
 *       [--confirm=reconcile-stale-binding]
 *
 * The --confirm phrase must be exactly "reconcile-stale-binding".
 * Without it, the script runs in read-only inspect mode regardless of other flags.
 *
 * SAFETY CONTRACT
 * ---------------
 * This script ONLY clears protectedAdministratorId to null.
 * It does not create, promote, or modify any user document.
 * It does not grant Administrator access.
 * After it succeeds, run the bootstrap:administrator provisioning flow to
 * create and bind a new Administrator through the application's own safeguards.
 *
 * NEVER use this script if the expected stale ID resolves to a real user.
 * The service enforces this programmatically, but the operator must also
 * independently verify the intent before running with --confirm.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// ─── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);

const getArg = (name) => {
  const prefix = `--${name}=`;
  const entry = args.find((a) => a.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const expectedStaleId = getArg('expected-stale-id');
const confirmPhrase = getArg('confirm');
const inspectOnly = hasFlag('inspect-only') || !confirmPhrase;

const REQUIRED_CONFIRM_PHRASE = 'reconcile-stale-binding';

// ─── Validation ──────────────────────────────────────────────────────────────

if (!expectedStaleId) {
  process.stderr.write(JSON.stringify({
    success: false,
    code: 'MISSING_EXPECTED_STALE_ID',
    message: '--expected-stale-id=<objectid> is required. This must be the exact ObjectId currently stored as systemState.protectedAdministratorId.',
  }) + '\n');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  process.stderr.write(JSON.stringify({
    success: false,
    code: 'MONGODB_URI_REQUIRED',
    message: 'MONGODB_URI is required. This script never falls back to another database.',
  }) + '\n');
  process.exit(1);
}

if (!inspectOnly && confirmPhrase !== REQUIRED_CONFIRM_PHRASE) {
  process.stderr.write(JSON.stringify({
    success: false,
    code: 'WRONG_CONFIRM_PHRASE',
    message: `The --confirm phrase must be exactly "${REQUIRED_CONFIRM_PHRASE}". Without it, run without --confirm to perform a read-only inspection.`,
  }) + '\n');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const {
    inspectStaleAdministratorBinding,
    reconcileStaleAdministratorBinding,
  } = await import('../services/staleAdministratorBinding.service.js');

  // Always run inspect first and print the snapshot.
  const snapshot = await inspectStaleAdministratorBinding({ expectedStaleId });

  process.stdout.write(JSON.stringify({
    phase: 'inspect',
    snapshot,
  }, null, 2) + '\n');

  if (inspectOnly) {
    if (snapshot.canReconcile) {
      process.stdout.write('\n[INSPECT-ONLY] The binding is stale and reconciliation is authorised.\n');
      process.stdout.write(`Rerun with --confirm=${REQUIRED_CONFIRM_PHRASE} to apply the compare-and-set clear.\n\n`);
    } else if (snapshot.alreadyClear) {
      process.stdout.write('\n[INSPECT-ONLY] protectedAdministratorId is already null. No action needed.\n\n');
    } else {
      process.stdout.write(`\n[INSPECT-ONLY] Reconciliation is NOT authorised: ${snapshot.reasonCode} — ${snapshot.reason}\n\n`);
    }
    return;
  }

  // Apply mode: confirm phrase already validated above.
  if (!snapshot.canReconcile && !snapshot.alreadyClear) {
    process.stderr.write(JSON.stringify({
      success: false,
      phase: 'reconcile',
      code: snapshot.reasonCode,
      message: snapshot.reason,
    }) + '\n');
    process.exitCode = 1;
    return;
  }

  const result = await reconcileStaleAdministratorBinding({ expectedStaleId });

  process.stdout.write(JSON.stringify({
    success: true,
    phase: 'reconcile',
    result,
  }, null, 2) + '\n');

  if (result.reconciled) {
    process.stdout.write('\n✅ Stale binding cleared successfully.\n');
    process.stdout.write('Next step: run `npm run bootstrap:administrator -- inspect` to provision the new Administrator.\n\n');
  } else if (result.alreadyClear) {
    process.stdout.write('\n✅ protectedAdministratorId was already null; no changes made.\n\n');
  }
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    success: false,
    code: error?.code || 'RECONCILE_FAILED',
    message: error?.message || 'Stale administrator binding reconciliation failed.',
  }) + '\n');
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect().catch(() => {});
});
