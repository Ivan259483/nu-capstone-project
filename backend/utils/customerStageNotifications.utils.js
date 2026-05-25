import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import { getIO } from './socket.utils.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from './trackerGatePhotos.utils.js';

export const CUSTOMER_STAGE_MESSAGES = {
  received: {
    title: '🚗 Vehicle Arrived',
    message: 'Your vehicle has arrived at the shop. Our team will begin service shortly.',
  },
  in_progress: {
    title: '🔧 Service In Progress',
    message: "We've started working on your vehicle. Sit back and relax!",
  },
  quality_check: {
    title: '🛡️ Quality Check Underway',
    message: 'Your vehicle is undergoing final quality inspection.',
  },
  ready_pickup: {
    title: '🎉 Ready for Pickup',
    message: 'Your vehicle service is complete. You can pick it up at the shop when ready.',
  },
  released: {
    title: '🏁 Vehicle Released',
    message: 'Your vehicle has been handed back. Thank you for choosing AutoSPF+!',
  },
};

export function getOrderCustomerId(order) {
  if (!order?.customer) return null;
  return typeof order.customer === 'object'
    ? order.customer?._id || order.customer
    : order.customer;
}

/**
 * One notification per (customer, order, stage). Emits `notification:customer` when created.
 */
export async function createCustomerStageNotification(order, stage) {
  const msg = CUSTOMER_STAGE_MESSAGES[stage];
  if (!msg) return null;

  const customerId = getOrderCustomerId(order);
  if (!customerId) return null;

  const orderIdCandidates = [order._id, order._id?.toString?.()].filter(Boolean);
  const existing = await Notification.findOne({
    recipientUserId: customerId,
    'metadata.orderId': { $in: orderIdCandidates },
    'metadata.stage': stage,
  }).select('_id');

  if (existing) return null;

  const notif = await Notification.create({
    title: msg.title,
    message: msg.message,
    type: 'booking',
    recipientUserId: customerId,
    metadata: { orderId: order._id, stage },
  });

  try {
    const io = getIO();
    io.to(`user:${customerId.toString()}`).emit('notification:customer', {
      id: notif._id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      isRead: false,
      createdAt: notif.createdAt,
    });
  } catch (_) {}

  return notif;
}

/** Notify when pickup gate photos are complete (matches customer live tracker at 100%). */
export async function notifyReadyForPickupIfGateComplete(order) {
  if (countGatePhotos(order, 'ready_pickup') < REQUIRED_GATE_PHOTOS) return null;
  return createCustomerStageNotification(order, 'ready_pickup');
}

/**
 * Backfill missing stage notifications for active customer orders (e.g. tracker advanced via photos only).
 */
export async function syncMissingCustomerStageNotifications(customerId) {
  if (!customerId) return;

  const orders = await Order.find({
    customer: customerId,
    archived: { $ne: true },
    $or: [
      { serviceTrackingStage: { $in: ['ready_pickup', 'completed', 'released'] } },
      { status: { $in: ['ready_for_payment', 'completed', 'released'] } },
    ],
  })
    .select('_id customer serviceTrackingStage status trackerStageMedia')
    .sort({ updatedAt: -1 })
    .limit(30);

  for (const order of orders) {
    const stage = String(order.serviceTrackingStage || '').trim().toLowerCase();
    if (stage === 'released' || order.status === 'released') {
      await createCustomerStageNotification(order, 'released');
    }
    if (
      stage === 'ready_pickup'
      || stage === 'completed'
      || order.status === 'ready_for_payment'
      || countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS
    ) {
      await notifyReadyForPickupIfGateComplete(order);
    }
  }
}
