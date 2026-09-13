/**
 * One-time backfill: orders whose balance payment settled (paid, zero balance, receipt issued)
 * before the POS handler wrote a terminal state are still stored as `ready_for_payment`.
 *
 * An order is updated only when ALL of these hold:
 *   - paymentStatus is `paid` and an `invoiceId` exists
 *   - status is not already completed/released
 *   - a succeeded Payment for the order recorded `balanceRemaining: 0`
 *   - the canonical rule `resolveCustomerTrackingState` (constants/orderLifecycle.js) says
 *     `completed` — this is what keeps pre-service prepaid bookings out
 *
 * Writes: status, serviceTrackingStage, customerStatus = 'completed'; completedAt = paidAt
 * (only when completedAt is not already set).
 *
 * Usage (from backend/):
 *   node scripts/backfill-settled-orders-completed.js           # dry run (default)
 *   node scripts/backfill-settled-orders-completed.js --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import {
  CUSTOMER_TRACKING_STATES,
  resolveCustomerTrackingState,
} from '../constants/orderLifecycle.js';

const APPLY = process.argv.includes('--apply');
const ALREADY_FINAL_STATUSES = ['completed', 'released'];
const LOG = '[backfill-settled-orders-completed]';

const snapshot = (order) => ({
  status: order.status ?? null,
  serviceTrackingStage: order.serviceTrackingStage ?? null,
  customerStatus: order.customerStatus ?? null,
  completedAt: order.completedAt ?? null,
});

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`${LOG} mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${mongoose.connection.name}`);

  const orders = await Order.find({
    paymentStatus: 'paid',
    invoiceId: { $exists: true, $nin: [null, ''] },
    status: { $nin: ALREADY_FINAL_STATUSES },
  })
    .select('_id orderNumber bookingReference status serviceTrackingStage customerStatus paymentStatus invoiceId paidAt completedAt')
    .lean();

  const toUpdate = [];
  const skipped = [];
  for (const order of orders) {
    const zeroBalancePayment = await Payment.findOne({
      order: order._id,
      status: 'succeeded',
      balanceRemaining: 0,
    }).select('_id invoiceId').lean();
    const trackingState = resolveCustomerTrackingState(order);
    const ref = order.bookingReference || order.orderNumber;

    let reason = null;
    if (!zeroBalancePayment) reason = 'no succeeded payment with balanceRemaining 0';
    else if (trackingState !== CUSTOMER_TRACKING_STATES.COMPLETED) {
      reason = `tracking rule says "${trackingState}" (order has not reached Ready for Pickup)`;
    } else if (!order.paidAt && !order.completedAt) reason = 'no paidAt to derive completedAt from';

    if (reason) {
      skipped.push({ id: String(order._id), ref, current: snapshot(order), reason });
      continue;
    }
    const set = {
      status: 'completed',
      serviceTrackingStage: 'completed',
      customerStatus: 'completed',
      ...(order.completedAt ? {} : { completedAt: order.paidAt }),
    };
    toUpdate.push({
      id: String(order._id),
      ref,
      invoiceId: order.invoiceId,
      zeroBalancePaymentId: String(zeroBalancePayment._id),
      before: snapshot(order),
      after: { ...snapshot(order), ...set },
      set,
    });
  }

  console.log(`${LOG} scanned=${orders.length} wouldUpdate=${toUpdate.length} skipped=${skipped.length}`);
  for (const row of toUpdate) {
    console.log(`${LOG} UPDATE ${row.id} ${row.ref} invoice=${row.invoiceId} payment=${row.zeroBalancePaymentId}`);
    console.log(`${LOG}   before ${JSON.stringify(row.before)}`);
    console.log(`${LOG}   after  ${JSON.stringify(row.after)}`);
  }
  for (const row of skipped) {
    console.log(`${LOG} SKIP   ${row.id} ${row.ref} ${JSON.stringify(row.current)} — ${row.reason}`);
  }

  if (APPLY) {
    let modified = 0;
    for (const row of toUpdate) {
      // Guard on current state so a concurrent release/completion is never overwritten.
      const result = await Order.updateOne(
        { _id: row.id, paymentStatus: 'paid', status: { $nin: ALREADY_FINAL_STATUSES } },
        { $set: row.set }
      );
      modified += result.modifiedCount;
      console.log(`${LOG} applied ${row.id} modified=${result.modifiedCount}`);
    }
    console.log(`${LOG} done modified=${modified}`);
  } else {
    console.log(`${LOG} dry run only — nothing written. Re-run with --apply to write.`);
  }
}

main()
  .catch((error) => {
    console.error(`${LOG} ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
