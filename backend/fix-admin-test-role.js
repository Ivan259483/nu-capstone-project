/**
 * Set admin@test.com role to administrator (MongoDB only).
 * Usage: node fix-admin-test-role.js [email]
 * Default email: admin@test.com
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_EMAIL = (process.argv[2] || 'admin@test.com').toLowerCase();

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

const { value: doc } = await mongoose.connection.collection('users').findOneAndUpdate(
  { email: TARGET_EMAIL },
  { $set: { role: 'administrator', status: 'active' } },
  { returnDocument: 'after' }
);

if (!doc) {
  console.error(`❌ User not found: ${TARGET_EMAIL}`);
} else {
  console.log('✅ Role updated.');
  console.log(`   Email: ${doc.email}`);
  console.log(`   Role:  ${doc.role}`);
}

await mongoose.disconnect();
console.log('🔌 Done.');
