/**
 * Create or update a verified customer in MongoDB and Firebase Auth (same password both places).
 * Web login uses Firebase + backend in parallel.
 *
 * Usage (from backend/): node scripts/ensureCustomerAccount.mjs <email> <displayName> <password>
 */
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import User from '../models/user.model.js';
import connectDB from '../config/database.js';

// Same public config as seed-firebase-users.js / frontend
const firebaseConfig = {
  apiKey: 'AIzaSyCO203nx1fifBUyn9-KuAE1AfqflxPaQ5M',
  authDomain: 'autospf-plus.firebaseapp.com',
  projectId: 'autospf-plus',
  storageBucket: 'autospf-plus.firebasestorage.app',
  messagingSenderId: '227724962432',
  appId: '1:227724962432:web:fddb58f76cf6b348ee5465',
  measurementId: 'G-NDN8GHWJWB',
};

const [, , emailArg, nameArg, passwordArg] = process.argv;
if (!emailArg || !nameArg || !passwordArg) {
  console.error('Usage: node scripts/ensureCustomerAccount.mjs <email> <displayName> <password>');
  process.exit(1);
}

const email = String(emailArg).trim().toLowerCase();
const name = String(nameArg).trim();
const password = String(passwordArg);

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI in environment (.env)');
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  if (user) {
    user.name = name;
    user.password = password;
    user.role = 'customer';
    user.isVerified = true;
    user.isActive = true;
    user.status = 'active';
    user.isDeleted = false;
    await user.save();
    console.log(`MongoDB: updated customer ${email}`);
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
    console.log(`MongoDB: created customer ${email}`);
  }

  const app = initializeApp(firebaseConfig, `ensure-customer-${Date.now()}`);
  const auth = getAuth(app);
  let uid = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    console.log('Firebase: created user, UID synced');
  } catch (e) {
    if (e?.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      uid = cred.user.uid;
      console.log('Firebase: user already existed (signed in), UID synced');
    } else {
      console.error('Firebase error:', e?.code || e?.message);
      throw e;
    }
  }

  await User.updateOne({ email }, { $set: { firebaseUid: uid } });
  console.log('Done. Customer can sign in on the web app with this email and password.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
