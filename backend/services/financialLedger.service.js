import crypto from 'crypto';
import Payment from '../models/payment.model.js';
import Order from '../models/order.model.js';

export const POSTED_POSITIVE_STATUSES = Object.freeze(['succeeded']);
export const POSTED_REFUND_STATUSES = Object.freeze(['refunded', 'succeeded']);

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const firstMoney = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return roundMoney(number);
  }
  return 0;
};

const objectIdString = (value) => {
  if (!value) return null;
  return String(value?._id || value);
};

export const isRefundPayment = (payment) => payment?.transactionType === 'refund';

export const isPostedPayment = (payment) => {
  if (!payment) return false;
  if (isRefundPayment(payment)) return POSTED_REFUND_STATUSES.includes(payment.status);
  return POSTED_POSITIVE_STATUSES.includes(payment.status);
};

export const getSubmittedAmount = (payment) => Math.abs(firstMoney(payment?.amountSubmitted, payment?.amount));

export const getVerifiedAmount = (payment) => {
  if (!isPostedPayment(payment)) return 0;
  return Math.abs(firstMoney(payment?.amountVerified, payment?.amountPaid, payment?.amount));
};

export const getSignedAmount = (payment) => {
  const amount = getVerifiedAmount(payment);
  return isRefundPayment(payment) ? -amount : amount;
};

export const getPaymentEffectiveAt = (payment) => {
  if (!isPostedPayment(payment)) return null;
  return payment?.effectiveAt || payment?.reviewedAt || payment?.paidAt || payment?.createdAt || null;
};

export const getPaymentSubmittedAt = (payment) => payment?.submittedAt || payment?.createdAt || null;

export const getOrderServiceTotal = (order, fallbackPayment = null) => {
  // serviceTotal was added after legacy totalPrice/totalAmount and defaults to
  // zero, so a zero placeholder must not hide a provable positive legacy total.
  for (const value of [
    order?.serviceTotal,
    order?.totalPrice,
    order?.totalAmount,
    fallbackPayment?.grandTotal,
    fallbackPayment?.subtotal,
  ]) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return roundMoney(amount);
  }
  return 0;
};

export const summarizeLedgerRows = (payments = [], serviceTotal = 0) => {
  const verifiedPayments = payments
    .filter((payment) => !isRefundPayment(payment) && isPostedPayment(payment))
    .reduce((sum, payment) => sum + getVerifiedAmount(payment), 0);
  const refunds = payments
    .filter((payment) => isRefundPayment(payment) && isPostedPayment(payment))
    .reduce((sum, payment) => sum + getVerifiedAmount(payment), 0);
  const netVerified = roundMoney(verifiedPayments - refunds);
  return {
    verifiedPayments: roundMoney(verifiedPayments),
    refunds: roundMoney(refunds),
    netVerified,
    outstandingBalance: roundMoney(Math.max(0, Number(serviceTotal || 0) - netVerified)),
  };
};

export const getMethodAllocations = (payment) => {
  const signedAmount = getSignedAmount(payment);
  const absoluteAmount = Math.abs(signedAmount);
  if (!absoluteAmount) return [];
  const direction = signedAmount < 0 ? -1 : 1;
  if (payment?.method !== 'split' || !Array.isArray(payment?.splitPayments) || !payment.splitPayments.length) {
    return [{ method: payment?.method || 'other', amount: roundMoney(direction * absoluteAmount) }];
  }

  const valid = payment.splitPayments
    .map((part) => ({ method: String(part?.method || 'other').toLowerCase(), amount: Math.max(0, firstMoney(part?.amount)) }))
    .filter((part) => part.amount > 0);
  const rawTotal = valid.reduce((sum, part) => sum + part.amount, 0);
  if (!rawTotal) return [{ method: 'other', amount: roundMoney(direction * absoluteAmount) }];

  let allocated = 0;
  return valid.map((part, index) => {
    const amount = index === valid.length - 1
      ? roundMoney(absoluteAmount - allocated)
      : roundMoney(absoluteAmount * (part.amount / rawTotal));
    allocated = roundMoney(allocated + amount);
    return { method: part.method, amount: roundMoney(direction * amount) };
  });
};

export const getServiceLines = (order, payment = null) => {
  const paymentItems = Array.isArray(payment?.items) ? payment.items : [];
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const source = paymentItems.length ? paymentItems : orderItems;
  const rawLines = source.map((item) => {
    const name = String(item?.name || item?.product?.name || order?.serviceType || 'Service').trim() || 'Service';
    const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1));
    return {
      serviceId: objectIdString(item?.serviceId || item?.product),
      name,
      quantity,
      value: roundMoney(firstMoney(item?.price, item?.unitPrice) * quantity),
    };
  }).filter((line) => line.value > 0 || line.name);
  if (rawLines.length) {
    const serviceTotal = getOrderServiceTotal(order, payment);
    const rawTotal = roundMoney(rawLines.reduce((sum, line) => sum + Math.max(0, line.value), 0));
    if (!rawTotal || !serviceTotal) return rawLines;

    const explicitSubtotal = [payment?.subtotal, order?.subtotal]
      .map(Number)
      .find((value) => Number.isFinite(value) && value > 0) || 0;
    const explicitDiscount = [payment?.discountAmount, order?.discountAmount]
      .map(Number)
      .find((value) => Number.isFinite(value) && value > 0) || 0;
    const allocatableTarget = roundMoney(explicitSubtotal > 0
      ? Math.min(serviceTotal, Math.max(0, explicitSubtotal - explicitDiscount))
      : Math.min(serviceTotal, rawTotal));
    let allocated = 0;
    const lines = rawLines.map((line, index) => {
      const value = index === rawLines.length - 1
        ? roundMoney(allocatableTarget - allocated)
        : roundMoney(allocatableTarget * (Math.max(0, line.value) / rawTotal));
      allocated = roundMoney(allocated + value);
      return { ...line, value };
    });
    const unassigned = roundMoney(serviceTotal - allocated);
    if (unassigned > 0) {
      lines.push({ serviceId: null, name: 'Unassigned', quantity: 1, value: unassigned });
    }
    return lines;
  }
  const total = getOrderServiceTotal(order, payment);
  if (order?.serviceType || payment?.service?.name) {
    return [{
      serviceId: objectIdString(order?.serviceId || payment?.service),
      name: String(payment?.service?.name || order?.serviceType || 'Service'),
      quantity: 1,
      value: total,
    }];
  }
  return [{ serviceId: null, name: 'Unassigned', quantity: 1, value: total }];
};

export const allocateAmountToServices = (amount, order, payment = null) => {
  const signed = roundMoney(amount);
  if (!signed) return [];
  const lines = getServiceLines(order, payment);
  const totalValue = lines.reduce((sum, line) => sum + Math.max(0, line.value), 0);
  if (!totalValue) return [{ serviceId: null, name: 'Unassigned', amount: signed }];
  const direction = signed < 0 ? -1 : 1;
  const assignable = roundMoney(direction * Math.min(Math.abs(signed), totalValue));
  let allocated = 0;
  const allocations = lines.map((line, index) => {
    const lineAmount = index === lines.length - 1
      ? roundMoney(assignable - allocated)
      : roundMoney(assignable * (Math.max(0, line.value) / totalValue));
    allocated = roundMoney(allocated + lineAmount);
    return { serviceId: line.serviceId, name: line.name || 'Unassigned', amount: lineAmount };
  });
  const remainder = roundMoney(signed - allocated);
  if (remainder) allocations.push({ serviceId: null, name: 'Unassigned', amount: remainder });
  return allocations;
};

export const refundableAmountForPayment = (payment, allPayments = []) => {
  if (!payment || isRefundPayment(payment) || !isPostedPayment(payment)) return 0;
  const paymentId = objectIdString(payment);
  const refunded = allPayments
    .filter((row) => isRefundPayment(row) && isPostedPayment(row) && objectIdString(row.relatedPayment) === paymentId)
    .reduce((sum, row) => sum + getVerifiedAmount(row), 0);
  return roundMoney(Math.max(0, getVerifiedAmount(payment) - refunded));
};

export const buildLedgerTransaction = (payment, { orderPayments = [], order: explicitOrder = null } = {}) => {
  const row = payment?.toObject ? payment.toObject() : payment || {};
  const order = explicitOrder || row.order || {};
  const customer = row.customer || order.customer || {};
  const vehicle = row.vehicle || order.vehicle || {};
  const serviceTotal = getOrderServiceTotal(order, row);
  const snapshot = summarizeLedgerRows(orderPayments.length ? orderPayments : [row], serviceTotal);
  const amountSubmitted = getSubmittedAmount(row);
  const amountVerified = getVerifiedAmount(row);
  const signedAmount = getSignedAmount(row);
  const submittedAt = getPaymentSubmittedAt(row);
  const effectiveAt = getPaymentEffectiveAt(row);
  const services = getServiceLines(order, row).map((line) => ({
    id: line.serviceId,
    name: line.name,
    price: line.value,
    qty: line.quantity,
  }));

  return {
    id: row.invoiceId || objectIdString(row),
    paymentId: objectIdString(row),
    transactionId: row.invoiceId || objectIdString(row),
    invoiceId: row.invoiceId || null,
    orderId: objectIdString(order),
    orderNumber: order?.orderNumber || null,
    bookingReference: order?.bookingReference || null,
    bookingId: order?.bookingReference || order?.orderNumber || objectIdString(order),
    customerId: objectIdString(customer) || objectIdString(row.customer),
    customerName: customer?.name || order?.customerName || 'Historical customer',
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || customer?.phoneNumber || customer?.contactNumber || order?.customerPhone || '',
    vehicleId: objectIdString(vehicle),
    vehiclePlate: order?.vehiclePlate || vehicle?.plateNumber || '',
    vehicleInfo: [order?.vehicleYear || vehicle?.year, order?.vehicleMake || vehicle?.make, order?.vehicleModel || vehicle?.model].filter(Boolean).join(' '),
    services,
    transactionType: row.transactionType || 'full_service_payment',
    amountSubmitted,
    amountVerified,
    signedAmount,
    serviceTotal,
    outstandingBalance: snapshot.outstandingBalance,
    refundableBalance: refundableAmountForPayment(row, orderPayments),
    paymentStatus: row.status || 'pending',
    bookingStatus: order?.status || null,
    method: row.method || 'other',
    splitPayments: row.splitPayments || [],
    methodAllocations: getMethodAllocations(row),
    submittedAt,
    effectiveAt,
    relatedPaymentId: objectIdString(row.relatedPayment),
    refundReason: row.refundReason || row.reviewReason || null,
    reviewedBy: row.reviewedBy || null,
    staffAssigned: row.staffAssigned || null,
    createdAt: row.createdAt || submittedAt,
    updatedAt: row.updatedAt || null,
    subtotal: firstMoney(row.subtotal, order?.subtotal),
    discountAmount: firstMoney(row.discountAmount, order?.discountAmount),
    taxVatAmount: firstMoney(row.taxVatAmount, order?.taxVatAmount),
    additionalFees: firstMoney(row.additionalFees, order?.additionalFees),
    grandTotal: serviceTotal,
    amountPaid: amountVerified,
    balanceRemaining: snapshot.outstandingBalance,
    amount: amountSubmitted,
    total: signedAmount || amountSubmitted,
    order,
    customer,
    vehicle,
    service: row.service || null,
    status: row.status || 'pending',
    reviewReason: row.reviewReason || null,
  };
};

export const getOrderLedger = async (orderId, { session = null } = {}) => {
  let query = Payment.find({ order: orderId }).sort({ effectiveAt: 1, createdAt: 1 });
  if (session) query = query.session(session);
  return query;
};

export const syncOrderFinancialSnapshot = async (order, payments = null, { session = null } = {}) => {
  const rows = payments || await getOrderLedger(order._id, { session });
  const total = getOrderServiceTotal(order, rows[0]);
  const summary = summarizeLedgerRows(rows, total);
  const reservationFees = rows
    .filter((row) => row.transactionType === 'reservation_fee' && isPostedPayment(row))
    .reduce((sum, row) => sum + getVerifiedAmount(row), 0);
  order.serviceTotal = total;
  order.amountCollected = summary.netVerified;
  order.downPaymentAmount = roundMoney(reservationFees);
  order.finalPaymentAmount = roundMoney(Math.max(0, summary.netVerified - reservationFees));
  if (summary.netVerified <= 0) {
    order.paymentStatus = summary.refunds > 0 ? 'refunded' : 'unpaid';
    order.paidAt = null;
  } else if (total > 0 && summary.netVerified + 0.009 >= total) {
    order.paymentStatus = 'paid';
    const effectiveDates = rows.map(getPaymentEffectiveAt).filter(Boolean).map((value) => new Date(value));
    order.paidAt = effectiveDates.length ? new Date(Math.max(...effectiveDates.map(Number))) : new Date();
  } else {
    order.paymentStatus = 'partially_paid';
    order.paidAt = null;
  }
  await order.save({ session });
  return summary;
};

const generateLedgerInvoiceId = (prefix = 'INV') => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

export const createVerifiedLedgerPayment = async ({
  order,
  amount,
  method,
  transactionType,
  actorId = null,
  provider = 'pos',
  providerReference = null,
  paymentReference = null,
  checkoutReference = null,
  splitPayments = [],
  metadata = {},
  expectedAmount = null,
  invoiceId = null,
  items = [],
  serviceTotal = null,
  session = null,
}) => {
  const verifiedAmount = roundMoney(amount);
  if (verifiedAmount <= 0) {
    const error = new Error('A positive payment amount is required.');
    error.statusCode = 400;
    throw error;
  }
  if (expectedAmount !== null && Math.abs(verifiedAmount - roundMoney(expectedAmount)) > 0.009) {
    const error = new Error(`Payment amount must match the server-calculated balance of ₱${roundMoney(expectedAmount).toFixed(2)}.`);
    error.statusCode = 409;
    error.code = 'LEDGER_AMOUNT_MISMATCH';
    throw error;
  }
  const existingRows = await getOrderLedger(order._id, { session });
  const resolvedTotal = serviceTotal === null ? getOrderServiceTotal(order) : roundMoney(serviceTotal);
  const before = summarizeLedgerRows(existingRows, resolvedTotal);
  if (transactionType !== 'additional_charge' && verifiedAmount > before.outstandingBalance + 0.009) {
    const error = new Error(`Payment exceeds the outstanding balance of ₱${before.outstandingBalance.toFixed(2)}.`);
    error.statusCode = 409;
    error.code = 'PAYMENT_EXCEEDS_BALANCE';
    throw error;
  }
  const now = new Date();
  const paymentPayload = {
    invoiceId: invoiceId || generateLedgerInvoiceId(),
    order: order._id,
    customer: order.customer?._id || order.customer,
    vehicle: order.vehicle?._id || order.vehicle || null,
    service: order.serviceId?._id || order.serviceId || null,
    amount: verifiedAmount,
    amountSubmitted: verifiedAmount,
    amountVerified: verifiedAmount,
    transactionType: transactionType || (before.netVerified > 0 ? 'service_balance' : 'full_service_payment'),
    currency: 'PHP',
    status: 'succeeded',
    method,
    splitPayments: method === 'split' ? splitPayments : [],
    provider,
    providerReference,
    paymentReference,
    checkoutReference,
    submittedAt: now,
    reviewedAt: now,
    effectiveAt: now,
    reviewedBy: actorId,
    staffAssigned: actorId,
    grandTotal: resolvedTotal,
    amountPaid: verifiedAmount,
    balanceRemaining: roundMoney(Math.max(0, before.outstandingBalance - verifiedAmount)),
    items,
    metadata,
    statusHistory: [{
      status: 'succeeded',
      amountSubmitted: verifiedAmount,
      amountVerified: verifiedAmount,
      changedAt: now,
      changedBy: actorId,
    }],
  };
  const created = await Payment.create(session ? [paymentPayload] : paymentPayload, session ? { session } : undefined);
  const payment = Array.isArray(created) ? created[0] : created;
  order.invoiceId = order.invoiceId || payment.invoiceId;
  order.paymentMethod = method;
  order.paymentProvider = provider;
  await syncOrderFinancialSnapshot(order, [...existingRows, payment], { session });
  return payment;
};

export const findRefundByIdempotency = async (relatedPayment, idempotencyKey) => {
  if (!idempotencyKey) return null;
  return Payment.findOne({ relatedPayment, transactionType: 'refund', idempotencyKey });
};

export const createRefundLedgerEntry = async ({
  originalPayment,
  amount = null,
  reason,
  actorId,
  idempotencyKey,
  method = null,
  provider = 'manual',
  providerReference = null,
  status = 'refunded',
  failureReason = null,
}) => {
  if (!originalPayment || isRefundPayment(originalPayment) || !isPostedPayment(originalPayment)) {
    const error = new Error('Only a verified original payment can be refunded.');
    error.statusCode = 409;
    throw error;
  }
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length < 3) {
    const error = new Error('A refund reason is required.');
    error.statusCode = 400;
    throw error;
  }
  const existing = await findRefundByIdempotency(originalPayment._id, idempotencyKey);
  if (existing) return { payment: existing, idempotent: true };

  const orderRows = await getOrderLedger(originalPayment.order?._id || originalPayment.order);
  const refundable = refundableAmountForPayment(originalPayment, orderRows);
  const requested = amount === null || amount === undefined || amount === '' ? refundable : roundMoney(amount);
  if (requested <= 0 || requested > refundable + 0.009) {
    const error = new Error(`Refund amount must be positive and cannot exceed ₱${refundable.toFixed(2)}.`);
    error.statusCode = 409;
    error.code = 'REFUND_EXCEEDS_REFUNDABLE_BALANCE';
    throw error;
  }

  const now = new Date();
  const originalAmount = Math.max(getVerifiedAmount(originalPayment), 0.01);
  let splitPayments = [];
  if (originalPayment.method === 'split') {
    const originalAllocations = getMethodAllocations(originalPayment);
    let allocated = 0;
    splitPayments = originalAllocations.map((part, index) => {
      const partAmount = index === originalAllocations.length - 1
        ? roundMoney(requested - allocated)
        : roundMoney(requested * (Math.abs(part.amount) / originalAmount));
      allocated = roundMoney(allocated + partAmount);
      return { method: part.method, amount: partAmount };
    });
  }
  const posted = POSTED_REFUND_STATUSES.includes(status);
  const refund = await Payment.create({
    invoiceId: generateLedgerInvoiceId('RFND'),
    order: originalPayment.order?._id || originalPayment.order,
    customer: originalPayment.customer?._id || originalPayment.customer || null,
    vehicle: originalPayment.vehicle?._id || originalPayment.vehicle || null,
    service: originalPayment.service?._id || originalPayment.service || null,
    amount: requested,
    amountSubmitted: requested,
    amountVerified: posted ? requested : null,
    transactionType: 'refund',
    currency: originalPayment.currency || 'PHP',
    status,
    method: method || originalPayment.method || 'other',
    splitPayments,
    provider,
    providerReference,
    submittedAt: now,
    reviewedAt: now,
    effectiveAt: posted ? now : null,
    reviewedBy: actorId,
    refundedBy: actorId,
    relatedPayment: originalPayment._id,
    refundReason: normalizedReason,
    reviewReason: failureReason || normalizedReason,
    idempotencyKey,
    checkoutReference: idempotencyKey ? `refund:${originalPayment._id}:${idempotencyKey}` : null,
    metadata: {
      refund: true,
      originalInvoiceId: originalPayment.invoiceId,
      failureReason: failureReason || null,
    },
    statusHistory: [{
      status,
      amountSubmitted: requested,
      amountVerified: posted ? requested : null,
      reason: failureReason || normalizedReason,
      changedAt: now,
      changedBy: actorId,
    }],
  });

  if (posted) {
    const order = originalPayment.order?.save
      ? originalPayment.order
      : await Order.findById(originalPayment.order);
    if (order) await syncOrderFinancialSnapshot(order, [...orderRows, refund]);
  }
  return { payment: refund, idempotent: false };
};
