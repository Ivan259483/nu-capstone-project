/**
 * Fix Mike's detailer account:
 * 1. Reset login attempts (unlock)
 * 2. Set correct role: service_staff
 * 3. Reset password to Detailer123!
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf');
console.log('✅ Connected to MongoDB');

const User = (await import('./models/user.model.js')).default;

const email = 'mike@detailshop.com';
const newPassword = 'Detailer123!';
const passwordHash = await bcrypt.hash(newPassword, 12);

const result = await User.findOneAndUpdate(
  { email },
  {
    $set: {
      role: 'service_staff',
      password: passwordHash,
      loginAttempts: 0,
      lockUntil: null,
      isLocked: false,
    }
  },
  { new: true }
);

if (result) {
  console.log(`\n✅ Fixed user: ${result.email}`);
  console.log(`   Role: ${result.role}`);
  console.log(`   Login attempts reset: 0`);
  console.log(`   Password: ${newPassword}`);
} else {
  // User doesn't exist — create them
  console.log('⚠️  User not found — creating...');
  const newUser = new User({
    name: 'Mike',
    email,
    password: passwordHash,
    role: 'service_staff',
    provider: 'local',
    loginAttempts: 0,
    isLocked: false,
  });
  await newUser.save();
  console.log(`✅ Created user: ${newUser.email} | role: ${newUser.role}`);
}

await mongoose.disconnect();
console.log('\n✅ Done. Mike can now log in as a service_staff detailer.');
process.exit(0);
