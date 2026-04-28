/**
 * fix-stuck-tracker.js
 * One-time script: updates completed orders that have serviceTrackingStage stuck
 * at 'quality_check' (or any non-final stage) to 'ready_pickup'.
 *
 * Run with: node fix-stuck-tracker.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const orderSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Order = mongoose.model('Order', orderSchema, 'orders');

async function fix() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Fix 1: ORD-1777294991139 specifically (known stuck order)
  const specific = await Order.updateOne(
    { orderNumber: 'ORD-1777294991139' },
    {
      $set: {
        serviceTrackingStage: 'ready_pickup',
        serviceTrackingUpdatedAt: new Date(),
        serviceTrackingUpdatedBy: 'fix-script',
      },
    }
  );
  console.log(`ORD-1777294991139: modified=${specific.modifiedCount}`);

  // Fix 2: All completed orders where serviceTrackingStage is NOT ready_pickup / completed
  const FINAL_STAGES = ['ready_pickup', 'completed'];
  const bulk = await Order.updateMany(
    {
      status: 'completed',
      serviceTrackingStage: { $exists: true, $nin: [null, ...FINAL_STAGES] },
    },
    {
      $set: {
        serviceTrackingStage: 'ready_pickup',
        serviceTrackingUpdatedAt: new Date(),
        serviceTrackingUpdatedBy: 'fix-script',
      },
    }
  );
  console.log(`Bulk fix: ${bulk.modifiedCount} completed orders corrected to ready_pickup`);

  await mongoose.disconnect();
  console.log('Done.');
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
