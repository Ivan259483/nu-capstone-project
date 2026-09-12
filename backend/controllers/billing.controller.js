import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import Billing from '../models/billing.model.js';
import Payment from '../models/payment.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import { computeBillingTotals, normalizeMoney } from '../utils/billingTotals.js';
import { runPosCheckoutCore } from './payment.controller.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { buildInvoicePdfBuffer } from '../utils/pdf.utils.js';
import { notifyCustomerReceiptReady } from '../utils/customerReceiptNotification.utils.js';
import { resolvePlainVehiclePlate } from '../utils/vehiclePlate.utils.js';
import { isCustomerRole, isPosManagerRole } from '../constants/roles.js';
import {
  resolveReceiptPhoneForClient,
  USER_PHONE_SELECT_FIELDS,
} from '../utils/phone-client.utils.js';
import { hydrateReceiptSnapshot } from '../utils/receiptSnapshot.utils.js';
import { resolveCustomerReceiptCoverage } from '../utils/customerReceiptDetails.utils.js';
import { normalizePosPaymentMethod } from '../utils/paymentMethod.utils.js';
import { normalizeLifecycleKey } from '../constants/orderLifecycle.js';
import {
  LEDGER_BALANCE_SELECT_FIELDS,
  getOrderLedger,
  getOrderServiceTotal,
  summarizeLedgerRows,
} from '../services/financialLedger.service.js';
import { runInBackground, timeOperation } from '../utils/performance.utils.js';
import {
  durationMsSince,
  logCheckoutPhase,
  logPosPayment,
  timedPosPaymentStep,
  timedTraceStep,
} from '../utils/posPaymentLog.utils.js';

const RECEIPT_CUSTOMER_SELECT = `name email ${USER_PHONE_SELECT_FIELDS}`;
const RECEIPT_VEHICLE_SELECT = 'year make model color plateNumber vehicleType';
const BILLING_ORDER_SELECT = '_id orderNumber bookingReference downPaymentAmount totalPrice totalAmount serviceTotal pricingSnapshot';
const CHECKOUT_ORDER_BLOB_EXCLUSIONS = [
  '-trackerStageMedia.photoUrl',
  '-paymentProofUrl',
  '-downpaymentProof',
  '-legalCompliance.waiverPdf',
  '-legalCompliance.qcPdf',
  '-legalCompliance.preServicePhotos',
].join(' ');
const CHECKOUT_IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const POS_QUEUE_ORDER_SELECT = [
  '_id',
  'orderNumber',
  'bookingReference',
  'customer',
  'customerName',
  'customerPhone',
  'vehicle',
  'vehicleYear',
  'vehicleMake',
  'vehicleModel',
  'vehicleColor',
  'vehiclePlate',
  'vehicleType',
  'vehicleClass',
  'vehicleCategory',
  'serviceId',
  'serviceType',
  'items.product',
  'items.name',
  'items.quantity',
  'items.price',
  'subtotal',
  'discountAmount',
  'taxVatAmount',
  'additionalFees',
  'serviceTotal',
  'pricingSnapshot',
  'totalAmount',
  'totalPrice',
  'downPaymentAmount',
  'finalPaymentAmount',
  'paymentStatus',
  'paymentMethod',
  'posQueueStatus',
  'readyForPaymentAt',
  'qcCompletedAt',
].join(' ');

/**
 * The vehicle still has to be physically handed over after the balance settles.
 * Final settlement now advances the stage past `ready_pickup` to the terminal
 * `completed`, so the release affordance must accept the terminal stages too —
 * otherwise closing the tracker would also hide the handover action from Sales.
 */
const RELEASABLE_TRACKING_STAGES = new Set(['ready_pickup', 'completed', 'released']);

const isVehicleReleaseAvailable = (order) => Boolean(
  order
  && order.paymentStatus === 'paid'
  && RELEASABLE_TRACKING_STAGES.has(normalizeLifecycleKey(order.serviceTrackingStage))
  && order.readyForPickupEvidenceComplete
);

const sendPosQueueLoadError = (res, status, code, message) =>
  res.status(status).json({ success: false, message, code });


async function loadPickupEvidence(orderId) {
  const [row] = await Order.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
    { $project: {
      _id: 0,
      pickupEvidence: { $map: {
        input: { $filter: {
          input: { $ifNull: ['$trackerStageMedia', []] },
          as: 'media',
          cond: { $eq: ['$$media.stage', 'ready_pickup'] },
        } },
        as: 'media',
        in: {
          stage: '$$media.stage',
          slot: '$$media.slot',
          hasPhoto: { $ne: [{ $trim: {
            input: { $ifNull: ['$$media.photoUrl', ''] },
            chars: ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff',
          } }, ''] },
        },
      } },
    } },
  ]);
  return row?.pickupEvidence || [];
}

function mapLineItem(raw) {
  let serviceId = null;
  if (raw.serviceId && mongoose.isValidObjectId(String(raw.serviceId))) {
    serviceId = new mongoose.Types.ObjectId(String(raw.serviceId));
  }
  const bg = raw.billingGroup;
  const billingGroup = ['ceramic_spf', 'ppf', 'other', 'uncategorized'].includes(bg) ? bg : 'uncategorized';
  return {
    serviceId,
    name: String(raw.name || 'Service').slice(0, 200),
    billingGroup,
    unitPrice: normalizeMoney(raw.unitPrice),
    quantity: Math.max(1, Math.floor(Number(raw.quantity)) || 1),
    vehicleTier: String(raw.vehicleTier || '').slice(0, 80),
  };
}

function dedupeLineItems(rawItems, dedupe) {
  const items = (rawItems || []).map(mapLineItem);
  if (!dedupe) return items;
  const m = new Map();
  for (const li of items) {
    const key = li.serviceId ? li.serviceId.toString() : `name:${li.name.toLowerCase()}`;
    if (m.has(key)) {
      const ex = m.get(key);
      ex.quantity += li.quantity;
    } else {
      m.set(key, { ...li });
    }
  }
  return [...m.values()];
}

function applyComputed(billing) {
  const discount = billing.discount || { discountType: 'fixed', value: 0 };
  const computed = computeBillingTotals({
    lineItems: billing.lineItems,
    discount,
    taxVatAmount: billing.taxVatAmount,
    additionalFees: billing.additionalFees,
    downpayment: billing.downpayment,
  });
  billing.computed = computed;
  return computed;
}

async function applyLedgerCredit(billing, ledgerRows = null) {
  const rows = ledgerRows || await getOrderLedger(billing.order?._id || billing.order);
  const ledger = summarizeLedgerRows(rows, 0);
  billing.downpayment = normalizeMoney(Math.max(0, ledger.netVerified));
  applyComputed(billing);
  return ledger;
}

/**
 * GET /api/orders/:orderId/pos-queue-load
 * Lean, relation-checked payload used only when Sales loads a pickup queue row.
 * Media/proof/workflow fields are intentionally absent from the positive projection.
 */
export const getPosQueueLoad = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return sendPosQueueLoadError(res, 400, 'POS_QUEUE_INVALID_ID', 'Invalid queued order id');
    }

    const order = await timeOperation(
      { req, res, kind: 'db', name: 'posQueueLoad.order' },
      () => Order.findById(orderId)
        .select(POS_QUEUE_ORDER_SELECT)
        .populate('customer', RECEIPT_CUSTOMER_SELECT)
        .populate('vehicle', `${RECEIPT_VEHICLE_SELECT} pricingCategory`)
        .populate('items.product', 'name price category duration billingGroup')
    );

    if (!order) {
      return sendPosQueueLoadError(res, 404, 'POS_QUEUE_ORDER_NOT_FOUND', 'Queued order not found');
    }

    const customer = order.customer && typeof order.customer === 'object' ? order.customer : null;
    if (!customer?._id) {
      return sendPosQueueLoadError(
        res,
        422,
        'POS_QUEUE_CUSTOMER_MISSING',
        'Customer profile missing for queued order'
      );
    }

    const linkedVehicle = order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : null;
    const hasVehicleSnapshot = Boolean(
      String(order.vehicleMake || linkedVehicle?.make || '').trim()
      && String(order.vehicleModel || linkedVehicle?.model || '').trim()
    );
    if (!hasVehicleSnapshot) {
      return sendPosQueueLoadError(
        res,
        422,
        'POS_QUEUE_VEHICLE_MISSING',
        'Vehicle snapshot missing for queued order'
      );
    }

    let billing;
    let ledgerRows;
    try {
      [billing, ledgerRows] = await Promise.all([
        timeOperation(
          { req, res, kind: 'db', name: 'posQueueLoad.billing' },
          () => Billing.findOne({ order: orderId })
        ),
        timeOperation(
          { req, res, kind: 'db', name: 'posQueueLoad.payments' },
          () => getOrderLedger(orderId, { select: LEDGER_BALANCE_SELECT_FIELDS })
        ),
      ]);
    } catch (error) {
      error.statusCode = 503;
      error.code = 'POS_QUEUE_PAYMENT_LOOKUP_FAILED';
      error.message = 'Payment history could not be loaded for queued order';
      throw error;
    }

    if (!billing) {
      billing = await timeOperation(
        { req, res, kind: 'db', name: 'posQueueLoad.billing.create' },
        () => Billing.create({
          order: orderId,
          lineItems: [],
          status: 'pending',
          downpayment: normalizeMoney(order.downPaymentAmount || 0),
        })
      );
    }

    const hasServiceSnapshot = Boolean(
      billing.lineItems?.length
      || order.items?.some((item) => item?.name || item?.product?.name)
      || String(order.serviceType || '').trim()
    );
    if (!hasServiceSnapshot) {
      return sendPosQueueLoadError(
        res,
        422,
        'POS_QUEUE_SERVICE_MISSING',
        'Service snapshot missing for queued order'
      );
    }

    await applyLedgerCredit(billing, ledgerRows);
    await timeOperation(
      { req, res, kind: 'db', name: 'posQueueLoad.billing.save' },
      () => billing.save()
    );

    const orderPayload = order.toObject({ virtuals: true });
    orderPayload.vehiclePlate = resolvePlainVehiclePlate(
      order.vehiclePlate || linkedVehicle?.plateNumber
    );

    return res.json({
      success: true,
      data: {
        order: orderPayload,
        billing,
      },
    });
  } catch (error) {
    next(error);
  }
};

function pushBillingEvent(billing, req, action, summary, payload = null) {
  billing.events.push({
    at: new Date(),
    userId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
    action,
    summary,
    payload,
  });
}

function isBillingVersionConflict(err) {
  return (
    err?.name === 'VersionError' ||
    /No matching document found/i.test(String(err?.message || ''))
  );
}

function applyBillingBody(billing, body) {
  const dedupe = body.dedupeByServiceId !== undefined ? !!body.dedupeByServiceId : billing.dedupeByServiceId;

  if (Array.isArray(body.lineItems)) {
    billing.lineItems = dedupeLineItems(body.lineItems, dedupe);
  }
  if (body.discount) {
    billing.discount = {
      discountType: body.discount.discountType === 'percent' ? 'percent' : 'fixed',
      value: normalizeMoney(body.discount.value),
      reason: String(body.discount.reason || '').slice(0, 500),
    };
  }
  if (body.taxVatAmount !== undefined) billing.taxVatAmount = normalizeMoney(body.taxVatAmount);
  if (body.additionalFees !== undefined) billing.additionalFees = normalizeMoney(body.additionalFees);
  // Downpayment is a read-only projection of verified ledger value. Client
  // billing edits cannot manufacture or erase collected money.
  if (body.dedupeByServiceId !== undefined) billing.dedupeByServiceId = !!body.dedupeByServiceId;

  billing.version = (billing.version || 1) + 1;
  billing.status = billing.lineItems.length ? 'updated' : 'pending';
  applyComputed(billing);
}

async function syncOrderItemsFromBilling(order, billing) {
  order.items = billing.lineItems.map((li) => ({
    product: li.serviceId || undefined,
    name: li.name,
    quantity: li.quantity,
    price: li.unitPrice,
  }));
  if (billing.lineItems.length) {
    order.serviceType = billing.lineItems.map((l) => l.name).join(', ');
  }
  await order.save();
}

async function generateUniqueInvoiceNumber() {
  for (let i = 0; i < 12; i += 1) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const invoiceNumber = `INV-A4-${date}-${rand}`;
    const exists = await InvoiceRecord.exists({ invoiceNumber });
    if (!exists) return invoiceNumber;
  }
  const err = new Error('Could not allocate invoice number');
  err.statusCode = 500;
  throw err;
}

function buildInvoiceSnapshot({ invoiceNumber, order, billing, computed }) {
  const linkedVehicle =
    order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {};

  return {
    invoiceNumber,
    billingVersion: billing.version,
    issuedAt: new Date().toISOString(),
    orderNumber: order.orderNumber,
    bookingReference: order.bookingReference,
    customerName: order.customerName,
    customerPhone: resolveReceiptPhoneForClient(order),
    coverage: resolveCustomerReceiptCoverage({}, order.pricingSnapshot),
    vehicle: {
      year: order.vehicleYear || linkedVehicle.year,
      make: order.vehicleMake || linkedVehicle.make,
      model: order.vehicleModel || linkedVehicle.model,
      plate: resolvePlainVehiclePlate(order.vehiclePlate || linkedVehicle.plateNumber),
      color: order.vehicleColor || linkedVehicle.color,
      type:
        order.vehicleType ||
        order.vehicleClass ||
        order.vehicleCategory ||
        linkedVehicle.vehicleType,
    },
    lineItems: billing.lineItems.map((li) => ({
      name: li.name,
      billingGroup: li.billingGroup,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: normalizeMoney(li.unitPrice * li.quantity),
    })),
    discount: billing.discount,
    taxVatAmount: billing.taxVatAmount,
    additionalFees: billing.additionalFees,
    downpayment: billing.downpayment,
    computed,
    paymentStatus: 'paid',
  };
}

function buildReceiptFromPayment(payment, order) {
  const linkedVehicle = order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {};
  const amountCollected = normalizeMoney(
    payment.amountVerified ?? payment.amountPaid ?? payment.amount ?? 0
  );
  return {
    transactionId: payment.invoiceId,
    paymentId: payment._id,
    customerName: order.customer?.name || order.customerName || 'Customer',
    customerEmail: order.customer?.email || '',
    customerPhone: resolveReceiptPhoneForClient(order),
    vehicle: {
      year: order.vehicleYear || linkedVehicle.year || '',
      make: order.vehicleMake || linkedVehicle.make || '',
      model: order.vehicleModel || linkedVehicle.model || '',
      color: order.vehicleColor || linkedVehicle.color || '',
      type: order.vehicleType || order.vehicleClass || order.vehicleCategory || linkedVehicle.vehicleType || '',
      plate: resolvePlainVehiclePlate(order.vehiclePlate || linkedVehicle.plateNumber),
    },
    items: payment.items || [],
    subtotal: normalizeMoney(payment.subtotal),
    discountAmount: normalizeMoney(payment.discountAmount),
    taxVatAmount: normalizeMoney(payment.taxVatAmount),
    additionalFees: normalizeMoney(payment.additionalFees),
    downpayment: normalizeMoney(payment.downpayment),
    grandTotal: normalizeMoney(payment.grandTotal),
    serviceTotal: normalizeMoney(payment.grandTotal),
    totalAmount: normalizeMoney(payment.grandTotal),
    amountCollected,
    balanceRemaining: normalizeMoney(payment.balanceRemaining),
    total: amountCollected,
    paymentMethod: payment.method,
    splitPayments: payment.splitPayments || [],
    cashReceived: payment.cashReceived ?? null,
    amountReceived: payment.amountReceived ?? null,
    changeGiven: payment.changeGiven ?? null,
    paymentReference: payment.paymentReference || null,
    staff: null,
    bookingRef: order.orderNumber,
    date: (payment.effectiveAt || payment.createdAt || new Date()).toISOString(),
    inventoryWarnings: [],
  };
}

async function findCompletedCheckout(orderId, checkoutReference = null) {
  const filter = {
    order: orderId,
    status: 'succeeded',
    transactionType: { $in: ['service_balance', 'full_service_payment'] },
    ...(checkoutReference ? { checkoutReference } : {}),
  };
  return Payment.findOne(filter).sort({ createdAt: -1 });
}

async function buildCompletedCheckoutResponse({ order, billing, payment, idempotent = true, repair = true }) {
  const recoveryErrors = [];
  let invoiceRecord = null;
  if (payment.invoiceRecord) {
    invoiceRecord = await InvoiceRecord.findById(payment.invoiceRecord);
  }
  if (!invoiceRecord) {
    invoiceRecord = await InvoiceRecord.findOne({
      order: order._id,
      $or: [{ payment: payment._id }, { payment: null }],
    }).sort({ createdAt: -1 });
  }

  if (repair && invoiceRecord && !invoiceRecord.payment) {
    invoiceRecord.payment = payment._id;
    try {
      await invoiceRecord.save();
    } catch (error) {
      recoveryErrors.push({ code: 'POS_RECEIPT_ATTACH_FAILED', message: error.message });
    }
  }
  if (repair && invoiceRecord && !payment.invoiceRecord) {
    payment.invoiceRecord = invoiceRecord._id;
    try {
      await payment.save();
    } catch (error) {
      recoveryErrors.push({ code: 'POS_PAYMENT_RECEIPT_LINK_FAILED', message: error.message });
    }
  }
  if (repair && billing.status !== 'checked_out') {
    billing.status = 'checked_out';
    try {
      await billing.save();
    } catch (error) {
      recoveryErrors.push({ code: 'POS_BILLING_FINALIZE_FAILED', message: error.message });
    }
  }

  const invoiceNumber = invoiceRecord?.invoiceNumber || payment.invoiceId;
  return {
    success: true,
    message: idempotent ? 'Checkout already completed' : 'Checkout completed',
    idempotent,
    paymentCommitted: true,
    receiptPending: !invoiceRecord || recoveryErrors.some((error) => error.code.includes('RECEIPT')),
    billingSyncPending: recoveryErrors.some((error) => error.code === 'POS_BILLING_FINALIZE_FAILED'),
    data: {
      invoiceNumber,
      invoiceRecordId: invoiceRecord?._id || null,
      paymentId: payment._id,
      posInvoiceId: payment.invoiceId,
      receipt: buildReceiptFromPayment(payment, order),
      vehicleReleaseAvailable: isVehicleReleaseAvailable(order),
      inventoryWarnings: [],
      pdfUrl: invoiceRecord ? `/api/invoices/${encodeURIComponent(invoiceNumber)}/pdf` : null,
      snapshot: invoiceRecord?.snapshot || null,
    },
  };
}

/**
 * GET /api/orders/:orderId/billing/checkout-status
 * Read-only reconciliation after a client loses the checkout response.
 */
export const getCheckoutStatus = async (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const { orderId } = req.params;
  const context = { req, orderId: String(orderId || ''), reference: null };
  try {
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        code: 'POS_CHECKOUT_INVALID_ORDER_ID',
        message: 'Invalid order id',
      });
    }
    const [order, billing, payment] = await Promise.all([
      Order.findById(orderId)
        .select(CHECKOUT_ORDER_BLOB_EXCLUSIONS)
        .populate('customer', RECEIPT_CUSTOMER_SELECT)
        .populate('vehicle', RECEIPT_VEHICLE_SELECT),
      Billing.findOne({ order: orderId }),
      findCompletedCheckout(orderId),
    ]);
    if (!order) {
      return res.status(404).json({
        success: false,
        code: 'POS_CHECKOUT_ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }
    context.reference = order.bookingReference || order.orderNumber || null;
    if (!payment) {
      const body = {
        success: true,
        paymentCommitted: false,
        billingStatus: billing?.status || null,
        data: null,
      };
      logPosPayment({
        ...context,
        step: 'checkout_status',
        status: 200,
        body: { paymentCommitted: false, billingStatus: body.billingStatus },
        durationMs: durationMsSince(startedAt),
      });
      return res.json(body);
    }
    if (!billing) {
      return res.status(409).json({
        success: false,
        code: 'POS_CHECKOUT_BILLING_NOT_FOUND',
        message: 'Payment exists but billing could not be found.',
      });
    }
    const body = await buildCompletedCheckoutResponse({
      order,
      billing,
      payment,
      idempotent: true,
      repair: false,
    });
    logPosPayment({
      ...context,
      step: 'checkout_status',
      status: 200,
      body: { paymentCommitted: true, paymentId: String(payment._id) },
      durationMs: durationMsSince(startedAt),
    });
    return res.json(body);
  } catch (error) {
    logPosPayment({
      ...context,
      step: 'checkout_status',
      status: 500,
      body: { code: error.code || null, message: error.message },
      durationMs: durationMsSince(startedAt),
    });
    next(error);
  }
};

/**
 * GET /api/orders/:orderId/billing
 */
export const getBilling = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await Order.findById(orderId).select(BILLING_ORDER_SELECT);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let billing = await Billing.findOne({ order: orderId });
    if (!billing) {
      billing = await Billing.create({
        order: orderId,
        lineItems: [],
        status: 'pending',
        downpayment: normalizeMoney(order.downPaymentAmount || 0),
      });
    }
    await applyLedgerCredit(billing);
    await billing.save();

    return res.json({ success: true, data: billing });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/orders/:orderId/billing
 */
export const putBilling = async (req, res, next) => {
  const requestStartedAt = process.hrtime.bigint();
  const trace = {
    req,
    tracePrefix: 'BILLING-SAVE',
    orderId: String(req.params.orderId || ''),
    reference: null,
    requestStartedAt,
  };
  logCheckoutPhase(trace, 'hooks/middleware', 'end', {
    note: 'time from route entry to controller entry (auth + global middleware)',
    stepMs: req._traceReceivedAt
      ? durationMsSince(req._traceReceivedAt).toFixed(1)
      : null,
  });
  logCheckoutPhase(trace, 'saveOrderWithSlotTransition', 'mark', {
    note: 'not invoked on this route — billing save never writes the Order document',
  });
  res.on('finish', () => {
    logCheckoutPhase(trace, 'response sent', 'mark', {
      httpStatus: res.statusCode,
      totalMs: durationMsSince(requestStartedAt).toFixed(1),
    });
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      logCheckoutPhase(trace, 'response aborted before send', 'mark', {
        totalMs: durationMsSince(requestStartedAt).toFixed(1),
      });
    }
  });
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await timedTraceStep(
      trace,
      'order lookup',
      () => Order.findById(orderId).select(BILLING_ORDER_SELECT)
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    trace.reference = order.bookingReference || order.orderNumber || null;
    const orderLedgerRows = await timedTraceStep(
      trace,
      'order ledger lookup',
      () => getOrderLedger(order._id),
      { endExtra: (rows) => ({ rowCount: rows?.length ?? 0 }) }
    );
    const orderLedger = summarizeLedgerRows(orderLedgerRows, getOrderServiceTotal(order));
    if (orderLedger.netVerified > 0 && orderLedger.outstandingBalance <= 0.009) {
      return res.status(400).json({ success: false, message: 'Cannot edit billing on a paid order' });
    }

    const body = req.body || {};
    const MAX_ATTEMPTS = 4;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let billing = await timedTraceStep(
        trace,
        'billing document lookup',
        () => Billing.findOne({ order: orderId }),
        { startExtra: { attempt } }
      );
      if (!billing) {
        billing = new Billing({ order: orderId });
      }
      if (billing.status === 'checked_out') {
        return res.status(400).json({ success: false, message: 'Billing already checked out' });
      }

      await timedTraceStep(trace, 'payload normalization', async () => applyBillingBody(billing, body));
      await timedTraceStep(trace, 'ledger credit lookup', () => applyLedgerCredit(billing));

      await timedTraceStep(trace, 'assign billing fields', async () => {
        billing.lastEditedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
        pushBillingEvent(billing, req, 'billing_updated', `v${billing.version} — ${billing.lineItems.length} line(s)`, {
          computed: billing.computed,
        });
      });

      await timedTraceStep(trace, 'billing validation', () => billing.validate());

      try {
        await timedTraceStep(
          trace,
          'mongoose save/update',
          () => billing.save({ validateBeforeSave: false })
        );
      } catch (saveErr) {
        if (isBillingVersionConflict(saveErr) && attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
          continue;
        }
        throw saveErr;
      }

      logActivity({
        req,
        type: 'billing_update',
        module: 'Sales',
        action: 'Billing updated',
        description: `Order ${order.orderNumber || orderId} billing v${billing.version} (${billing.lineItems.length} lines).`,
        status: 'info',
        referenceId: String(order._id),
        metadata: { orderId: order._id, billingVersion: billing.version },
      });

      const payload = await timedTraceStep(
        trace,
        'response serialization',
        async () => JSON.stringify({ success: true, data: billing }),
        { endExtra: (json) => ({ bytes: json.length }) }
      );
      logCheckoutPhase(trace, 'response sending', 'mark', { httpStatus: 200, bytes: payload.length });
      return res.type('application/json').send(payload);
    }

    return res.status(409).json({
      success: false,
      message: 'Billing was updated by another action. Please try again.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/orders/:orderId/billing/checkout
 */
export const checkoutBilling = async (req, res, next) => {
  let invoiceRecord = null;
  let paymentCommitted = false;
  const requestStartedAt = process.hrtime.bigint();
  const context = {
    req,
    orderId: String(req.params.orderId || ''),
    reference: null,
    requestStartedAt,
  };
  logCheckoutPhase(context, 'controller entered', 'mark', {
    method: req.method,
    originalUrl: req.originalUrl || req.url,
    origin: req.get('origin') || null,
    host: req.get('host') || null,
    idempotencyKey: req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || null,
    userId: req.user?.id || null,
  });
  res.on('finish', () => {
    logCheckoutPhase(context, 'response sent', 'mark', {
      httpStatus: res.statusCode,
      totalMs: durationMsSince(requestStartedAt).toFixed(1),
    });
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      logCheckoutPhase(context, 'response aborted before send', 'mark', {
        totalMs: durationMsSince(requestStartedAt).toFixed(1),
      });
    }
  });
  const sendFailure = (status, code, message) => {
    const body = { success: false, message, ...(code ? { code } : {}) };
    logCheckoutPhase(context, 'response sending', 'mark', { httpStatus: status, code: code || null });
    logPosPayment({
      ...context,
      step: 'response',
      status,
      body,
      durationMs: durationMsSince(requestStartedAt),
    });
    return res.status(status).json(body);
  };
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return sendFailure(400, 'POS_CHECKOUT_INVALID_ORDER_ID', 'Invalid order id');
    }

    const {
      paymentMethod: requestedPaymentMethod,
      staffId,
      cashReceived,
      amountReceived,
      paymentReference,
      splitPayments = [],
    } = req.body || {};

    logCheckoutPhase(context, 'idempotency lookup', 'start');
    const providedIdempotencyKey = String(
      req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || req.body?.idempotencyKey || ''
    ).trim();
    if (providedIdempotencyKey && !CHECKOUT_IDEMPOTENCY_PATTERN.test(providedIdempotencyKey)) {
      return sendFailure(400, 'POS_CHECKOUT_INVALID_IDEMPOTENCY_KEY', 'Invalid checkout idempotency key');
    }
    const idempotencyKey = providedIdempotencyKey || `pos-final:${orderId}`;
    const checkoutReference = `billing-checkout:${orderId}:${idempotencyKey}`;
    logCheckoutPhase(context, 'idempotency lookup', 'end', { idempotencyKey, checkoutReference });

    const paymentMethod = normalizePosPaymentMethod(requestedPaymentMethod);
    if (!paymentMethod) {
      return sendFailure(
        400,
        'POS_CHECKOUT_PAYMENT_METHOD_REQUIRED',
        'Payment method is required and must be cash or gcash'
      );
    }

    const [order, billing, pickupEvidence] = await Promise.all([
      timedPosPaymentStep(context, 'find_order', () => Order.findById(orderId)
        .select(CHECKOUT_ORDER_BLOB_EXCLUSIONS)
        .populate('customer', RECEIPT_CUSTOMER_SELECT)
        .populate('vehicle', RECEIPT_VEHICLE_SELECT), 'order lookup'),
      timedPosPaymentStep(context, 'find_billing', () => Billing.findOne({ order: orderId }), 'billing lookup'),
      timedPosPaymentStep(context, 'find_pickup_evidence', () => loadPickupEvidence(orderId), 'pickup evidence lookup'),
    ]);
    if (!order) {
      return sendFailure(404, 'POS_CHECKOUT_ORDER_NOT_FOUND', 'Order not found');
    }
    context.reference = order.bookingReference || order.orderNumber || null;
    if (!billing) {
      return sendFailure(404, 'POS_CHECKOUT_BILLING_NOT_FOUND', 'Billing not found');
    }

    const previousPayment = await timedPosPaymentStep(
      context,
      'check_existing_payment',
      () => findCompletedCheckout(orderId),
      'existing payment lookup'
    );
    if (previousPayment) {
      const replay = await timedPosPaymentStep(
        context,
        'replay_committed_payment',
        () => buildCompletedCheckoutResponse({ order, billing, payment: previousPayment }),
        'idempotent replay build'
      );
      logPosPayment({
        ...context,
        step: 'response',
        status: 200,
        body: {
          success: true,
          idempotent: true,
          paymentCommitted: true,
          paymentId: String(previousPayment._id),
          invoiceNumber: replay.data.invoiceNumber,
        },
        durationMs: durationMsSince(requestStartedAt),
      });
      logCheckoutPhase(context, 'response sending', 'mark', { httpStatus: 200, idempotent: true });
      return res.json(replay);
    }
    if (billing.status === 'checked_out') {
      return sendFailure(
        409,
        'POS_CHECKOUT_BILLING_STATE_MISMATCH',
        'Billing is checked out but no completed payment could be found.'
      );
    }
    if (!billing.lineItems?.length) {
      return sendFailure(400, 'POS_CHECKOUT_LINE_ITEMS_REQUIRED', 'Add at least one line item before checkout');
    }

    await timedPosPaymentStep(context, 'load_ledger_credit', () => applyLedgerCredit(billing), 'ledger credit lookup');

    const discountForCalc =
      billing.discount && Number(billing.discount.value) > 0
        ? billing.discount
        : { discountType: 'fixed', value: 0 };
    const discountObj =
      billing.discount && Number(billing.discount.value) > 0 ? billing.discount : null;

    const lineItemsForTotals = billing.lineItems.map((li) => ({
      unitPrice: li.unitPrice,
      quantity: li.quantity,
    }));
    const totals = computeBillingTotals({
      lineItems: lineItemsForTotals,
      discount: discountForCalc,
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: billing.downpayment,
    });

    if (!Number.isFinite(totals.grandTotal) || totals.grandTotal < 0) {
      return sendFailure(400, 'POS_CHECKOUT_INVALID_TOTALS', 'Invalid billing totals');
    }

    await timedPosPaymentStep(context, 'sync_order_items', () => syncOrderItemsFromBilling(order, billing), 'order item sync');

    const invoiceNumber = await timedPosPaymentStep(
      context,
      'allocate_invoice_number',
      generateUniqueInvoiceNumber,
      'invoice number allocation'
    );
    const snapshot = buildInvoiceSnapshot({ invoiceNumber, order, billing, computed: totals });

    invoiceRecord = await timedPosPaymentStep(
      context,
      'create_receipt_snapshot',
      () => InvoiceRecord.create({
        invoiceNumber,
        order: order._id,
        billingVersion: billing.version,
        snapshot,
        createdBy: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
      }),
      'receipt snapshot'
    );

    const allItems = billing.lineItems.map((li) => ({
      serviceId: li.serviceId || null,
      name: li.name,
      price: li.unitPrice,
      quantity: li.quantity,
      isAddon: false,
    }));

    const { payment, receiptData, inventoryWarnings, invoiceId } = await timedPosPaymentStep(
      context,
      'commit_payment_and_settle_order',
      () => runPosCheckoutCore({
        req,
        order,
        allItems,
        subtotal: totals.subtotal,
        discountAmount: totals.discountTotal,
        discount: discountObj,
        taxVatAmount: billing.taxVatAmount,
        additionalFees: billing.additionalFees,
        downpayment: billing.downpayment,
        grandTotal: totals.grandTotal,
        balanceDue: totals.balanceDue,
        paymentMethod,
        staffId,
        cashReceived,
        amountReceived,
        paymentReference,
        splitPayments,
        invoiceRecordId: invoiceRecord._id,
        billingVersion: billing.version,
        pickupEvidence,
        metadataExtra: {
          invoiceRecordNumber: invoiceNumber,
          billingCheckout: true,
          checkoutReference,
          idempotencyKey,
        },
        traceContext: context,
      }),
      'payment commit and settle'
    );
    paymentCommitted = true;

    invoiceRecord.payment = payment._id;
    invoiceRecord.snapshot = {
      ...invoiceRecord.snapshot,
      paidAt: payment.createdAt || new Date(),
      payment: {
        paymentId: payment._id?.toString(),
        posInvoiceId: invoiceId,
        method: payment.method || paymentMethod,
        status: payment.status || 'succeeded',
        subtotal: receiptData.subtotal,
        discountAmount: receiptData.discountAmount,
        taxVatAmount: receiptData.taxVatAmount,
        additionalFees: receiptData.additionalFees,
        downpayment: receiptData.downpayment,
        grandTotal: receiptData.grandTotal,
        serviceTotal: receiptData.serviceTotal,
        totalAmount: receiptData.totalAmount,
        amountCollected: receiptData.amountCollected,
        cashReceived: receiptData.cashReceived,
        amountReceived: receiptData.amountReceived,
        changeGiven: receiptData.changeGiven,
        paymentReference: receiptData.paymentReference,
        balanceRemaining: receiptData.balanceRemaining,
        splitPayments: receiptData.splitPayments || [],
        staff: receiptData.staff || null,
      },
    };
    invoiceRecord.markModified('snapshot');
    const finalizeErrors = [];
    try {
      await timedPosPaymentStep(context, 'attach_receipt_to_payment', () => invoiceRecord.save(), 'receipt snapshot attach');
    } catch (receiptError) {
      finalizeErrors.push({ code: 'POS_RECEIPT_ATTACH_FAILED', message: receiptError.message });
    }

    const customerId = order.customer?._id || order.customer;
    if (customerId) {
      void runInBackground(
        { req, name: 'posCheckout.receiptNotification' },
        () => notifyCustomerReceiptReady({
          customerId,
          orderId: order._id,
          orderNumber: order.orderNumber,
          bookingReference: order.bookingReference,
          invoiceNumber,
          paymentId: payment._id,
          amountCollected: totals.balanceDue,
        })
      );
    }

    billing.status = 'checked_out';
    pushBillingEvent(billing, req, 'billing_checked_out', `Invoice ${invoiceNumber}`, {
      paymentId: payment._id,
      invoiceNumber,
    });
    try {
      await timedPosPaymentStep(context, 'mark_billing_checked_out', () => billing.save(), 'billing update');
    } catch (billingError) {
      finalizeErrors.push({ code: 'POS_BILLING_FINALIZE_FAILED', message: billingError.message });
    }

    try {
      logActivity({
        req,
        type: 'billing_checkout',
        module: 'Sales',
        action: 'Billing checkout',
        description: `Order ${order.orderNumber} checked out — ${invoiceNumber} (₱${totals.balanceDue}).`,
        status: 'success',
        referenceId: invoiceNumber,
        metadata: { orderId: order._id, paymentId: payment._id, invoiceNumber },
      });
    } catch (activityError) {
      console.warn('[POS PAYMENT] billing activity log failed:', activityError.message);
    }

    const responseBody = {
      success: true,
      message: finalizeErrors.length
        ? 'Payment completed. Receipt or billing refresh needs retry.'
        : 'Checkout completed',
      idempotent: false,
      paymentCommitted: true,
      receiptPending: finalizeErrors.some((error) => error.code === 'POS_RECEIPT_ATTACH_FAILED'),
      billingSyncPending: finalizeErrors.some((error) => error.code === 'POS_BILLING_FINALIZE_FAILED'),
      data: {
        invoiceNumber,
        invoiceRecordId: invoiceRecord._id,
        paymentId: payment._id,
        posInvoiceId: invoiceId,
        receipt: receiptData,
        vehicleReleaseAvailable: isVehicleReleaseAvailable(order),
        inventoryWarnings,
        pdfUrl: `/api/invoices/${encodeURIComponent(invoiceNumber)}/pdf`,
        snapshot: invoiceRecord.snapshot,
      },
    };
    logPosPayment({
      ...context,
      step: 'response',
      status: 200,
      body: {
        success: true,
        paymentCommitted: true,
        paymentId: String(payment._id),
        invoiceNumber,
        finalizeErrors,
      },
      durationMs: durationMsSince(requestStartedAt),
    });
    logCheckoutPhase(context, 'response sending', 'mark', { httpStatus: 200, invoiceNumber });
    return res.json(responseBody);
  } catch (err) {
    if (err.code === 'CHECKOUT_ALREADY_COMPLETED') {
      try {
        const order = await Order.findById(context.orderId)
          .select(CHECKOUT_ORDER_BLOB_EXCLUSIONS)
          .populate('customer', RECEIPT_CUSTOMER_SELECT)
          .populate('vehicle', RECEIPT_VEHICLE_SELECT);
        const billing = await Billing.findOne({ order: context.orderId });
        const existing = await findCompletedCheckout(context.orderId);
        if (order && billing && existing) {
          if (invoiceRecord?._id && String(existing.invoiceRecord || '') !== String(invoiceRecord._id)) {
            await InvoiceRecord.deleteOne({ _id: invoiceRecord._id }).catch(() => {});
          }
          const replay = await buildCompletedCheckoutResponse({ order, billing, payment: existing });
          logPosPayment({
            ...context,
            reference: order.bookingReference || order.orderNumber || context.reference,
            step: 'response',
            status: 200,
            body: { success: true, idempotent: true, paymentCommitted: true },
            durationMs: durationMsSince(requestStartedAt),
          });
          logCheckoutPhase(context, 'response sending', 'mark', { httpStatus: 200, idempotent: true });
          return res.json(replay);
        }
      } catch (replayError) {
        console.error('[POS PAYMENT] idempotent replay failed:', replayError.message);
      }
    }
    if (!paymentCommitted && invoiceRecord?._id) {
      await InvoiceRecord.deleteOne({ _id: invoiceRecord._id }).catch(() => {});
    }
    if (err.statusCode === 400 || err.statusCode === 409) {
      return sendFailure(err.statusCode, err.code, err.message);
    }
    logCheckoutPhase(context, 'response sending', 'mark', {
      httpStatus: 500,
      code: err.code || null,
      message: err.message,
    });
    logPosPayment({
      ...context,
      step: 'response',
      status: 500,
      body: { success: false, code: err.code || null, message: err.message },
      durationMs: durationMsSince(requestStartedAt),
    });
    next(err);
  }
};

/**
 * GET /api/orders/:orderId/billing/receipt-pdf
 * PDF receipt for the latest checkout invoice — order owner (customer) or POS staff.
 */
export const getOrderReceiptPdf = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const role = req.user?.role;
    if (!isCustomerRole(role) && !isPosManagerRole(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const order = await Order.findById(orderId)
      .select(
        'customer customerPhone vehicle vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate ' +
        'vehicleType vehicleClass vehicleCategory'
      )
      .populate('customer', RECEIPT_CUSTOMER_SELECT)
      .populate('vehicle', RECEIPT_VEHICLE_SELECT)
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const ownerId = order.customer?._id?.toString?.() || order.customer?.toString?.() || '';
    if (isCustomerRole(role) && ownerId !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const inv = await InvoiceRecord.findOne({ order: orderId })
      .sort({ createdAt: -1 })
      .lean();

    if (!inv?.snapshot) {
      return res.status(404).json({ success: false, message: 'Receipt not available yet' });
    }

    const snapshot = hydrateReceiptSnapshot(inv.snapshot, order);
    const buf = buildInvoicePdfBuffer(snapshot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${encodeURIComponent(orderId)}.pdf"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};
