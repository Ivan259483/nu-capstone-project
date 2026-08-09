#!/usr/bin/env node

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const getArgument = (name) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
};

const command = String(process.argv[2] || 'inspect').trim().toLowerCase();
const targetEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const sourceEmail = process.env.BOOTSTRAP_ADMIN_MIGRATE_FROM_EMAIL;
const confirmationToken = getArgument('confirm');

const printResult = (label, result) => {
  console.log(`\n${label}`);
  console.log(JSON.stringify(result, null, 2));
};

if (!['inspect', 'provision', 'migrate', 'resend'].includes(command)) {
  console.error('Usage: npm run bootstrap:administrator -- <inspect|provision|migrate|resend> [--confirm=<inspection-token>]');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required. This command never falls back to another database.');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  const {
    inspectBootstrapAdministrator,
    migrateBootstrapAdministratorEmail,
    provisionBootstrapAdministrator,
    resendBootstrapAdministratorVerification,
  } = await import('../services/bootstrapAdministrator.service.js');

  if (command === 'inspect') {
    const plan = await inspectBootstrapAdministrator({
      mode: 'auto',
      targetEmail,
      sourceEmail,
      name: process.env.BOOTSTRAP_ADMIN_NAME,
      initialPassword: process.env.BOOTSTRAP_ADMIN_INITIAL_PASSWORD,
    });
    printResult('Bootstrap Administrator inspection (read-only):', plan);
    if (plan.canApply) {
      console.log(`\nReview this record and then run the explicit '${plan.mode}' command with --confirm=${plan.confirmationToken}`);
    }
  } else if (command === 'provision') {
    const result = await provisionBootstrapAdministrator({
      targetEmail,
      name: process.env.BOOTSTRAP_ADMIN_NAME,
      initialPassword: process.env.BOOTSTRAP_ADMIN_INITIAL_PASSWORD,
      confirmationToken,
    });
    printResult('Bootstrap Administrator provisioning result:', result);
  } else if (command === 'migrate') {
    const result = await migrateBootstrapAdministratorEmail({
      sourceEmail,
      targetEmail,
      confirmationToken,
    });
    printResult('Bootstrap Administrator email migration result:', result);
  } else {
    const plan = await inspectBootstrapAdministrator({ mode: 'resend', targetEmail });
    if (!confirmationToken) {
      printResult('Bootstrap Administrator verification resend inspection (read-only):', plan);
      if (plan.canApply) {
        console.log(`\nReview this record and rerun 'resend' with --confirm=${plan.confirmationToken}`);
      }
    } else {
      const result = await resendBootstrapAdministratorVerification({
        targetEmail,
        confirmationToken,
      });
      printResult('Bootstrap Administrator verification resend result:', result);
    }
  }
} catch (error) {
  console.error(`\nBootstrap Administrator command failed [${error?.code || 'ERROR'}]: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
