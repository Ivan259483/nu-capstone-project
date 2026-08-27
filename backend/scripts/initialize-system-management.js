#!/usr/bin/env node

import 'dotenv/config';
import mongoose from 'mongoose';

const fail = (message, code) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const assertTransactionalTopology = async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const sessionsAvailable = Number.isFinite(Number(hello.logicalSessionTimeoutMinutes));
  const transactionalTopology = Boolean(hello.setName || hello.msg === 'isdbgrid');
  if (!sessionsAvailable || !transactionalTopology) {
    fail(
      'System Management requires a MongoDB replica set or sharded cluster with transaction support.',
      'TRANSACTIONS_REQUIRED',
    );
  }
};

async function main() {
  if (!process.env.MONGODB_URI) {
    fail('MONGODB_URI is required. Initialization never falls back to another database.', 'MONGODB_URI_REQUIRED');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    await assertTransactionalTopology();

    const modules = await Promise.all([
      import('../models/systemState.model.js'),
      import('../models/systemOperation.model.js'),
      import('../models/systemBackup.model.js'),
      import('../models/systemDataClassification.model.js'),
      import('../models/managedAsset.model.js'),
      import('../models/externalCleanupJob.model.js'),
      import('../models/paymentReconciliationEvent.model.js'),
      import('../models/systemMutationAdmission.model.js'),
      import('../models/user.model.js'),
      import('../models/vehicle.model.js'),
      import('../models/order.model.js'),
      import('../models/notification.model.js'),
      import('../models/activityLog.model.js'),
      import('../models/aiScan.model.js'),
      import('../models/aIServiceRequest.model.js'),
      import('../models/chatConversation.model.js'),
      import('../models/chatSession.model.js'),
      import('../models/supplierOrder.model.js'),
      import('../models/inventoryTransaction.model.js'),
    ]);
    const models = modules.map(({ default: model }) => model);
    await Promise.all(models.map((model) => model.createIndexes()));

    const { getSystemState } = await import('../services/systemState.service.js');
    const state = await getSystemState();
    const expectedInitialMode = process.env.NODE_ENV === 'production' ? 'demo' : 'development';
    if (!state.protectedAdministratorId) {
      process.stderr.write(
        '[System Management] Protected administrator is not bound yet; run migrate:protected-administrator next.\n',
      );
    }

    process.stdout.write(`${JSON.stringify({
      success: true,
      mode: state.mode,
      expectedInitialMode,
      modeMatchesEnvironmentDefault: state.mode === expectedInitialMode,
      protectedAdministratorInitialized: Boolean(state.protectedAdministratorId),
      transactionalTopology: true,
      indexedCollections: models.map((model) => model.collection.collectionName).sort(),
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    success: false,
    code: error?.code || 'SYSTEM_MANAGEMENT_INITIALIZATION_FAILED',
    message: error?.message || 'System Management initialization failed.',
  })}\n`);
  process.exitCode = 1;
});
