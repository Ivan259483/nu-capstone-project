import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import { getIO } from './socket.utils.js';

const RECEIPT_KIND = 'receipt_ready';

function receiptDashboardLink(orderId) {
  const id = orderId?.toString?.() || String(orderId || '');
  return `/customer/dashboard?section=payments&receiptOrderId=${encodeURIComponent(id)}`;
}

function emitCustomerNotification(customerId, notification) {
  try {
    if (!customerId) return;
    const io = getIO();
    io.to(`user:${customerId.toString()}`).emit('notification:customer', notification);
  } catch (_) {
    /* socket optional */
  }
}

/**
 * Notify customer as soon as a digital receipt (invoice PDF) is available — same moment "View receipt" appears.
 */
export async function notifyCustomerReceiptReady({
  customerId,
  orderId,
  orderNumber,
  bookingReference,
  invoiceNumber,
  paymentId,
  amountCollected,
}) {
  const cid = customerId?.toString?.() || String(customerId || '');
  const oid = orderId?.toString?.() || String(orderId || '');
  if (!cid || !oid) return null;

  const orderIdCandidates = [orderId, oid].filter(Boolean);
  const existing = await Notification.findOne({
    recipientUserId: cid,
    recipientRole: 'customer',
    'metadata.kind': RECEIPT_KIND,
    'metadata.orderId': { $in: orderIdCandidates },
  }).select('_id');

  if (existing) return null;

  const ref = bookingReference || orderNumber || oid.slice(-8);
  const amount =
    Number.isFinite(Number(amountCollected)) && Number(amountCollected) > 0
      ? `₱${Number(amountCollected).toLocaleString('en-PH')}`
      : null;
  const invLabel = invoiceNumber ? ` Invoice ${invoiceNumber}.` : '';

  const notif = await Notification.create({
    title: 'Your receipt is ready',
    message: amount
      ? `Payment recorded for ${ref} (${amount}). Tap to view your official receipt.${invLabel}`
      : `Your official receipt for ${ref} is ready. Tap to open it.${invLabel}`,
    type: 'success',
    recipientRole: 'customer',
    recipientUserId: cid,
    link: receiptDashboardLink(oid),
    metadata: {
      kind: RECEIPT_KIND,
      orderId: oid,
      orderNumber: orderNumber || null,
      bookingReference: bookingReference || null,
      invoiceNumber: invoiceNumber || null,
      paymentId: paymentId?.toString?.() || paymentId || null,
    },
  });

  emitCustomerNotification(cid, {
    id: notif._id,
    title: notif.title,
    message: notif.message,
    type: notif.type,
    isRead: false,
    createdAt: notif.createdAt,
    link: notif.link,
    metadata: notif.metadata,
  });

  return notif;
}

/**
 * Backfill receipt notifications for paid orders that already have an invoice record.
 */
export async function syncMissingCustomerReceiptNotifications(customerId) {
  if (!customerId) return;

  const cid = new mongoose.Types.ObjectId(customerId);

  const paidOrders = await Order.find({
    customer: cid,
    paymentStatus: 'paid',
  })
    .select('_id orderNumber bookingReference totalPrice totalAmount')
    .lean();

  if (!paidOrders.length) return;

  const orderIds = paidOrders.map((o) => o._id);
  const invoices = await InvoiceRecord.find({ order: { $in: orderIds } })
    .select('order invoiceNumber payment')
    .lean();
  const invoiceByOrder = new Map(invoices.map((inv) => [inv.order.toString(), inv]));

  const existing = await Notification.find({
    recipientUserId: cid,
    'metadata.kind': RECEIPT_KIND,
    'metadata.orderId': { $in: orderIds.map((id) => id.toString()) },
  })
    .select('metadata.orderId')
    .lean();

  const notified = new Set(
    existing.map((n) => String(n.metadata?.orderId || '')).filter(Boolean)
  );

  for (const order of paidOrders) {
    const oid = order._id.toString();
    if (notified.has(oid)) continue;
    const inv = invoiceByOrder.get(oid);
    if (!inv?.invoiceNumber) continue;

    await notifyCustomerReceiptReady({
      customerId: cid,
      orderId: order._id,
      orderNumber: order.orderNumber,
      bookingReference: order.bookingReference,
      invoiceNumber: inv.invoiceNumber,
      paymentId: inv.payment,
      amountCollected: Number(order.totalPrice ?? order.totalAmount ?? 0),
    });
    notified.add(oid);
  }
}
