/**
 * Backfill: realign `serviceTrackingStage` with the gate the shop actually reached.
 *
 * The QC Live Tracker used to read `serviceTrackingStage` as a *finished* gate and open the
 * next one, so operators collected gate N+1's evidence while the order still stored gate N.
 * Customers were told "Service In Progress" while the vehicle was under inspection.
 *
 * This script moves such orders forward to the furthest gate that actually holds evidence,
 * capped at `quality_check`: advancing into `ready_pickup` runs the POS/payment-queue side
 * effects and must stay a deliberate QC action, and the Quality Check gate requirements
 * (plate validation, QC photo, checklist) are never bypassed here.
 *
 * Usage:
 *   node scripts/sync-tracker-stage-to-gate-evidence.js            # dry run
 *   node scripts/sync-tracker-stage-to-gate-evidence.js --apply    # write
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { customerStageRank, normalizeBookingStage } from '../utils/customerTrackerStage.utils.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIR, '../.env'), override: false });

const APPLY = process.argv.includes('--apply');
/** Ordered gates; `ready_pickup` is deliberately excluded as an auto-advance target. */
const EVIDENCE_GATES = ['received', 'in_progress', 'quality_check'];
const ACTIVE_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress'];

function furthestEvidenceGate(order) {
  const media = Array.isArray(order.trackerStageMedia) ? order.trackerStageMedia : [];
  let furthest = null;
  for (const entry of media) {
    if (!String(entry?.photoUrl || '').trim()) continue;
    const stage = String(entry?.stage || '').trim();
    const index = EVIDENCE_GATES.indexOf(stage);
    if (index < 0) continue;
    if (furthest === null || index > furthest) furthest = index;
  }
  return furthest === null ? null : EVIDENCE_GATES[furthest];
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(uri);
  await client.connect();
  const orders = client.db().collection('orders');

  const rows = await orders
    .find(
      { status: { $in: ACTIVE_STATUSES } },
      {
        projection: {
          orderNumber: 1,
          bookingReference: 1,
          status: 1,
          serviceTrackingStage: 1,
          'trackerStageMedia.stage': 1,
          'trackerStageMedia.photoUrl': 1,
        },
      }
    )
    .toArray();

  const changes = [];
  for (const order of rows) {
    const evidenceGate = furthestEvidenceGate(order);
    if (!evidenceGate) continue;
    const currentStage = normalizeBookingStage(order);
    if (customerStageRank(evidenceGate) <= customerStageRank(currentStage)) continue;
    changes.push({
      id: order._id,
      reference: order.orderNumber || order.bookingReference,
      from: order.serviceTrackingStage || null,
      to: evidenceGate,
    });
  }

  console.log(`${APPLY ? 'Applying' : 'Dry run —'} ${changes.length} order(s) behind their gate evidence:`);
  for (const change of changes) {
    console.log(`  ${change.reference}: ${change.from ?? '(none)'} -> ${change.to}`);
  }

  if (APPLY) {
    for (const change of changes) {
      await orders.updateOne(
        { _id: change.id },
        {
          $set: {
            serviceTrackingStage: change.to,
            serviceTrackingUpdatedAt: new Date(),
            serviceTrackingUpdatedBy: 'stage-evidence-backfill',
          },
        }
      );
    }
    console.log(`Updated ${changes.length} order(s).`);
  }

  await client.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
