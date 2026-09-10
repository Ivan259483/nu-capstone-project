import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env'), override: false });

const fail = (message) => {
  throw new Error(message);
};

const samePartialStringIndex = (index, field) => (
  index?.unique === true
  && index?.partialFilterExpression?.[field]?.$type === 'string'
);

const assertNoDuplicateStrings = async (collection, field) => {
  const duplicates = await collection.aggregate([
    { $match: { [field]: { $type: 'string' } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicates.length) fail(`Duplicate string values prevent rebuilding ${field}_1.`);
};

const reconcileOptionalUniqueStringIndex = async (collection, field) => {
  const name = `${field}_1`;
  const indexes = await collection.indexes();
  const current = indexes.find((index) => index.name === name);
  if (samePartialStringIndex(current, field)) {
    console.log(`[payment-indexes] ${name} already uses the required string-only partial filter.`);
    return;
  }

  await assertNoDuplicateStrings(collection, field);
  if (current) await collection.dropIndex(name);
  await collection.createIndex(
    { [field]: 1 },
    {
      name,
      unique: true,
      partialFilterExpression: { [field]: { $type: 'string' } },
    },
  );
  console.log(`[payment-indexes] Rebuilt ${name} with a string-only partial filter.`);
};

async function migrate() {
  if (!process.env.MONGODB_URI) fail('MONGODB_URI is not configured.');
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: false,
    autoCreate: false,
  });

  try {
    const [{ default: Order }, { default: Payment }] = await Promise.all([
      import('../models/order.model.js'),
      import('../models/payment.model.js'),
    ]);
    const collections = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray())
      .map((entry) => entry.name);
    if (!collections.includes(Payment.collection.collectionName)) {
      fail('Payments collection does not exist.');
    }

    await reconcileOptionalUniqueStringIndex(Payment.collection, 'checkoutReference');
    await reconcileOptionalUniqueStringIndex(Payment.collection, 'paymentReference');
    await Order.createIndexes();
    console.log('[payment-indexes] Booking request idempotency index is present.');
  } finally {
    await mongoose.disconnect();
  }
}

migrate().catch((error) => {
  console.error(`[payment-indexes] Migration failed: ${error?.message || error}`);
  process.exitCode = 1;
});
