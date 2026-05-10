/**
 * Firebase Auth User Seeder
 * 
 * Creates Firebase Authentication users for all test role accounts,
 * then syncs the Firebase UIDs back to MongoDB.
 * 
 * Usage: node seed-firebase-users.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// ─── Firebase Config (matches autospf frontend) ───
const firebaseConfig = {
  apiKey: 'AIzaSyCO203nx1fifBUyn9-KuAE1AfqflxPaQ5M',
  authDomain: 'autospf-plus.firebaseapp.com',
  projectId: 'autospf-plus',
  storageBucket: 'autospf-plus.firebasestorage.app',
  messagingSenderId: '227724962432',
  appId: '1:227724962432:web:fddb58f76cf6b348ee5465',
  measurementId: 'G-NDN8GHWJWB',
};

// ─── Shared test password ───
const TEST_PASSWORD = 'AutoSPF@2026';

// ─── Test accounts to create (from MongoDB users collection) ───
const TEST_ACCOUNTS = [
  { email: 'mike@detailshop.com',          name: 'Mike',               role: 'staff_quality_checker' },
  { email: 'customer@test.com',            name: 'John',              role: 'customer' },
  { email: 'test.office@autospf.com',      name: 'OFFICE ADMIN',      role: 'office_admin' },
  { email: 'test.ops@autospf.com',         name: 'OPERATION MANAGER', role: 'customer' },
  { email: 'test.hr@autospf.com',          name: 'HR',                role: 'office_admin' },
  { email: 'test.inventory@autospf.com',   name: 'INVENTORY',         role: 'office_admin' },
  { email: 'test.sales@autospf.com',       name: 'SALES',             role: 'sales' },
  { email: 'test.staff@autospf.com',       name: 'SERVICE STAFF',     role: 'staff_quality_checker' },
  { email: 'test.customer@autospf.com',    name: 'IVAN CUSTOMER - TEST', role: 'customer' },
];

// ─── MongoDB User model (inline to keep script self-contained) ───
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    role: String,
    firebaseUid: { type: String, unique: true, sparse: true },
    isVerified: Boolean,
    isActive: Boolean,
  },
  { timestamps: true, strict: false }
);
const User = mongoose.model('User', userSchema);

// ─── Main ───
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   🔥 Firebase Auth User Seeder for AutoSPF+        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`📋 Shared test password: ${TEST_PASSWORD}`);
  console.log(`📋 Accounts to process: ${TEST_ACCOUNTS.length}\n`);

  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not found in .env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  // 2. Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  const results = { created: [], existing: [], failed: [] };

  for (const account of TEST_ACCOUNTS) {
    process.stdout.write(`⏳ Processing ${account.email} (${account.role})... `);

    let firebaseUid = null;

    try {
      // Try creating a new Firebase user
      const cred = await createUserWithEmailAndPassword(auth, account.email, TEST_PASSWORD);
      firebaseUid = cred.user.uid;
      console.log(`✅ CREATED → UID: ${firebaseUid}`);
      results.created.push(account.email);

      // Sign out so we can create the next user
      await auth.signOut();
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        // User already exists in Firebase — sign in to get UID
        try {
          const cred = await signInWithEmailAndPassword(auth, account.email, TEST_PASSWORD);
          firebaseUid = cred.user.uid;
          console.log(`⚡ EXISTS → UID: ${firebaseUid}`);
          results.existing.push(account.email);
          await auth.signOut();
        } catch (signInErr) {
          console.log(`⚠️  EXISTS but password mismatch — skipping UID sync`);
          console.log(`   (Firebase error: ${signInErr.code})`);
          results.failed.push({ email: account.email, reason: 'password_mismatch' });
          continue;
        }
      } else {
        console.log(`❌ FAILED: ${error.code || error.message}`);
        results.failed.push({ email: account.email, reason: error.code || error.message });
        continue;
      }
    }

    // 3. Sync Firebase UID to MongoDB
    if (firebaseUid) {
      const updateResult = await User.updateOne(
        { email: account.email.toLowerCase() },
        { $set: { firebaseUid: firebaseUid } }
      );

      if (updateResult.matchedCount === 0) {
        console.log(`   ⚠️  MongoDB user not found for ${account.email}`);
      } else if (updateResult.modifiedCount > 0) {
        console.log(`   📝 MongoDB firebaseUid synced`);
      } else {
        console.log(`   📝 MongoDB firebaseUid already up-to-date`);
      }
    }
  }

  // ─── Summary ───
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                    📊 SUMMARY                       ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Created:  ${results.created.length}                                    ║`);
  console.log(`║  ⚡ Existing: ${results.existing.length}                                    ║`);
  console.log(`║  ❌ Failed:   ${results.failed.length}                                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  if (results.created.length > 0) {
    console.log('\n🆕 Newly created Firebase accounts:');
    results.created.forEach(e => console.log(`   • ${e}`));
  }
  if (results.existing.length > 0) {
    console.log('\n⚡ Already existed (UID synced):');
    results.existing.forEach(e => console.log(`   • ${e}`));
  }
  if (results.failed.length > 0) {
    console.log('\n❌ Failed:');
    results.failed.forEach(f => console.log(`   • ${f.email} — ${f.reason}`));
  }

  console.log(`\n🔑 All test accounts use password: ${TEST_PASSWORD}\n`);

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
