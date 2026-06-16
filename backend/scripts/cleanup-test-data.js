/**
 * AutoSPF+ client-turnover cleanup.
 *
 * Default (read-only):
 *   node scripts/cleanup-test-data.js
 *
 * Actual deletion is intentionally difficult to trigger. It requires:
 *   DRY_RUN=false
 *   BACKUP_CONFIRMED=true
 *   APPROVED_PLAN_HASH=<hash printed by an approved dry run>
 *   an interactive TTY confirmation
 *
 * This script never drops the database and never deletes protected/master data.
 */

import crypto from 'crypto';
import path from 'path';
import readline from 'readline/promises';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIR, '../.env'), override: false });

const DRY_RUN = String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const BACKUP_CONFIRMED = String(process.env.BACKUP_CONFIRMED ?? 'false').toLowerCase() === 'true';
const APPROVED_PLAN_HASH = String(process.env.APPROVED_PLAN_HASH ?? '').trim();
const EXPECTED_DATABASE_NAME = String(process.env.CLEANUP_EXPECTED_DB_NAME ?? 'autospf').trim();

const TEST_CUSTOMER_EMAILS = Object.freeze([
  'customer@test.com',
  'juan@test.com',
  'maria@test.com',
  'pedro@test.com',
]);

const REQUIRED_PRESERVED_CUSTOMER_EMAILS = Object.freeze([
  'ivantadena21@gmail.com',
  'ivantadena89@gmail.com',
]);

// These collections are fully transactional and are cleared in the listed order.
// Dependent records are deleted before orders.
const TRANSACTION_COLLECTIONS = Object.freeze([
  'chatmessages',
  'chatconversations',
  'chatsessions',
  'notifications',
  'activitylogs',
  'aiscans',
  'aiservicerequests',
  'invoicerecords',
  'payments',
  'billings',
  'bookingslotcounters',
  'orders',
]);

// These collections are only cleaned for users selected by the exact email allowlist.
const TEST_CUSTOMER_COLLECTIONS = Object.freeze([
  'accountsetuptokens',
  'otps',
  'customers',
  'vehicles',
  'users',
]);

const PROTECTED_COLLECTIONS = Object.freeze([
  'roles',
  'permissions',
  'services',
  'packages',
  'settings',
  'businesssettings',
  'stores',
  'products',
  'categories',
  'suppliers',
  'supplierorders',
  'inventorytransactions',
  'shopavailabilities',
  'scheduledclosures',
]);

const ASSET_FIELDS = Object.freeze({
  orders: [
    'paymentProofUrl',
    'downpaymentProof',
    'legalCompliance.waiverPdf',
    'legalCompliance.qcPdf',
    'legalCompliance.preServicePhotos',
    'damagePhotos',
    'damageAnnotations.images',
    'photos.before',
    'photos.after',
    'warrantyAndReceipt.warrantyPdf',
    'trackerStageMedia.photoUrl',
  ],
  aiscans: [
    'imageUrls',
    'modelUrl',
    'repairedModelUrl',
    'usdzUrl',
  ],
  aiservicerequests: [
    'modelUrl',
  ],
  invoicerecords: [
    'pdfUrl',
  ],
});

function abort(message) {
  throw new Error(message);
}

function assertStaticSafety() {
  const affected = new Set([...TRANSACTION_COLLECTIONS, ...TEST_CUSTOMER_COLLECTIONS]);
  const overlap = PROTECTED_COLLECTIONS.filter((name) => affected.has(name));

  if (overlap.length > 0) {
    abort(`Protected collection overlap detected: ${overlap.join(', ')}`);
  }

  const preservedOverlap = REQUIRED_PRESERVED_CUSTOMER_EMAILS.filter((email) =>
    TEST_CUSTOMER_EMAILS.includes(email)
  );

  if (preservedOverlap.length > 0) {
    abort(`Required preserved customer email entered the deletion allowlist: ${preservedOverlap.join(', ')}`);
  }
}

function normalizeForHash(value) {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForHash);

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeForHash(value[key]);
        return result;
      }, {});
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

function hashPreview(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function formatFilter(filter) {
  return JSON.stringify(normalizeForHash(filter));
}

function getNestedValues(value, pathParts) {
  if (value == null) return [];
  if (pathParts.length === 0) return Array.isArray(value) ? value.flat(Infinity) : [value];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => getNestedValues(entry, pathParts));
  }

  const [head, ...tail] = pathParts;
  return getNestedValues(value[head], tail);
}

async function countExternalAssetReferences(db) {
  const counts = {};

  for (const [collectionName, fields] of Object.entries(ASSET_FIELDS)) {
    let count = 0;
    const projection = fields.reduce((result, field) => {
      result[field] = 1;
      return result;
    }, {});

    const cursor = db.collection(collectionName).find({}, { projection });
    for await (const document of cursor) {
      for (const field of fields) {
        count += getNestedValues(document, field.split('.'))
          .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
          .length;
      }
    }

    counts[collectionName] = count;
  }

  return counts;
}

async function countLinkedRecords(db, userId) {
  const queries = {
    orders: { customer: userId },
    payments: { customer: userId },
    customers: { user: userId },
    vehicles: { customer: userId },
    aiscans: { customer: userId },
    aiservicerequests: { customer: userId },
    chatconversations: { userId },
    chatsessions: { userId },
    chatmessages: { userId },
    activitylogs: { userId },
    notifications: { recipientUserId: userId },
    accountsetuptokens: { userId },
    otps: { userId },
  };

  const entries = await Promise.all(
    Object.entries(queries).map(async ([collectionName, filter]) => [
      collectionName,
      await db.collection(collectionName).countDocuments(filter),
    ])
  );

  return Object.fromEntries(entries);
}

function buildConditionalFilters(testUserIds) {
  const emailFilter = { $in: [...TEST_CUSTOMER_EMAILS] };
  const userIdFilter = { $in: testUserIds };

  return {
    accountsetuptokens: {
      $or: [
        { userId: userIdFilter },
        { email: emailFilter },
      ],
    },
    otps: {
      $or: [
        { userId: userIdFilter },
        { email: emailFilter },
      ],
    },
    customers: { user: userIdFilter },
    vehicles: { customer: userIdFilter },
    users: {
      _id: userIdFilter,
      email: emailFilter,
      role: 'customer',
    },
  };
}

async function buildPreview(db) {
  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
  );

  const allowlistedUsers = await db.collection('users')
    .find(
      { email: { $in: [...TEST_CUSTOMER_EMAILS] } },
      { projection: { name: 1, email: 1, role: 1, isDeleted: 1, status: 1 } }
    )
    .sort({ email: 1 })
    .toArray();

  const invalidAllowlistMatches = allowlistedUsers.filter((user) => user.role !== 'customer');
  if (invalidAllowlistMatches.length > 0) {
    const matches = invalidAllowlistMatches
      .map((user) => `${user.email} (${user.role || 'missing role'})`)
      .join(', ');
    abort(`Allowlisted email matched a non-customer account: ${matches}`);
  }

  const testUserIds = allowlistedUsers.map((user) => user._id);
  const conditionalFilters = buildConditionalFilters(testUserIds);

  const deletionPlan = [];
  for (const collectionName of TRANSACTION_COLLECTIONS) {
    const filter = {};
    const count = existingCollections.has(collectionName)
      ? await db.collection(collectionName).countDocuments(filter)
      : 0;
    deletionPlan.push({ collectionName, filter, count, scope: 'all transactional documents' });
  }

  for (const collectionName of TEST_CUSTOMER_COLLECTIONS) {
    const filter = conditionalFilters[collectionName];
    const count = existingCollections.has(collectionName)
      ? await db.collection(collectionName).countDocuments(filter)
      : 0;
    deletionPlan.push({ collectionName, filter, count, scope: 'allowlisted test customers only' });
  }

  const unclassifiedCustomers = await db.collection('users')
    .find(
      {
        role: 'customer',
        email: { $nin: [...TEST_CUSTOMER_EMAILS] },
      },
      { projection: { name: 1, email: 1, isDeleted: 1, status: 1 } }
    )
    .sort({ email: 1 })
    .toArray();

  const possibleTestAccounts = unclassifiedCustomers.filter((user) =>
    /(^|[._+-])(test|demo|e2e)([._+@-]|$)|@(test|example)\./i.test(user.email || '')
  );

  const [testUsersWithLinks, unclassifiedWithLinks] = await Promise.all([
    Promise.all(
      allowlistedUsers.map(async (user) => ({
        id: user._id.toHexString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isDeleted: Boolean(user.isDeleted),
        status: user.status,
        linkedRecords: await countLinkedRecords(db, user._id),
      }))
    ),
    Promise.all(
      unclassifiedCustomers.map(async (user) => ({
        id: user._id.toHexString(),
        email: user.email,
        name: user.name,
        isDeleted: Boolean(user.isDeleted),
        status: user.status,
        accountAction: 'PRESERVE',
        linkedTransactionsInGlobalCleanup: await countLinkedRecords(db, user._id),
      }))
    ),
  ]);

  const allUserIds = (await db.collection('users').find({}, { projection: { _id: 1 } }).toArray())
    .map((user) => user._id);

  const [
    orphanedVehicles,
    orphanedCustomerProfiles,
    orphanedOrders,
    activeInventoryReservations,
    inventoryDeductedOrders,
    externalAssetReferences,
  ] = await Promise.all([
    db.collection('vehicles').countDocuments({ customer: { $nin: allUserIds } }),
    db.collection('customers').countDocuments({ user: { $nin: allUserIds } }),
    db.collection('orders').countDocuments({ customer: { $nin: allUserIds } }),
    db.collection('orders').countDocuments({ 'inventoryReservation.status': 'reserved' }),
    db.collection('orders').countDocuments({ inventoryDeductedAt: { $exists: true, $ne: null } }),
    countExternalAssetReferences(db),
  ]);

  const protectedCollections = PROTECTED_COLLECTIONS.map((collectionName) => ({
    collectionName,
    exists: existingCollections.has(collectionName),
    action: 'PRESERVE',
  }));

  const previewPayload = {
    version: 1,
    databaseName: db.databaseName,
    testCustomerEmails: [...TEST_CUSTOMER_EMAILS],
    testUsers: testUsersWithLinks,
    unclassifiedCustomers: unclassifiedWithLinks,
    possibleTestAccounts: possibleTestAccounts.map(({ email }) => email),
    deletionPlan,
    protectedCollections,
    preservedOrphans: {
      vehicles: orphanedVehicles,
      customerProfiles: orphanedCustomerProfiles,
    },
    orphanedOrdersIncludedInTransactionalCleanup: orphanedOrders,
    activeInventoryReservations,
    inventoryDeductedOrders,
    externalAssetReferences,
  };

  return {
    ...previewPayload,
    planHash: hashPreview(previewPayload),
  };
}

function printPreview(preview) {
  console.log('\nAutoSPF+ MongoDB Cleanup Preview');
  console.log('================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (read-only)' : 'ACTUAL DELETE REQUESTED'}`);
  console.log(`Database: ${preview.databaseName}`);
  console.log(`Expected database: ${EXPECTED_DATABASE_NAME}`);

  console.log('\nBackup/export reminder (required before any actual deletion):');
  console.log(
    `  mongodump --uri="$MONGODB_URI" --db="${preview.databaseName}" `
      + `--archive="${preview.databaseName}-pre-cleanup-$(date +%Y%m%d-%H%M%S).archive.gz" --gzip`
  );

  console.log('\nExact affected collections and filters:');
  console.table(
    preview.deletionPlan.map(({ collectionName, scope, count, filter }) => ({
      collection: collectionName,
      scope,
      filter: formatFilter(filter),
      documents: count,
    }))
  );

  console.log('\nAllowlisted customer emails:');
  TEST_CUSTOMER_EMAILS.forEach((email) => {
    const matched = preview.testUsers.find((user) => user.email === email);
    console.log(`  - ${email}: ${matched ? 'MATCHED customer account' : 'not present'}`);
  });

  console.log('\nAllowlisted customer accounts selected for deletion:');
  if (preview.testUsers.length === 0) {
    console.log('  (none)');
  } else {
    for (const user of preview.testUsers) {
      console.log(`  - ${user.email} (${user.name || 'unnamed'}, role=${user.role}, id=${user.id})`);
      console.log(`    linked records: ${JSON.stringify(user.linkedRecords)}`);
    }
  }

  console.log('\nUnclassified customer accounts (accounts/profiles/vehicles preserved):');
  if (preview.unclassifiedCustomers.length === 0) {
    console.log('  (none)');
  } else {
    for (const user of preview.unclassifiedCustomers) {
      const required = REQUIRED_PRESERVED_CUSTOMER_EMAILS.includes(user.email)
        ? ' [REQUIRED PRESERVE]'
        : '';
      console.log(`  - ${user.email} (${user.name || 'unnamed'})${required}`);
      console.log(
        `    globally allowlisted transactional records still affected: `
          + `${JSON.stringify(user.linkedTransactionsInGlobalCleanup)}`
      );
    }
  }

  console.log('\nPossible test accounts not in the allowlist (reported only):');
  if (preview.possibleTestAccounts.length === 0) {
    console.log('  (none)');
  } else {
    preview.possibleTestAccounts.forEach((email) => console.log(`  - ${email}`));
  }

  console.log('\nPreserved orphaned customer data:');
  console.log(`  - vehicles with no current user: ${preview.preservedOrphans.vehicles}`);
  console.log(`  - customer profiles with no current user: ${preview.preservedOrphans.customerProfiles}`);
  console.log(
    `  - orphaned orders included in the approved transactional cleanup: `
      + `${preview.orphanedOrdersIncludedInTransactionalCleanup}`
  );

  console.log('\nInventory safety report:');
  console.log(`  - orders with active reserved inventory: ${preview.activeInventoryReservations}`);
  console.log(`  - orders with inventoryDeductedAt: ${preview.inventoryDeductedOrders}`);
  console.log('  - product inventory quantities will not be changed or restored by this script');

  console.log('\nExternal asset references in records being removed:');
  for (const [collectionName, count] of Object.entries(preview.externalAssetReferences)) {
    console.log(`  - ${collectionName}: ${count}`);
  }
  console.log('  External files and Cloudinary assets are not deleted by this script.');

  console.log('\nProtected/master collections (never deleted by this script):');
  console.log(`  ${preview.protectedCollections.map(({ collectionName }) => collectionName).join(', ')}`);

  console.log('\nApproval fingerprint:');
  console.log(`  APPROVED_PLAN_HASH=${preview.planHash}`);
}

async function confirmActualDeletion(preview) {
  if (preview.activeInventoryReservations > 0) {
    abort(
      `Actual deletion blocked: ${preview.activeInventoryReservations} order(s) have active inventory reservations.`
    );
  }

  if (!APPROVED_PLAN_HASH) {
    abort('Actual deletion blocked: APPROVED_PLAN_HASH is required.');
  }

  if (APPROVED_PLAN_HASH !== preview.planHash) {
    abort(
      `Actual deletion blocked: APPROVED_PLAN_HASH does not match this preview. `
        + `Expected ${preview.planHash}.`
    );
  }

  if (!BACKUP_CONFIRMED) {
    abort('Actual deletion blocked: set BACKUP_CONFIRMED=true only after verifying a backup/export.');
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    abort('Actual deletion blocked: interactive TTY confirmation is required.');
  }

  const confirmationPhrase = `DELETE TEST DATA FROM ${preview.databaseName} ${preview.planHash.slice(0, 12)}`;
  console.log('\nFinal confirmation required.');
  console.log(`Type exactly: ${confirmationPhrase}`);

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Confirmation: ');
    if (answer !== confirmationPhrase) {
      abort('Confirmation phrase did not match. No data was deleted.');
    }
  } finally {
    prompt.close();
  }
}

async function executeDeletion(client, db, approvedPreview) {
  // Rebuild immediately before opening the transaction so changed counts or
  // selections invalidate the approved fingerprint.
  const freshPreview = await buildPreview(db);
  if (freshPreview.planHash !== approvedPreview.planHash) {
    abort(
      `Cleanup preview changed after confirmation. Approved ${approvedPreview.planHash}, `
        + `current ${freshPreview.planHash}. No data was deleted.`
    );
  }

  const session = client.startSession();
  const results = [];

  try {
    await session.withTransaction(async () => {
      for (const entry of freshPreview.deletionPlan) {
        const result = await db.collection(entry.collectionName).deleteMany(entry.filter, { session });
        results.push({
          collection: entry.collectionName,
          expected: entry.count,
          deleted: result.deletedCount,
        });

        if (result.deletedCount !== entry.count) {
          abort(
            `Delete count mismatch for ${entry.collectionName}: `
              + `expected ${entry.count}, deleted ${result.deletedCount}.`
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }

  console.log('\nCleanup committed:');
  console.table(results);
}

async function main() {
  assertStaticSafety();

  const uri = process.env.MONGODB_URI;
  if (!uri) abort('MONGODB_URI is not configured in the environment or backend/.env.');

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    appName: 'autospf-cleanup-test-data',
  });

  try {
    await client.connect();
    const db = client.db();

    if (db.databaseName !== EXPECTED_DATABASE_NAME) {
      abort(
        `Database mismatch: connected to "${db.databaseName}", `
          + `expected "${EXPECTED_DATABASE_NAME}".`
      );
    }

    const preview = await buildPreview(db);
    printPreview(preview);

    if (DRY_RUN) {
      console.log('\nDRY RUN complete. No deleteMany calls were executed and no data was changed.');
      return;
    }

    await confirmActualDeletion(preview);
    await executeDeletion(client, db, preview);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`\nCleanup aborted: ${error.message}`);
  process.exitCode = 1;
});
