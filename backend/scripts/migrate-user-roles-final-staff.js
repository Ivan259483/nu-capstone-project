/**
 * One-time MongoDB migration: collapse deprecated roles into the final staff model.
 *
 * Usage (from repo root):
 *   node backend/scripts/migrate-user-roles-final-staff.js
 *
 * Requires MONGODB_URI / same env as backend.
 */
import mongoose from 'mongoose';
import { config } from '../config/environment.js';
import User from '../models/user.model.js';

const ROLE_MAP = {
  hr: 'office_admin',
  inventory: 'office_admin',
  staff_inventory: 'office_admin',
  service_staff: 'staff_quality_checker',
  technician: 'staff_quality_checker',
};

async function main() {
  await mongoose.connect(config.mongodbUri);
  let total = 0;
  for (const [from, to] of Object.entries(ROLE_MAP)) {
    const res = await User.updateMany({ role: from }, { $set: { role: to } });
    if (res.modifiedCount) {
      console.log(`Updated ${res.modifiedCount} user(s): ${from} → ${to}`);
      total += res.modifiedCount;
    }
  }
  console.log(total ? `Done. ${total} documents updated.` : 'Done. No deprecated roles found.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
