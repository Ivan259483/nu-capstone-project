#!/usr/bin/env node

import { config } from '../config/environment.js';
import mongoose from 'mongoose';

const PROTECTED_ADMINISTRATOR_EMAIL = 'ivantadena18@gmail.com';

const abort = (message, code) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

async function main() {
  if (!process.env.MONGODB_URI) {
    abort('MONGODB_URI is required. This migration never falls back to another database.', 'MONGODB_URI_REQUIRED');
  }

  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 10_000 });
  try {
    const [{ default: User }, systemStateModule] = await Promise.all([
      import('../models/user.model.js'),
      import('../services/systemState.service.js'),
    ]);
    const { getSystemState } = systemStateModule;

    const administrator = await User.findOne({
      email: PROTECTED_ADMINISTRATOR_EMAIL,
      role: 'administrator',
      isActive: true,
      isDeleted: { $ne: true },
      isVerified: true,
      status: 'active',
    }).select('_id role isActive isDeleted isVerified status');

    if (!administrator) {
      abort(
        'The configured bootstrap identity is not an active, verified Administrator. No lifecycle owner was changed.',
        'PROTECTED_ADMIN_NOT_FOUND',
      );
    }

    const state = await getSystemState();
    if (state.protectedAdministratorId) {
      if (String(state.protectedAdministratorId) !== String(administrator._id)) {
        abort(
          'A different protected administrator is already stored. Use the authenticated handover workflow.',
          'PROTECTED_ADMIN_ALREADY_ASSIGNED',
        );
      }
      process.stdout.write(`${JSON.stringify({
        success: true,
        changed: false,
        protectedAdministratorId: String(administrator._id),
        mode: state.mode,
        revision: state.revision,
      }, null, 2)}\n`);
      return;
    }

    const updated = await state.constructor.findOneAndUpdate(
      { _id: state._id, protectedAdministratorId: null, revision: state.revision },
      {
        $set: { protectedAdministratorId: administrator._id },
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      abort('System state changed during migration. Rerun after reviewing the stored owner.', 'MIGRATION_CONFLICT');
    }

    process.stdout.write(`${JSON.stringify({
      success: true,
      changed: true,
      protectedAdministratorId: String(administrator._id),
      mode: updated.mode,
      revision: updated.revision,
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    success: false,
    code: error?.code || 'PROTECTED_ADMIN_MIGRATION_FAILED',
    message: error?.message || 'Protected administrator migration failed.',
  })}\n`);
  process.exitCode = 1;
});
