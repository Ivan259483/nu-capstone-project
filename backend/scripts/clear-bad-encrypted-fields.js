/**
 * One-shot migration: clear order fields that are garbled (encrypted with old key).
 *
 * Run once from backend/:
 *   node scripts/clear-bad-encrypted-fields.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

if (!ENCRYPTION_KEY || Buffer.byteLength(ENCRYPTION_KEY, 'utf8') !== 32) {
  console.error('❌ ENCRYPTION_KEY must be exactly 32 bytes in .env');
  process.exit(1);
}

function canDecrypt(text) {
  if (!text || typeof text !== 'string') return true; // not encrypted, skip
  if (!ENCRYPTED_PATTERN.test(text)) return true;     // not encrypted format, skip
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    Buffer.concat([decrypted, decipher.final()]);
    return true; // decryption worked
  } catch {
    return false; // bad key — this is a legacy record
  }
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('orders');

  const orders = await collection.find({
    $or: [
      { vehiclePlate: { $regex: ENCRYPTED_PATTERN } },
      { notes: { $regex: ENCRYPTED_PATTERN } },
    ]
  }).toArray();

  console.log(`🔍 Found ${orders.length} orders with encrypted fields...`);

  let cleared = 0;
  for (const order of orders) {
    const $unset = {};

    if (!canDecrypt(order.vehiclePlate)) {
      $unset.vehiclePlate = '';
      console.log(`  ⚠️  Order ${order.orderNumber || order._id}: clearing vehiclePlate (bad key)`);
    }
    if (!canDecrypt(order.notes)) {
      $unset.notes = '';
      console.log(`  ⚠️  Order ${order.orderNumber || order._id}: clearing notes (bad key)`);
    }

    // Check legalCompliance sub-fields
    const lc = order.legalCompliance;
    if (lc) {
      if (!canDecrypt(lc.waiverSignature)) $unset['legalCompliance.waiverSignature'] = '';
      if (!canDecrypt(lc.damageNotes)) $unset['legalCompliance.damageNotes'] = '';
    }

    if (Object.keys($unset).length > 0) {
      await collection.updateOne({ _id: order._id }, { $unset });
      cleared++;
    }
  }

  console.log(`\n✅ Done. Cleared bad-key encrypted fields from ${cleared} orders.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
