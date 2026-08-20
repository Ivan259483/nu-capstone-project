import Billing from '../models/billing.model.js';
import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import { computeBillingTotals, normalizeMoney } from '../utils/billingTotals.js';

export const PENDING_PAYMENT_STATUSES = Object.freeze([
  'pending',
  'unpaid',
  'partially_paid',
  'awaiting_settlement',
]);

const INCLUDED_PAYMENT_STATUSES = new Set(PENDING_PAYMENT_STATUSES);
const EXCLUDED_ORDER_STATUSES = new Set(['cancelled', 'rejected']);
const SETTLED_PAYMENT_STATUSES = ['succeeded', 'paid', 'completed'];

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || String(value || '');

export function normalizePaymentStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function totalServiceAmount(order, billing) {
  if (billing?.lineItems?.length) {
    const computed = computeBillingTotals({
      lineItems: billing.lineItems,
      discount: billing.discount || { discountType: 'fixed', value: 0 },
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: billing.downpayment,
    });
    const billingTotal = normalizeMoney(computed.grandTotal);
    if (billingTotal > 0) return billingTotal;
  }

  const explicitTotal = normalizeMoney(
    order?.serviceTotal || order?.totalPrice || order?.totalAmount || 0
  );
  if (explicitTotal > 0) return explicitTotal;

  return normalizeMoney(
    normalizeMoney(order?.subtotal)
      - normalizeMoney(order?.discountAmount)
      + normalizeMoney(order?.taxVatAmount)
      + normalizeMoney(order?.additionalFees)
  );
}

function amountAlreadyPaid(order, billing, settledPaymentTotal) {
  const billingDownpayment = normalizeMoney(billing?.downpayment);
  const reservationPayment = billingDownpayment > 0
    ? billingDownpayment
    : normalizeMoney(order?.downPaymentAmount);
  const recordedFinalPayment = Math.max(
    normalizeMoney(settledPaymentTotal),
    normalizeMoney(order?.amountCollected),
    normalizeMoney(order?.finalPaymentAmount)
  );
  return normalizeMoney(reservationPayment + recordedFinalPayment);
}

export function calculateOutstandingTransaction({ order, billing = null, settledPaymentTotal = 0 }) {
  if (!order || order.archived === true) return null;

  const orderStatus = normalizePaymentStatus(order.status);
  if (EXCLUDED_ORDER_STATUSES.has(orderStatus)) return null;

  const storedPaymentStatus = normalizePaymentStatus(order.paymentStatus) || 'unpaid';
  if (!INCLUDED_PAYMENT_STATUSES.has(storedPaymentStatus)) return null;

  const total = totalServiceAmount(order, billing);
  const paid = amountAlreadyPaid(order, billing, settledPaymentTotal);
  const outstanding = normalizeMoney(Math.max(0, total - paid));
  if (total <= 0 || outstanding <= 0) return null;

  const paymentStatus = paid > 0 && outstanding < total
    ? 'partially_paid'
    : storedPaymentStatus;

  return {
    orderId: idOf(order._id || order.id),
    reference: String(order.bookingReference || order.orderNumber || idOf(order._id || order.id)),
    orderStatus,
    paymentStatus,
    totalServiceAmount: total,
    amountAlreadyPaid: Math.min(paid, total),
    outstandingBalance: outstanding,
  };
}

export function summarizeOutstandingOrders({ orders, billingsByOrder, settledTotalsByOrder }) {
  const transactions = [];

  for (const order of orders || []) {
    const orderId = idOf(order?._id || order?.id);
    const transaction = calculateOutstandingTransaction({
      order,
      billing: billingsByOrder?.get(orderId) || null,
      settledPaymentTotal: settledTotalsByOrder?.get(orderId) || 0,
    });
    if (transaction) transactions.push(transaction);
  }

  const statusCounts = Object.fromEntries(PENDING_PAYMENT_STATUSES.map((status) => [status, 0]));
  for (const transaction of transactions) {
    statusCounts[transaction.paymentStatus] = (statusCounts[transaction.paymentStatus] || 0) + 1;
  }

  return {
    totalOutstanding: normalizeMoney(
      transactions.reduce((sum, transaction) => sum + transaction.outstandingBalance, 0)
    ),
    count: transactions.length,
    statusCounts,
    transactions,
  };
}

export async function getPendingPaymentsSummary() {
  const orders = await Order.find({
    archived: { $ne: true },
    status: { $nin: ['cancelled', 'rejected'] },
    paymentStatus: { $nin: SETTLED_PAYMENT_STATUSES },
  })
    .select(
      '_id orderNumber bookingReference status paymentStatus archived serviceTotal totalPrice totalAmount ' +
      'subtotal discountAmount taxVatAmount additionalFees downPaymentAmount amountCollected finalPaymentAmount'
    )
    .lean();

  if (orders.length === 0) {
    return summarizeOutstandingOrders({ orders: [] });
  }

  const orderIds = orders.map((order) => order._id);
  const [billings, settledPayments] = await Promise.all([
    Billing.find({ order: { $in: orderIds } })
      .select('order lineItems discount taxVatAmount additionalFees downpayment version updatedAt')
      .sort({ version: -1, updatedAt: -1 })
      .lean(),
    Payment.aggregate([
      {
        $match: {
          order: { $in: orderIds },
          status: { $in: SETTLED_PAYMENT_STATUSES },
        },
      },
      {
        $group: {
          _id: '$order',
          amount: { $sum: { $ifNull: ['$amountPaid', '$amount'] } },
        },
      },
    ]),
  ]);

  const billingsByOrder = new Map();
  for (const billing of billings) {
    const orderId = idOf(billing.order);
    if (!billingsByOrder.has(orderId)) billingsByOrder.set(orderId, billing);
  }
  const settledTotalsByOrder = new Map(
    settledPayments.map((payment) => [idOf(payment._id), normalizeMoney(payment.amount)])
  );

  return summarizeOutstandingOrders({ orders, billingsByOrder, settledTotalsByOrder });
}
