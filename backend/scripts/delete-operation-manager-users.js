/**
 * One-off: remove all users with role operation_manager from MongoDB.
 * Run from repo root: node backend/scripts/delete-operation-manager-users.js
 * Requires MONGODB_URI (or defaults to local autospf DB).
 *
 * Uses the driver directly so we do not load user.model (encryption env).
 */
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/autospf';
  await mongoose.connect(uri);

  const users = mongoose.connection.db.collection('users');
  const filter = { role: 'operation_manager' };
  const found = await users.find(filter).project({ email: 1, name: 1, role: 1 }).toArray();
  console.log(`[delete-operation-manager-users] Found ${found.length} user(s):`);
  found.forEach((u) => console.log(`  - ${u.email} (${u.name})`));

  const result = await users.deleteMany(filter);
  console.log(`[delete-operation-manager-users] Deleted ${result.deletedCount} document(s).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
