import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_EMAIL = process.argv[2] || 'admin@test.com';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

const result = await mongoose.connection.collection('users').findOneAndUpdate(
  { email: TARGET_EMAIL },
  {
    $set: { loginAttempts: 0, lockUntil: null },
    $unset: { lockUntil: '' }
  },
  { returnDocument: 'after' }
);

if (!result) {
  console.error(`❌ User not found: ${TARGET_EMAIL}`);
} else {
  console.log(`✅ Account unlocked successfully!`);
  console.log(`   Email:         ${result.email}`);
  console.log(`   Role:          ${result.role}`);
  console.log(`   loginAttempts: ${result.loginAttempts}`);
  console.log(`   lockUntil:     ${result.lockUntil ?? 'null (cleared)'}`);
}

await mongoose.disconnect();
console.log('🔌 Disconnected. Done!');
