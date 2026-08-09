import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { normalizeToCanonical } from './constants/roles.js';
dotenv.config();

async function cleanUsers() {
  try {
    if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DESTRUCTIVE_USER_CLEANUP !== 'true') {
      console.error(
        'Refusing user cleanup. Set NODE_ENV=development and ALLOW_DESTRUCTIVE_USER_CLEANUP=true.',
      );
      process.exit(1);
    }

    const rolesToDelete = String(process.env.CLEAN_USERS_DELETE_ROLES || '')
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
    if (rolesToDelete.length === 0) {
      console.error('❌ CLEAN_USERS_DELETE_ROLES must explicitly list the roles to remove.');
      process.exit(1);
    }
    if (rolesToDelete.some((role) => normalizeToCanonical(role) === 'administrator')) {
      console.error('❌ Refusing cleanup: Administrator roles may not be selected for deletion.');
      process.exit(1);
    }
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI is required.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    const result = await mongoose.connection.db.collection('users').deleteMany({
      role: { $in: rolesToDelete },
    });

    console.log(`Successfully deleted ${result.deletedCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanUsers();
