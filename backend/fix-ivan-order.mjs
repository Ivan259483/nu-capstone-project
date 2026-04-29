/**
 * fix-ivan-order.mjs
 * Fixes Ivan's stuck order:
 *   - Finds the most recent in_progress/received/confirmed order for plate LBD 213
 *   - Sets status → 'in_progress', serviceTrackingStage → 'ready_pickup'
 * Also lists ALL of Ivan's orders so we can see every status in the DB.
 *
 * Run: node fix-ivan-order.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load .env.local first, fall back to .env
try {
  const local = readFileSync('.env.local', 'utf8');
  local.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !process.env[k]) process.env[k] = v.join('=').trim();
  });
} catch {}
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('No MONGODB_URI found in env');

const orderSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Order = mongoose.model('Order', orderSchema, 'orders');

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // ── 1. Show ALL of Ivan's orders (any plate/name match) ─────────────────────
  const allIvanOrders = await Order.find({
    $or: [
      { customerName: { $regex: /ivan/i } },
      { vehiclePlate: { $regex: /LBD.?213/i } },
      { vehiclePlate: { $regex: /SPF.?99/i } },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  console.log(`Found ${allIvanOrders.length} orders for Ivan:\n`);
  allIvanOrders.forEach((o, i) => {
    console.log(`[${i + 1}] ${o.orderNumber || o._id}`);
    console.log(`    status: ${o.status}`);
    console.log(`    serviceTrackingStage: ${o.serviceTrackingStage ?? '(none)'}`);
    console.log(`    vehiclePlate: ${o.vehiclePlate}`);
    console.log(`    createdAt: ${o.createdAt}`);
    console.log('');
  });

  // ── 2. Fix the most recent order that has the wrong status ───────────────────
  // Target: most recent order where status is 'completed' or 'rejected' but
  // serviceTrackingStage is 'ready_pickup' (i.e. it was stuck by the old bug).
  const stuck = allIvanOrders.find(
    (o) =>
      ['completed', 'rejected', 'cancelled', 'pending_confirmation'].includes(o.status) &&
      (o.serviceTrackingStage === 'ready_pickup' || o.serviceTrackingStage === 'quality_check' || !o.serviceTrackingStage)
  );

  if (stuck) {
    console.log(`\n🔧 Fixing stuck order: ${stuck.orderNumber || stuck._id}`);
    console.log(`   Before → status: ${stuck.status}, stage: ${stuck.serviceTrackingStage}`);

    const result = await Order.findByIdAndUpdate(
      stuck._id,
      {
        $set: {
          status: 'in_progress',
          serviceTrackingStage: 'ready_pickup',
          serviceTrackingUpdatedAt: new Date(),
          serviceTrackingUpdatedBy: 'fix-script',
        },
      },
      { new: true }
    ).lean();

    console.log(`   After  → status: ${result.status}, stage: ${result.serviceTrackingStage}`);
    console.log('✅ Fixed!\n');
  } else {
    console.log('ℹ️  No obviously stuck order found — check the list above manually.\n');

    // If nothing matched the auto-detection, fix the most recent order regardless
    const mostRecent = allIvanOrders[0];
    if (mostRecent) {
      console.log(`🔧 Force-fixing most recent order: ${mostRecent.orderNumber || mostRecent._id}`);
      console.log(`   Before → status: ${mostRecent.status}, stage: ${mostRecent.serviceTrackingStage}`);
      const result = await Order.findByIdAndUpdate(
        mostRecent._id,
        {
          $set: {
            status: 'in_progress',
            serviceTrackingStage: 'ready_pickup',
            serviceTrackingUpdatedAt: new Date(),
            serviceTrackingUpdatedBy: 'fix-script',
          },
        },
        { new: true }
      ).lean();
      console.log(`   After  → status: ${result.status}, stage: ${result.serviceTrackingStage}`);
      console.log('✅ Fixed!\n');
    }
  }

  // ── 3. Also hide any old rejected orders that are surfacing ──────────────────
  // If Ivan has a 'rejected' order from a previous bad booking, it will keep
  // showing the "Booking Not Confirmed" card. Clear those out.
  const oldRejected = await Order.updateMany(
    {
      $or: [
        { customerName: { $regex: /ivan/i } },
        { vehiclePlate: { $regex: /LBD.?213/i } },
      ],
      status: 'rejected',
    },
    {
      $set: {
        status: 'cancelled', // cancelled is excluded from both tracker and rejected UI
        serviceTrackingUpdatedAt: new Date(),
      },
    }
  );
  if (oldRejected.modifiedCount > 0) {
    console.log(`🧹 Silenced ${oldRejected.modifiedCount} old rejected order(s) → status: cancelled`);
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
