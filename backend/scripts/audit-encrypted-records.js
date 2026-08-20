import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env'), override: false });

const COLLECTIONS = [
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
];

const getPath = (object, dottedPath) =>
  dottedPath.split('.').reduce((value, part) => value?.[part], object);

const safeErrorMessage = (error) =>
  String(error?.message || 'unknown error')
    .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://[credentials-redacted]@');

async function auditEncryptedRecords() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  const {
    decryptWithMetadata,
    getEncryptionKeyStatus,
  } = await import('../utils/encryption.utils.js');

  console.log(JSON.stringify({ encryptionKeys: getEncryptionKeyStatus() }));
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  try {
    const totals = { current: 0, legacy: 0, unreadable: 0, plaintext: 0 };
    for (const spec of COLLECTIONS) {
      const projection = Object.fromEntries(spec.fields.map((field) => [field, 1]));
      const fields = Object.fromEntries(spec.fields.map((field) => [
        field,
        { current: 0, legacy: 0, unreadable: 0, plaintext: 0 },
      ]));
      let documents = 0;

      for await (const document of mongoose.connection.db.collection(spec.name).find({}, { projection })) {
        documents += 1;
        for (const field of spec.fields) {
          const value = getPath(document, field);
          if (value === null || value === undefined || value === '') continue;
          const status = decryptWithMetadata(value).status;
          fields[field][status] += 1;
          totals[status] += 1;
        }
      }

      console.log(JSON.stringify({ collection: spec.name, documents, fields }));
    }
    console.log(JSON.stringify({ encryptionAuditTotals: totals }));
    if (totals.unreadable > 0) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

auditEncryptedRecords().catch((error) => {
  console.error(`[Encryption audit] Failed safely: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
