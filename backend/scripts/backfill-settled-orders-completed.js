/**
 * One-time backfill for orders that settled before the backend closed the customer live
 * tracking session on payment.
 *
 * Two cases, both decided by the canonical helpers in constants/orderLifecycle.js:
 *   1. Settled but never completed: paymentStatus `paid`, an `invoiceId`, a succeeded Payment with
 *      `balanceRemaining: 0`, status not completed/released, and `resolveCustomerTrackingState`
 *      says `completed` (this keeps pre-service prepaid bookings out).
 *   2. Already completed/released but written before `liveTracking` existed.
 *
 * Writes go through `closeCustomerLiveTracking`: status/serviceTrackingStage/customerStatus =
 * 'completed' (released stays released), completedAt (kept, else paidAt), and
 * liveTracking { active:false, customerVisible:false, closedAt, closedReason }.
 * Tracker stage media, QC evidence, service steps and payments are never written; the script
 * verifies the trackerStageMedia count is unchanged for every applied order.
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
  LIVE_TRACKING_CLOSE_REASONS,
  closeCustomerLiveTracking,
  resolveCustomerTrackingState,
} from '../constants/orderLifecycle.js';

const APPLY = process.argv.includes('--apply');
const ALREADY_FINAL_STATUSES = ['completed', 'released'];
const LOG = '[backfill-settled-orders-completed]';
const WRITTEN_FIELDS = ['status', 'serviceTrackingStage', 'customerStatus', 'completedAt', 'liveTracking'];

const snapshot = (order) => ({
  status: order.status ?? null,
  serviceTrackingStage: order.serviceTrackingStage ?? null,
  customerStatus: order.customerStatus ?? null,
  completedAt: order.completedAt ?? null,
  liveTracking: order.liveTracking ?? null,
});

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`${LOG} mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${mongoose.connection.name}`);

  const orders = await Order.find({
    $or: [
      {
        paymentStatus: 'paid',
        invoiceId: { $exists: true, $nin: [null, ''] },
        status: { $nin: ALREADY_FINAL_STATUSES },
      },
      { status: { $in: ALREADY_FINAL_STATUSES }, 'liveTracking.active': { $ne: false } },
    ],
  })
    .select('_id orderNumber bookingReference status serviceTrackingStage customerStatus paymentStatus invoiceId paidAt completedAt liveTracking')
    .lean();

  const toUpdate = [];
  const skipped = [];
  for (const order of orders) {
    const ref = order.bookingReference || order.orderNumber;
    const alreadyFinal = ALREADY_FINAL_STATUSES.includes(order.status);
    const trackingState = resolveCustomerTrackingState(order);

    let reason = null;
    if (!alreadyFinal) {
      const zeroBalancePayment = await Payment.exists({
        order: order._id,
        status: 'succeeded',
        balanceRemaining: 0,
      });
      if (!zeroBalancePayment) reason = 'no succeeded payment with balanceRemaining 0';
      else if (!order.paidAt && !order.completedAt) reason = 'no paidAt to derive completedAt from';
    }
    if (!reason && trackingState !== CUSTOMER_TRACKING_STATES.COMPLETED) {
      reason = `tracking rule says "${trackingState}" (order has not reached a settled/released state)`;
    }
    if (reason) {
      skipped.push({ id: String(order._id), ref, current: snapshot(order), reason });
      continue;
    }

    const next = { ...order };
    closeCustomerLiveTracking(next, {
      reason: LIVE_TRACKING_CLOSE_REASONS.PAYMENT_SETTLED,
      closedBy: 'backfill-settled-orders-completed',
      // Historic close time: when it completed or settled, never "now".
      now: order.completedAt || order.paidAt || new Date(),
    });
    const set = Object.fromEntries(WRITTEN_FIELDS.map((field) => [field, next[field]]));
    toUpdate.push({ id: String(order._id), ref, invoiceId: order.invoiceId, before: snapshot(order), after: snapshot(next), set });
  }

  console.log(`${LOG} scanned=${orders.length} wouldUpdate=${toUpdate.length} skipped=${skipped.length}`);
  for (const row of toUpdate) {
    console.log(`${LOG} UPDATE ${row.id} ${row.ref} invoice=${row.invoiceId || '-'}`);
    console.log(`${LOG}   before ${JSON.stringify(row.before)}`);
    console.log(`${LOG}   after  ${JSON.stringify(row.after)}`);
  }
  for (const row of skipped) {
    console.log(`${LOG} SKIP   ${row.id} ${row.ref} ${JSON.stringify(row.current)} — ${row.reason}`);
  }

  if (APPLY) {
    let modified = 0;
    for (const row of toUpdate) {
      const mediaBefore = (await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(row.id) }, { projection: { trackerStageMedia: 1 } }))?.trackerStageMedia?.length ?? 0;
      // Guard on the state we planned from so a concurrent write is never overwritten.
      const result = await Order.updateOne(
        { _id: row.id, status: row.before.status, 'liveTracking.active': { $ne: false } },
        { $set: row.set }
      );
      const mediaAfter = (await Order.collection.findOne({ _id: new mongoose.Types.ObjectId(row.id) }, { projection: { trackerStageMedia: 1 } }))?.trackerStageMedia?.length ?? 0;
      if (mediaAfter !== mediaBefore) throw new Error(`trackerStageMedia changed for ${row.id}: ${mediaBefore} -> ${mediaAfter}`);
      modified += result.modifiedCount;
      console.log(`${LOG} applied ${row.id} modified=${result.modifiedCount} trackerStageMedia=${mediaAfter} (unchanged)`);
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
