import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_EMAIL = String(process.env.ADMIN_RECOVERY_EMAIL || '').trim().toLowerCase();
const RECOVERY_CONFIRMATION = String(process.env.ADMIN_RECOVERY_CONFIRM || '').trim();
const EXPECTED_CONFIRMATION = TARGET_EMAIL ? `UNLOCK:${TARGET_EMAIL}` : '';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}
if (!TARGET_EMAIL) {
  console.error('❌ ADMIN_RECOVERY_EMAIL is required; there is no default Administrator identity.');
  process.exit(1);
}
if (RECOVERY_CONFIRMATION !== EXPECTED_CONFIRMATION) {
  console.error(
    `❌ Refusing recovery. Set ADMIN_RECOVERY_CONFIRM to ${JSON.stringify(EXPECTED_CONFIRMATION)}.`,
  );
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

const users = mongoose.connection.collection('users');
const administrator = await users.findOne({
  email: TARGET_EMAIL,
  role: 'administrator',
  isDeleted: { $ne: true },
  isActive: true,
  isVerified: true,
});

if (!administrator) {
  console.error(
    '❌ Recovery target must be an existing, active, verified user with canonical role `administrator`.',
  );
  await mongoose.disconnect();
  process.exit(1);
} else {
  const updateResult = await users.updateOne(
    {
      _id: administrator._id,
      role: 'administrator',
      isDeleted: { $ne: true },
      isActive: true,
      isVerified: true,
    },
    { $set: { loginAttempts: 0, lockUntil: null } },
  );
  if (updateResult.matchedCount !== 1) {
    console.error('❌ Administrator state changed before recovery could be applied. No account was unlocked.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Account unlocked successfully!`);
  console.log(`   Email:         ${administrator.email}`);
  console.log(`   Role:          ${administrator.role}`);
  console.log('   loginAttempts: 0');
  console.log('   lockUntil:     null (cleared)');
}

await mongoose.disconnect();
console.log('🔌 Disconnected. Done!');
