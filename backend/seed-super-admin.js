/**
 * seed-super-admin.js
 * Creates the Super Admin account in BOTH Firebase Auth AND MongoDB.
 *
 * Why both? The frontend login flow calls Firebase first, then the backend.
 * A MongoDB-only user cannot log in — Firebase will reject it.
 *
 * Safe to run multiple times — skips gracefully if account already exists.
 * Does NOT modify any other existing accounts.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// ─── Firebase Config (same as frontend / seed-office-admin.js) ───
const firebaseConfig = {
  apiKey: 'AIzaSyCO203nx1fifBUyn9-KuAE1AfqflxPaQ5M',
  authDomain: 'autospf-plus.firebaseapp.com',
  projectId: 'autospf-plus',
  storageBucket: 'autospf-plus.firebasestorage.app',
  messagingSenderId: '227724962432',
  appId: '1:227724962432:web:fddb58f76cf6b348ee5465',
  measurementId: 'G-NDN8GHWJWB',
};

const TARGET = {
  name: 'Super Admin',
  email: 'admin@test.com',
  password: 'Admin@1234',
  role: 'administrator',
};

async function seed() {
  console.log('\n🔐 Seeding Super Admin account…\n');

  // 1. Initialize Firebase Client SDK (unique app name to avoid collision)
  const app = initializeApp(firebaseConfig, 'super-admin-seeder');
  const auth = getAuth(app);

  // 2. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // 3. Import model (uses the real pre-save hash hook)
  const { default: User } = await import('./models/user.model.js');

  // ── Step A: Firebase Auth ────────────────────────────────────────────────
  let firebaseUid = null;

  try {
    const cred = await createUserWithEmailAndPassword(auth, TARGET.email, TARGET.password);
    firebaseUid = cred.user.uid;
    console.log(`✅ Firebase account CREATED → UID: ${firebaseUid}`);
    await auth.signOut();
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      // Already exists — sign in to retrieve UID
      try {
        const cred = await signInWithEmailAndPassword(auth, TARGET.email, TARGET.password);
        firebaseUid = cred.user.uid;
        console.log(`⚡ Firebase account already EXISTS → UID: ${firebaseUid}`);
        await auth.signOut();
      } catch (signInErr) {
        console.error(`❌ Firebase account exists but sign-in failed: ${signInErr.code}`);
        console.error('   The password stored in Firebase may differ from Admin@1234.');
        await mongoose.disconnect();
        process.exit(1);
      }
    } else {
      console.error(`❌ Firebase error: ${err.code || err.message}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  // ── Step B: MongoDB User ─────────────────────────────────────────────────
  const existing = await User.findOne({ email: TARGET.email });

  if (existing) {
    console.log(`⚡ MongoDB user already EXISTS (role: ${existing.role})`);
    // Ensure firebaseUid and role are synced
    let changed = false;
    if (firebaseUid && existing.firebaseUid !== firebaseUid) {
      existing.firebaseUid = firebaseUid;
      changed = true;
    }
    if (existing.role !== TARGET.role) {
      existing.role = TARGET.role;
      changed = true;
    }
    if (!existing.isVerified) { existing.isVerified = true; changed = true; }
    if (!existing.isActive)   { existing.isActive   = true; changed = true; }
    if (changed) {
      await existing.save();
      console.log('   📝 MongoDB record updated (firebaseUid / role / flags synced).');
    } else {
      console.log('   📝 No MongoDB changes needed.');
    }
  } else {
    const user = new User({
      name: TARGET.name,
      email: TARGET.email,
      password: TARGET.password, // hashed by pre-save hook
      role: TARGET.role,
      isVerified: true,
      isActive: true,
      firebaseUid: firebaseUid,
    });
    await user.save();
    console.log('✅ MongoDB user CREATED');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      ✅ Super Admin Account Ready        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Email   : ${TARGET.email.padEnd(30)}║`);
  console.log(`║  Password: ${TARGET.password.padEnd(30)}║`);
  console.log(`║  Role    : ${TARGET.role.padEnd(30)}║`);
  console.log('╚══════════════════════════════════════════╝\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('\n💥 Seed failed:', err);
  process.exit(1);
});
