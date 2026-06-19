import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import { createCustomerReceiptNotification } from './customerStageNotifications.utils.js';

const RECEIPT_KIND = 'receipt_ready';

/**
 * Notify customer as soon as a digital receipt (invoice PDF) is available — same moment "View receipt" appears.
 * Compatibility wrapper around the centralized customer notification helper.
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
  return createCustomerReceiptNotification({
    customerId,
    orderId,
    orderNumber,
    bookingReference,
    invoiceNumber,
    paymentId,
    amountCollected,
  });
}

/**
 * Backfill receipt notifications for paid orders that already have an invoice record.
 * Backfill creates in-app rows through the same idempotent helper.
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
      kind: RECEIPT_KIND,
      emailWorthy: false,
      emailSkippedReason: 'not_email_worthy',
    });
  }
}
