import '../config/environment.js';
import mongoose from 'mongoose';
import connectDB from '../config/database.js';
import Order from '../models/order.model.js';
import { syncMissingSalesBalancePickupNotifications } from '../utils/bookingManagerNotifications.utils.js';
import { syncMissingCustomerStageNotifications } from '../utils/customerStageNotifications.utils.js';
import { syncMissingCustomerReceiptNotifications } from '../utils/customerReceiptNotification.utils.js';

const requestedCustomerId = process.argv
  .find((arg) => arg.startsWith('--customer-id='))
  ?.slice('--customer-id='.length);

async function customerIdsToBackfill() {
  if (requestedCustomerId) {
    if (!mongoose.isValidObjectId(requestedCustomerId)) {
      throw new Error('--customer-id must be a valid MongoDB ObjectId');
    }
    return [new mongoose.Types.ObjectId(requestedCustomerId)];
  }

  return Order.distinct('customer', {
    customer: { $ne: null },
    $or: [
      { archived: { $ne: true } },
      { paymentStatus: 'paid' },
    ],
  });
}

async function run() {
  await connectDB();
  const startedAt = process.hrtime.bigint();
  const customerIds = await customerIdsToBackfill();

  for (const customerId of customerIds) {
    await syncMissingCustomerStageNotifications(customerId);
    await syncMissingCustomerReceiptNotifications(customerId);
  }
  await syncMissingSalesBalancePickupNotifications();

  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  console.log(
    `[NOTIFICATIONS_BACKFILL] customers=${customerIds.length} durationMs=${durationMs.toFixed(1)}`
  );
}

run()
  .catch((error) => {
    console.error(`[NOTIFICATIONS_BACKFILL] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
