/**
 * Idempotent AES key-rotation migration.
 *
 * Dry run (default): npm run migrate:encryption-key
 * Apply after a verified backup: npm run migrate:encryption-key -- --apply
 *
 * The script never logs keys, plaintext, ciphertext, record IDs, or field
 * values. Each replacement is re-decrypted and compared before an atomic,
 * compare-and-set update preserves the original value on any failure/race.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env'), override: false });

const COLLECTIONS = Object.freeze([
  {
    name: 'users',
    fields: ['phone', 'address', 'phoneNumber', 'contactNumber', 'mobileNumber', 'contactNo'],
  },
  {
    name: 'orders',
    fields: [
      'vehiclePlate',
      'shippingAddress',
      'notes',
      'legalCompliance.waiverSignature',
      'legalCompliance.damageNotes',
      'warrantyAndReceipt.customerSignature',
    ],
  },
  {
    name: 'chatconversations',
    fields: ['customerPhone'],
  },
]);

const getPath = (object, dottedPath) =>
  dottedPath.split('.').reduce((value, part) => value?.[part], object);

const parseLimit = (args) => {
  const raw = args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('--limit must be a positive integer.');
  }
  return parsed;
};

const safeErrorMessage = (error) =>
  String(error?.message || 'unknown error')
    .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://[credentials-redacted]@');

export async function runLegacyEncryptionMigration(args = process.argv.slice(2)) {
  const apply = args.includes('--apply');
  const limit = parseLimit(args);
  const {
    getEncryptionKeyStatus,
    migrateEncryptedValue,
  } = await import('../utils/encryption.utils.js');

  const keyStatus = getEncryptionKeyStatus();
  if (!keyStatus.legacyConfigured) {
    throw new Error(
      'LEGACY_ENCRYPTION_KEY is not configured; no legacy ciphertext can be safely migrated.'
    );
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  console.log(`[Encryption migration] Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log('[Encryption migration] Current key configured: true');
  console.log('[Encryption migration] Legacy key configured: true');
  console.log(
    apply
      ? '[Encryption migration] Confirm a restorable database backup exists before continuing.'
      : '[Encryption migration] No database writes will occur. Create and verify a backup before --apply.'
  );

  const totals = {
    scannedDocuments: 0,
    current: 0,
    legacyVerified: 0,
    applied: 0,
    plaintext: 0,
    unreadable: 0,
    writeConflicts: 0,
  };

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  try {
    for (const spec of COLLECTIONS) {
      const collectionTotals = {
        scannedDocuments: 0,
        current: 0,
        legacyVerified: 0,
        applied: 0,
        plaintext: 0,
        unreadable: 0,
        writeConflicts: 0,
      };
      const projection = Object.fromEntries(spec.fields.map((field) => [field, 1]));
      let cursor = mongoose.connection.db.collection(spec.name).find({}, { projection });
      if (limit) cursor = cursor.limit(limit);

      for await (const document of cursor) {
        collectionTotals.scannedDocuments += 1;
        totals.scannedDocuments += 1;

        for (const field of spec.fields) {
          const storedValue = getPath(document, field);
          if (storedValue === null || storedValue === undefined || storedValue === '') continue;

          const migration = migrateEncryptedValue(storedValue);
          if (migration.status === 'current') {
            collectionTotals.current += 1;
            totals.current += 1;
            continue;
          }
          if (migration.status === 'plaintext') {
            collectionTotals.plaintext += 1;
            totals.plaintext += 1;
            continue;
          }
          if (migration.status === 'unreadable') {
            collectionTotals.unreadable += 1;
            totals.unreadable += 1;
            continue;
          }

          collectionTotals.legacyVerified += 1;
          totals.legacyVerified += 1;
          if (!apply) continue;

          const result = await mongoose.connection.db.collection(spec.name).updateOne(
            { _id: document._id, [field]: storedValue },
            { $set: { [field]: migration.value } }
          );
          if (result.modifiedCount === 1) {
            collectionTotals.applied += 1;
            totals.applied += 1;
          } else {
            collectionTotals.writeConflicts += 1;
            totals.writeConflicts += 1;
          }
        }
      }

      console.log(JSON.stringify({ collection: spec.name, ...collectionTotals }));
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(JSON.stringify({ migrationTotals: totals }));
  if (totals.unreadable > 0) {
    console.warn(
      '[Encryption migration] Some encrypted values remain unreadable; they were preserved and require key/corruption review.'
    );
  }
  if (totals.writeConflicts > 0) {
    console.warn(
      '[Encryption migration] Some values changed concurrently; they were preserved and may be retried safely.'
    );
  }

  return totals;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  runLegacyEncryptionMigration().catch((error) => {
    console.error(`[Encryption migration] Failed safely: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
