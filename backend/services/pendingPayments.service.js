import Billing from '../models/billing.model.js';
import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import { computeBillingTotals, normalizeMoney } from '../utils/billingTotals.js';
import { getSignedAmount, LEDGER_BALANCE_SELECT_FIELDS } from './financialLedger.service.js';
import { timeOperation } from '../utils/performance.utils.js';

export const PENDING_PAYMENT_STATUSES = Object.freeze([
  'pending',
  'unpaid',
  'partially_paid',
  'awaiting_settlement',
]);

const EXCLUDED_ORDER_STATUSES = new Set(['cancelled', 'rejected']);
const LEGITIMATE_ORDER_STATUSES = new Set([
  'approved', 'confirmed', 'assigned', 'queued', 'received', 'in_progress',
  'ready_for_payment', 'completed', 'paid', 'released',
]);

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

export function calculateOutstandingTransaction({ order, billing = null, settledPaymentTotal = 0 }) {
  if (!order || order.archived === true) return null;

  const orderStatus = normalizePaymentStatus(order.status);
  if (EXCLUDED_ORDER_STATUSES.has(orderStatus) || !LEGITIMATE_ORDER_STATUSES.has(orderStatus) || !order.approvedAt) return null;

  const total = totalServiceAmount(order, billing);
  // Order flags and billing downpayment fields are projections only. The signed
  // posted ledger total is the sole financial authority.
  const paid = normalizeMoney(Math.max(0, settledPaymentTotal));
  const outstanding = normalizeMoney(Math.max(0, total - paid));
  if (total <= 0 || outstanding <= 0) return null;

  const paymentStatus = paid > 0 && outstanding < total
    ? 'partially_paid'
    : 'unpaid';

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

export async function getPendingPaymentsSummary(timing = {}) {
  const orders = await timeOperation({ ...timing, kind: 'db', name: 'pendingPayments.orders' }, () => Order.find({
    archived: { $ne: true },
    approvedAt: { $ne: null },
    status: { $in: [...LEGITIMATE_ORDER_STATUSES] },
  })
    .select(
      '_id orderNumber bookingReference status paymentStatus archived serviceTotal totalPrice totalAmount ' +
      'subtotal discountAmount taxVatAmount additionalFees downPaymentAmount amountCollected finalPaymentAmount approvedAt'
    )
    .lean());

  if (orders.length === 0) {
    return summarizeOutstandingOrders({ orders: [] });
  }

  const orderIds = orders.map((order) => order._id);
  const [billings, settledPayments] = await Promise.all([
    timeOperation({ ...timing, kind: 'db', name: 'pendingPayments.billings' }, () => Billing.find({ order: { $in: orderIds } })
      .select('order lineItems discount taxVatAmount additionalFees downpayment version updatedAt')
      .sort({ version: -1, updatedAt: -1 })
      .lean()),
    timeOperation({ ...timing, kind: 'db', name: 'pendingPayments.payments' }, () =>
      Payment.find({ order: { $in: orderIds } }).select(LEDGER_BALANCE_SELECT_FIELDS).lean()),
  ]);

  const billingsByOrder = new Map();
  for (const billing of billings) {
    const orderId = idOf(billing.order);
    if (!billingsByOrder.has(orderId)) billingsByOrder.set(orderId, billing);
  }
  const settledTotalsByOrder = new Map();
  settledPayments.forEach((payment) => {
    const orderId = idOf(payment.order);
    settledTotalsByOrder.set(orderId, normalizeMoney(
      (settledTotalsByOrder.get(orderId) || 0) + getSignedAmount(payment)
    ));
  });

  return summarizeOutstandingOrders({ orders, billingsByOrder, settledTotalsByOrder });
}
