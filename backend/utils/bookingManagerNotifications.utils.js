import Notification from '../models/notification.model.js';
import { getIO } from './socket.utils.js';

export const BOOKING_APPROVAL_KINDS = ['booking', 'reservation_fee', 'balance_pickup'];

/** All kinds shown in the sales notification bell (approvals + balance/pickup queue). */
export const SALES_BELL_KINDS = BOOKING_APPROVAL_KINDS;

/** True for reservation, GCash proof, or balance-due pickup queue items. */
export function isBookingApprovalNotification(doc) {
  return isSalesBellNotification(doc);
}

export function isSalesBellNotification(doc) {
  if (!doc || doc.type !== 'booking') return false;
  const kind = doc.metadata?.kind;
  if (kind && SALES_BELL_KINDS.includes(kind)) return true;
  const msg = String(doc.message || '');
  if (Boolean(doc.metadata?.orderId) && /Booking Approvals/i.test(msg)) return true;
  if (Boolean(doc.metadata?.orderId) && /Balance.*pickup/i.test(msg)) return true;
  return false;
}

const salesBellContentClause = {
  $or: [
    { 'metadata.kind': { $in: SALES_BELL_KINDS } },
    {
      'metadata.orderId': { $exists: true, $ne: null },
      message: { $regex: /Booking Approvals/i },
    },
    {
      'metadata.orderId': { $exists: true, $ne: null },
      message: { $regex: /Balance.*pickup/i },
    },
  ],
};

/** Mongo filter for sales GET /notifications and mark-all-read. */
export function getSalesBookingApprovalNotificationQuery() {
  return {
    type: 'booking',
    $or: [
      { recipientRole: 'sales', ...salesBellContentClause },
      { recipientRole: 'admin_family', ...salesBellContentClause },
    ],
  };
}

function formatPeso(amount) {
  const n = Math.round(Number(amount) || 0);
  return `₱${n.toLocaleString('en-PH')}`;
}

/** Real-time + persistent notification payload for sales / booking managers. */
export function toBookingManagerNotificationPayload(doc) {
  if (!doc) return null;
  return {
    id: doc._id?.toString?.() || doc.id,
    title: doc.title,
    message: doc.message,
    type: doc.type || 'booking',
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt || new Date().toISOString(),
    link: doc.link,
    metadata: doc.metadata,
  };
}

/**
 * Push to `booking:approvals` (sales POS) and `admin:chat` (admin hub).
 */
export function emitBookingManagerNotification(doc) {
  const payload = toBookingManagerNotificationPayload(doc);
  if (!payload?.id) return;
  try {
    const io = getIO();
    io.to('booking:approvals').emit('notification:booking-manager', payload);
    io.to('admin:chat').emit('admin:notification', payload);
  } catch (error) {
    console.warn('Socket not initialized for booking manager notification:', error.message);
  }
}

/**
 * Sales bell + socket when order enters Balance / pickup queue (`ready_for_payment`, balance due).
 */
export async function notifySalesBalancePickupQueue(order, { balanceDue } = {}) {
  if (!order?._id) return null;
  if (String(order.paymentStatus || '').toLowerCase() === 'paid') return null;

  const due = Math.max(0, Number(balanceDue) || 0);
  if (due <= 0) return null;

  const orderIdCandidates = [order._id, order._id?.toString?.()].filter(Boolean);
  const existing = await Notification.findOne({
    recipientRole: 'sales',
    'metadata.orderId': { $in: orderIdCandidates },
    'metadata.kind': 'balance_pickup',
  }).select('_id');

  if (existing) return null;

  const customerLabel = order.customerName || 'Customer';
  const ref = order.bookingReference || order.orderNumber || order._id;
  const serviceLabel = order.serviceType || 'service';

  const notif = await Notification.create({
    title: 'Balance due — ready for pickup',
    message: `${customerLabel} — collect ${formatPeso(due)} in POS for ${serviceLabel}. Ref ${ref}. Balance / pickup queue.`,
    type: 'booking',
    recipientRole: 'sales',
    link: '/sales/pos',
    metadata: {
      orderId: order._id,
      bookingReference: order.bookingReference || order.orderNumber,
      kind: 'balance_pickup',
      balanceDue: due,
    },
  });

  emitBookingManagerNotification(notif);
  return notif;
}

/**
 * Backfill balance_pickup alerts for orders already in the POS queue (e.g. before deploy).
 */
export async function syncMissingSalesBalancePickupNotifications() {
  const { default: Order } = await import('../models/order.model.js');
  const { computeOrderBalanceDue } = await import('./readyPickupPaymentFlow.utils.js');

  const orders = await Order.find({
    archived: { $ne: true },
    paymentStatus: { $ne: 'paid' },
    $or: [
      { status: 'ready_for_payment' },
      {
        serviceTrackingStage: 'ready_pickup',
        status: { $nin: ['cancelled', 'released', 'rejected'] },
      },
    ],
  })
    .select(
      'customerName serviceType bookingReference orderNumber totalPrice totalAmount downPaymentAmount paymentStatus status serviceTrackingStage'
    )
    .sort({ updatedAt: -1 })
    .limit(40);

  for (const order of orders) {
    const st = String(order.status || '').toLowerCase();
    const ts = String(order.serviceTrackingStage || '').toLowerCase().replace(/-/g, '_');
    const inQueue =
      st === 'ready_for_payment'
      || (ts === 'ready_pickup' && !['cancelled', 'released'].includes(st));
    if (!inQueue) continue;

    const balanceDue = await computeOrderBalanceDue(order);
    if (balanceDue > 0) {
      await notifySalesBalancePickupQueue(order, { balanceDue });
    }
  }
}
