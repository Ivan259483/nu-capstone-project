/**
 * Create or update a verified customer account (MongoDB only).
 *
 * Run from backend/:
 *   node scripts/create-customer-user.js <email> <password> [displayName]
 *
 * Or use env: CUSTOMER_EMAIL, CUSTOMER_PASSWORD, CUSTOMER_NAME
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/user.model.js';

async function main() {
  const email = (process.argv[2] || process.env.CUSTOMER_EMAIL || '').trim().toLowerCase();
  const password = process.argv[3] || process.env.CUSTOMER_PASSWORD || '';
  const name =
    (process.argv[4] || process.env.CUSTOMER_NAME || '').trim() ||
    (email ? email.split('@')[0] : '');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Usage: node scripts/create-customer-user.js <email> <password> [displayName]');
    console.error('   or: CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... [CUSTOMER_NAME=...] node scripts/create-customer-user.js');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'customer') {
      console.error(`❌ User exists with role "${existing.role}". Not modifying.`);
      process.exit(1);
    }
    existing.password = password;
    existing.name = name || existing.name;
    existing.isVerified = true;
    existing.isActive = true;
    existing.status = 'active';
    existing.isDeleted = false;
    existing.deletedAt = undefined;
    await existing.save();
    console.log(`✅ Updated customer: ${email}`);
  } else {
    await User.create({
      name,
      email,
      password,
      role: 'customer',
      isVerified: true,
      isActive: true,
      status: 'active',
    });
    console.log(`✅ Created customer: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
