import crypto from 'crypto';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import Order from '../models/order.model.js';
import Service from '../models/service.model.js';
import Product from '../models/product.model.js';
import Payment from '../models/payment.model.js';
import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import ActivityLog from '../models/activityLog.model.js';
import { getIO } from '../utils/socket.utils.js';
import { invalidateResponseCache } from '../utils/responseCache.utils.js';
import { isCustomerRole } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { notifyCustomerReceiptReady } from '../utils/customerReceiptNotification.utils.js';
import { createCustomerPaymentConfirmedNotification } from '../utils/customerStageNotifications.utils.js';
import { normalizeMoney, computeDiscountAmount, computeBillingTotals } from '../utils/billingTotals.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from '../utils/trackerGatePhotos.utils.js';
import {
  evaluateReadyForPickupQueueEligibility,
} from '../utils/readyPickupPaymentFlow.utils.js';
import {
  captureOrderSlotOccupancy,
  saveOrderWithSlotTransition,
} from '../services/slot.service.js';
import {
  resolveReceiptPhoneForClient,
  USER_PHONE_SELECT_FIELDS,
} from '../utils/phone-client.utils.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import {
  getPendingPaymentsSummary,
  PENDING_PAYMENT_STATUSES,
} from '../services/pendingPayments.service.js';
import { normalizePaymentMethod } from '../utils/paymentMethod.utils.js';
import {
  buildLedgerTransaction,
  LEDGER_BALANCE_SELECT_FIELDS,
  createRefundLedgerEntry,
  findRefundByIdempotency,
  getOrderLedger,
  getOrderServiceTotal,
  getPaymentEffectiveAt,
  getSignedAmount,
  isPostedPayment,
  refundableAmountForPayment,
  roundMoney,
  syncOrderFinancialSnapshot,
  summarizeLedgerRows,
} from '../services/financialLedger.service.js';
import { getVisitEvidenceAt } from '../services/salesAnalytics.service.js';
import { timeOperation } from '../utils/performance.utils.js';
import { parseReportingRange } from '../utils/reportingRange.utils.js';
import PaymentReconciliationEvent from '../models/paymentReconciliationEvent.model.js';
import { getSystemState } from '../services/systemState.service.js';
import { beginTrackedSystemMutation } from '../middleware/systemLifecycle.middleware.js';
import {
  findCustomerPaymentInvoiceMetadata,
  reservationReceiptNumber,
} from './customerReceipt.controller.js';
import { getCustomerVisibleTrackerStageMedia } from '../utils/customerTrackerEvidence.utils.js';

const LOW_STOCK_THRESHOLD = 10;
const LOCAL_PAYMENTS_PROVIDER = (process.env.LOCAL_PAYMENTS_PROVIDER || 'paymongo').toLowerCase();
const FRONTEND_URL = (() => {
  const isProduction = process.env.NODE_ENV === 'production';
  const safeDefault = isProduction ? 'https://www.autospf.shop' : 'http://localhost:5173';
  const candidate = String(process.env.FRONTEND_URL || safeDefault).trim();
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
      throw new Error('must be an origin without credentials, path, query, or fragment');
    }
    if (isProduction && parsed.protocol !== 'https:') throw new Error('production URL must use HTTPS');
    return parsed.origin;
  } catch (error) {
    console.warn(`[Payments] Invalid FRONTEND_URL; using the safe default: ${error.message}`);
    return safeDefault;
  }
})();
const RECEIPT_CUSTOMER_SELECT = `name email ${USER_PHONE_SELECT_FIELDS}`;
const RECEIPT_VEHICLE_SELECT = 'year make model color plateNumber vehicleType';
const CUSTOMER_PAYMENT_HISTORY_SELECT = [
  '_id',
  'invoiceId',
  'order',
  'vehicle',
  'service',
  'amount',
  'status',
  'transactionType',
  'amountSubmitted',
  'amountVerified',
  'amountPaid',
  'method',
  'submittedAt',
  'effectiveAt',
  'reviewedAt',
  'relatedPayment',
  'items',
  'subtotal',
  'discountAmount',
  'grandTotal',
  'invoiceRecord',
  'createdAt',
].join(' ');
const CUSTOMER_PAYMENT_HISTORY_SUMMARY_SELECT =
  '_id amount amountSubmitted amountVerified amountPaid status transactionType effectiveAt reviewedAt createdAt';

const QUEUE_STALE_ERROR_CODE = 'POS_QUEUE_STALE';
const CHECKOUT_DUPLICATE_ERROR_CODE = 'CHECKOUT_ALREADY_COMPLETED';

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const options = {};
  if (process.env.STRIPE_API_VERSION) {
    options.apiVersion = process.env.STRIPE_API_VERSION;
  }
  return new Stripe(key, options);
};

const generateInvoiceId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${date}-${random}`;
};

const allocateUniquePaymentInvoiceId = async (preferredInvoiceId) => {
  const preferred = String(preferredInvoiceId || '').trim();
  if (preferred) {
    const existing = await Payment.exists({ invoiceId: preferred });
    if (!existing) return preferred;
  }

  for (let i = 0; i < 12; i += 1) {
    const candidate = generateInvoiceId();
    const existing = await Payment.exists({ invoiceId: candidate });
    if (!existing) return candidate;
  }

  const err = new Error('Could not allocate payment invoice id');
  err.statusCode = 500;
  throw err;
};

const checkoutConflict = (message, code = CHECKOUT_DUPLICATE_ERROR_CODE) => {
  const err = new Error(message);
  err.statusCode = 409;
  err.code = code;
  return err;
};

const buildCheckoutReference = ({
  order,
  invoiceRecordId,
  billingVersion,
  grandTotal,
  amountCollected,
  metadataExtra = {},
}) => {
  const provided = String(metadataExtra.checkoutReference || '').trim();
  if (provided) return provided;
  const orderId = order?._id?.toString?.() || String(order?._id || 'unknown-order');
  const checkoutScope = invoiceRecordId
    ? `invoice:${invoiceRecordId}`
    : billingVersion
      ? `billing-v:${billingVersion}`
      : 'direct-pos';
  return [
    'pos-checkout',
    orderId,
    checkoutScope,
    normalizeMoney(grandTotal).toFixed(2),
    normalizeMoney(amountCollected).toFixed(2),
  ].join(':');
};

const isPickupQueueCheckoutContext = (order) => {
  const status = String(order?.status || '').toLowerCase().replace(/-/g, '_');
  const stage = String(order?.serviceTrackingStage || '').toLowerCase().replace(/-/g, '_');
  return (
    order?.posQueueStatus === 'balance_pickup_queue' ||
    status === 'ready_for_payment' ||
    stage === 'ready_pickup'
  );
};

const assertPickupQueueCheckoutStillEligible = async (order) => {
  if (!isPickupQueueCheckoutContext(order)) return null;
  const result = await evaluateReadyForPickupQueueEligibility(order, {
    persist: false,
    emit: false,
    notify: false,
  });
  if (!result.eligible || result.remainingBalance <= 0) {
    throw checkoutConflict(
      'This order is no longer eligible for checkout.',
      QUEUE_STALE_ERROR_CODE
    );
  }
  return result;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findProductByName = async (name) => {
  if (!name) return null;
  let product = await Product.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (product) return product;
  product = await Product.findOne({ name: new RegExp(escapeRegex(name), 'i') });
  return product;
};

const notifyInventoryIssue = async ({ title, message, metadata }) => {
  try {
    const normalizedTitle = String(title || '').toLowerCase();
    const requiredForService = /mapping missing|inventory alert|reservation warning/.test(normalizedTitle);
    const remaining = Number(metadata?.remaining ?? metadata?.available);
    const event = requiredForService
      ? 'required_item_unavailable'
      : Number.isFinite(remaining) && remaining <= 0
        ? 'out_of_stock'
        : 'low_stock';
    const productScope = metadata?.productId || metadata?.productName || metadata?.serviceId || 'unmapped';
    await createAdminNotification({
      title,
      message,
      category: 'inventory',
      event,
      severity: event === 'out_of_stock' ? 'critical' : 'warning',
      source: 'Inventory',
      actionRequired: true,
      groupingKey: buildAdminGroupingKey('inventory', event, productScope),
      groupingWindowMs: 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('inventory', metadata?.productId ? { productId: String(metadata.productId) } : {}),
      action: { label: 'Review inventory' },
      metadata,
    });
  } catch (error) {
    console.error('Failed to create inventory notification:', error.message);
  }
};

const PAYMENT_INVENTORY_MAP = [
  {
    keyword: 'full ceramic coating',
    items: [
      { productNames: ['Ceramic Coating', 'Ceramic Coat'], quantity: 1 },
      { productNames: ['Microfiber Towel', 'Microfiber Towels'], quantity: 5 },
    ],
  },
  {
    keyword: 'ceramic coating',
    items: [
      { productNames: ['Ceramic Liquid', 'Ceramic Coating'], quantity: 1 },
      { productNames: ['Applicator Pad', 'Applicator Pads'], quantity: 1 },
    ],
  },
];

const resolveInventoryForService = async (service, serviceLabel) => {
  const resolved = [];
  const insufficient = [];

  if (service?.recipe?.length) {
    for (const entry of service.recipe) {
      let product = null;
      if (entry.product) {
        product = await Product.findById(entry.product);
      }
      if (!product && entry.productName) {
        product = await findProductByName(entry.productName);
      }
      const quantity = Number(entry.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      if (!product) {
        await notifyInventoryIssue({
          title: 'Inventory Mapping Missing',
          message: `${service.name}: recipe item not found (${entry.productName || 'Unnamed item'})`,
          metadata: {
            serviceId: service._id,
            serviceName: service.name,
            productName: entry.productName,
            quantity,
            unit: entry.unit,
          },
        });
        continue;
      }

      if (product.inventory < quantity) {
        insufficient.push({ product, quantity, unit: entry.unit, serviceName: service.name });
        continue;
      }

      resolved.push({ product, quantity });
    }

  }

  const label = (serviceLabel || '').toLowerCase();
  const entry = PAYMENT_INVENTORY_MAP.find((item) => label.includes(item.keyword));
  if (entry) {
    for (const mapping of entry.items) {
      let product = null;
      for (const name of mapping.productNames) {
        product = await findProductByName(name);
        if (product) break;
      }

      if (!product) {
        await notifyInventoryIssue({
          title: 'Inventory Mapping Missing',
          message: `Missing inventory mapping for ${mapping.productNames[0]} (${serviceLabel || 'Service'})`,
          metadata: {
            keyword: mapping.productNames[0],
            serviceName: serviceLabel,
          },
        });
        continue;
      }

      const alreadyIncluded = resolved.some((item) => item.product._id.toString() === product._id.toString());
      if (alreadyIncluded) {
        continue;
      }

      if (product.inventory < mapping.quantity) {
        insufficient.push({ product, quantity: mapping.quantity, serviceName: serviceLabel });
        continue;
      }

      resolved.push({ product, quantity: mapping.quantity });
    }
  }

  return { resolved, insufficient };
};

const applyInventoryDeductions = async (order) => {
  if (order.inventoryDeductedAt) {
    return { skipped: true };
  }

  let service = null;
  let serviceLabel = order.serviceType || '';

  if (order.items?.length) {
    const itemProduct = order.items[0]?.product;
    if (itemProduct) {
      service = await Service.findById(itemProduct);
      if (service?.name) serviceLabel = service.name;
    }
  }

  const { resolved, insufficient } = await resolveInventoryForService(service, serviceLabel);

  for (const item of insufficient) {
    await notifyInventoryIssue({
      title: 'Inventory Alert',
      message: `${item.product.name} out of stock for ${item.serviceName || 'service'} (needed ${item.quantity}${item.unit ? ` ${item.unit}` : ''}, available ${item.product.inventory})`,
      metadata: {
        productId: item.product._id,
        productName: item.product.name,
        required: item.quantity,
        available: item.product.inventory,
        serviceName: item.serviceName,
      },
    });
  }

  for (const item of resolved) {
    const previousInventory = Number.isFinite(item.product.inventory) ? item.product.inventory : 0;
    const updatedInventory = previousInventory - item.quantity;
    item.product.inventory = updatedInventory;
    await item.product.save();

    if (previousInventory > LOW_STOCK_THRESHOLD && updatedInventory <= LOW_STOCK_THRESHOLD) {
      await notifyInventoryIssue({
        title: 'Low Stock',
        message: `Low Stock: ${item.product.name} only has ${updatedInventory} units left`,
        metadata: {
          productId: item.product._id,
          productName: item.product.name,
          threshold: LOW_STOCK_THRESHOLD,
          remaining: updatedInventory,
        },
      });
    }
  }

  order.inventoryDeductedAt = new Date();
  await order.save();

  return { skipped: false, deducted: resolved.length };
};

const finalizePayment = async (payment, order, payload = {}) => {
  const now = new Date();
  payment.status = 'succeeded';
  payment.amountSubmitted = payment.amountSubmitted ?? payment.amount;
  payment.amountVerified = payment.amountVerified ?? payment.amount;
  payment.submittedAt = payment.submittedAt || payment.createdAt || now;
  payment.reviewedAt = payment.reviewedAt || now;
  payment.effectiveAt = payment.effectiveAt || now;
  payment.transactionType = payment.transactionType || 'full_service_payment';
  payment.providerReference = payload.providerReference || payment.providerReference;
  payment.metadata = { ...payment.metadata, ...payload.metadata };
  await payment.save();

  order.invoiceId = order.invoiceId || payment.invoiceId;
  order.paymentMethod = payment.method;
  order.paymentProvider = payment.provider;
  const prevStatus = order.status;
  await syncOrderFinancialSnapshot(order);

  await applyInventoryDeductions(order);

  // Trigger workflow orchestrator if status changed
  if (prevStatus !== order.status) {
    onOrderStatusChange(order, prevStatus).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in finalizePayment:', err.message)
    );
  }

  logActivity({
    type: 'payment_success', module: 'POS', action: 'Payment Completed',
    description: `Payment ${payment.invoiceId} — ₱${payment.amount?.toLocaleString()} via ${(payment.method || 'payment').toUpperCase()} for order ${order.orderNumber || order._id}.`,
    userId: order.customer?._id || order.customer, userName: order.customerName || 'Customer',
    status: 'success', referenceId: payment.invoiceId,
    metadata: { paymentId: payment._id, orderId: order._id, amount: payment.amount, method: payment.method },
  });

  try {
    const io = getIO();
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (customerId) {
      io.to(`user:${customerId.toString()}`).emit('booking:status', {
        bookingId: order._id?.toString?.() || order.id,
        status: order.status,
        customerStatus: order.customerStatus,
        paymentStatus: order.paymentStatus,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('Socket not initialized for payment status update:', error.message);
  }

  try {
    const existing = await Notification.findOne({
      'metadata.paymentId': payment._id,
      type: 'success',
      recipientRole: 'admin_family',
    });
    if (!existing) {
      await createAdminNotification({
        title: 'Payment Completed',
        message: `Payment ${payment.invoiceId} received (${payment.method?.toUpperCase() || 'PAYMENT'})`,
        category: 'payments',
        event: 'payment_completed',
        severity: 'success',
        source: 'Payments',
        actionRequired: false,
        groupingKey: buildAdminGroupingKey('payments', 'payment_completed', payment._id),
        groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
        link: buildAdminDeepLink('payments', { paymentId: String(payment._id), orderId: String(order._id) }),
        action: { label: 'View payment' },
        metadata: {
          paymentId: payment._id,
          orderId: order._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
        },
      });
    }
  } catch (notifyError) {
    console.error('Failed to notify payment completion:', notifyError.message);
  }

  try {
    await createCustomerPaymentConfirmedNotification(order, payment);
  } catch (notifyError) {
    console.error('Failed to notify customer payment completion:', notifyError.message);
  }
};

const recordFailedStripePayment = async (stripePaymentIntent) => {
  const paymentId = stripePaymentIntent?.metadata?.paymentId;
  const payment = paymentId
    ? await Payment.findById(paymentId)
    : await Payment.findOne({ providerReference: stripePaymentIntent?.id });
  if (!payment || payment.status === 'succeeded' || payment.status === 'refunded') return null;

  const failureReason = String(
    stripePaymentIntent?.last_payment_error?.message
      || stripePaymentIntent?.cancellation_reason
      || 'Stripe reported that the payment failed.',
  ).slice(0, 500);
  payment.status = 'failed';
  payment.metadata = {
    ...(payment.metadata || {}),
    stripeStatus: stripePaymentIntent?.status || 'failed',
    failureReason,
  };
  await payment.save();

  await createAdminNotification({
    title: 'Payment failed',
    message: `Payment ${payment.invoiceId} failed and needs review.`,
    category: 'payments',
    event: 'payment_failed',
    severity: 'critical',
    source: 'Stripe',
    actionRequired: true,
    groupingKey: buildAdminGroupingKey('payments', 'payment_failed', payment._id),
    groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
    link: buildAdminDeepLink('payments', {
      paymentId: String(payment._id),
      orderId: String(payment.order),
    }),
    action: { label: 'Review payment' },
    metadata: {
      paymentId: payment._id,
      orderId: payment.order,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      providerReference: payment.providerReference,
      failureReason,
    },
  });

  logActivity({
    type: 'payment_failed',
    module: 'POS',
    action: 'Payment Failed',
    description: `Payment ${payment.invoiceId} failed: ${failureReason}`,
    status: 'error',
    referenceId: payment.invoiceId,
    metadata: { paymentId: payment._id, orderId: payment.order, failureReason },
  });
  return payment;
};

const getOrderForPayment = async (orderId, user) => {
  const order = await Order.findById(orderId);
  if (!order) return null;

  if (isCustomerRole(user?.role) && order.customer.toString() !== user.id) {
    return null;
  }

  return order;
};

const getOutstandingForOrder = async (order) => {
  const rows = await getOrderLedger(order._id);
  const snapshot = summarizeLedgerRows(rows, getOrderServiceTotal(order));
  return { rows, ...snapshot };
};

export const createStripePaymentIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    const ledger = await getOutstandingForOrder(order);
    const amount = ledger.outstandingBalance;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const existingPayment = await Payment.findOne({
      order: order._id,
      status: 'pending',
      method: 'card',
      provider: 'stripe',
    });
    if (existingPayment?.metadata?.clientSecret) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment._id,
          invoiceId: existingPayment.invoiceId,
          clientSecret: existingPayment.metadata.clientSecret,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
        },
      });
    }
    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: 'Payment already initiated for this booking.',
      });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      amountSubmitted: amount,
      transactionType: ledger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
      submittedAt: new Date(),
      currency: 'PHP',
      status: 'pending',
      method: 'card',
      provider: 'stripe',
      metadata: { orderNumber: order.orderNumber },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'php',
      description: `AutoSPF+ Booking ${order.orderNumber}`,
      metadata: {
        orderId: order._id.toString(),
        invoiceId,
        paymentId: payment._id.toString(),
      },
      automatic_payment_methods: { enabled: true },
    });

    payment.providerReference = paymentIntent.id;
    payment.metadata = { ...payment.metadata, clientSecret: paymentIntent.client_secret };
    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createStripeCheckoutSession = async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    const ledger = await getOutstandingForOrder(order);
    const amount = ledger.outstandingBalance;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const existingPayment = await Payment.findOne({
      order: order._id,
      status: 'pending',
      method: 'card',
      provider: 'stripe',
    });
    if (existingPayment?.metadata?.checkoutUrl) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment._id,
          invoiceId: existingPayment.invoiceId,
          checkoutUrl: existingPayment.metadata.checkoutUrl,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
        },
      });
    }
    if (existingPayment) {
      return res.status(409).json({ success: false, message: 'Payment already initiated for this booking.' });
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      amountSubmitted: amount,
      transactionType: ledger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
      submittedAt: new Date(),
      currency: 'PHP',
      status: 'pending',
      method: 'card',
      provider: 'stripe',
      metadata: { orderNumber: order.orderNumber },
    });

    let customerEmail = undefined;
    if (order.customer) {
      const customer = await User.findById(order.customer).select('email');
      customerEmail = customer?.email;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'php',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: order.serviceType || `AutoSPF+ Booking ${order.orderNumber}`,
            },
          },
        },
      ],
      success_url: `${FRONTEND_URL}/dashboard?payment=success&order=${order._id}`,
      cancel_url: `${FRONTEND_URL}/dashboard?payment=cancel&order=${order._id}`,
      customer_email: customerEmail,
      metadata: {
        orderId: order._id.toString(),
        paymentId: payment._id.toString(),
        invoiceId,
      },
    });

    payment.providerReference = session.id;
    payment.metadata = { ...payment.metadata, checkoutUrl: session.url };
    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        checkoutUrl: session.url,
        amount,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createLocalPaymentPlaceholder = async (req, res, next) => {
  try {
    const { orderId, method } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const paymentMethod = (method || 'gcash').toLowerCase();
    if (!['gcash', 'maya'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid local payment method' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    const ledger = await getOutstandingForOrder(order);
    const amount = ledger.outstandingBalance;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      amountSubmitted: amount,
      transactionType: ledger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
      submittedAt: new Date(),
      currency: 'PHP',
      status: 'pending',
      method: paymentMethod,
      provider: LOCAL_PAYMENTS_PROVIDER,
      providerReference: `LOCAL-${invoiceId}`,
      metadata: { orderNumber: order.orderNumber },
    });

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        status: payment.status,
        provider: payment.provider,
        method: payment.method,
        checkoutUrl: null,
        message: `${paymentMethod.toUpperCase()} placeholder created via ${payment.provider}.`,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const confirmStripePayment = async (req, res, next) => {
  try {
    const { paymentId, paymentIntentId } = req.body || {};
    if (!paymentId && !paymentIntentId) {
      return res.status(400).json({ success: false, message: 'Payment ID or PaymentIntent ID is required' });
    }

    const payment = paymentId
      ? await Payment.findById(paymentId)
      : await Payment.findOne({ providerReference: paymentIntentId });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }
    if (payment.status === 'succeeded') {
      return res.json({ success: true, message: 'Payment already confirmed', data: { invoiceId: payment.invoiceId } });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const intentId = payment.providerReference || paymentIntentId;
    if (!intentId) {
      return res.status(400).json({ success: false, message: 'Missing Stripe PaymentIntent reference' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.json({
        success: false,
        message: 'Payment is not completed yet',
        status: paymentIntent.status,
      });
    }

    const order = await Order.findById(payment.order);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await finalizePayment(payment, order, {
      providerReference: paymentIntent.id,
      metadata: { stripeStatus: paymentIntent.status },
    });

    res.json({ success: true, message: 'Payment confirmed', data: { invoiceId: payment.invoiceId } });
  } catch (error) {
    next(error);
  }
};

export const stripeWebhookHandler = async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(500).send('Stripe not configured');
  }

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).send('Stripe webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    const systemState = await getSystemState();
    if (systemState.mode === 'archived') {
      let archiveTicket;
      try {
        archiveTicket = await beginTrackedSystemMutation({
          allowArchived: true,
          throwOnBlocked: true,
          kind: 'internal',
          requestId: req.id,
        });
      } catch (error) {
        return res.status(error.statusCode || 503).json({
          received: false,
          code: error.code || 'SYSTEM_MUTATION_BLOCKED',
        });
      }
      try {
        const rawPayload = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
        const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
        const object = event.data?.object || {};
        const metadata = object.metadata || {};
        const paymentId = mongoose.isValidObjectId(metadata.paymentId)
          ? metadata.paymentId
          : null;
        const orderId = mongoose.isValidObjectId(metadata.orderId)
          ? metadata.orderId
          : null;
        const eventId = String(event.id || payloadHash);
        const amount = Number(
          object.amount_total
          ?? object.amount_received
          ?? object.amount
          ?? object.amount_due,
        );
        const providerSnapshot = {
          eventId,
          eventType: String(event.type || 'unknown'),
          eventCreatedAt: Number.isFinite(Number(event.created))
            ? new Date(Number(event.created) * 1000).toISOString()
            : null,
          livemode: Boolean(event.livemode),
          objectType: String(object.object || 'unknown'),
          objectId: object.id ? String(object.id) : null,
          status: object.status ? String(object.status) : null,
          paymentStatus: object.payment_status ? String(object.payment_status) : null,
          amountMinor: Number.isFinite(amount) ? amount : null,
          currency: object.currency ? String(object.currency).toLowerCase() : null,
          metadata: { orderId, paymentId },
        };

        const reconciliationWrite = await PaymentReconciliationEvent.updateOne(
          { provider: 'stripe', eventId },
          {
            $setOnInsert: {
              provider: 'stripe',
              eventId,
              eventType: String(event.type || 'unknown'),
              signatureVerified: true,
              payloadHash,
              providerSnapshot,
              orderId,
              paymentId,
              status: 'pending',
              receivedAt: new Date(),
            },
          },
          { upsert: true, runValidators: true },
        );

        if (systemState.protectedAdministratorId && reconciliationWrite.upsertedCount === 1) {
          await createAdminNotification({
            title: 'Archived payment event needs reconciliation',
            message: `Stripe sent ${event.type || 'a payment event'} after AutoSPF+ was archived. No booking or payment record was changed.`,
            category: 'payments',
            event: 'archived_payment_reconciliation',
            severity: 'warning',
            source: 'Stripe Webhook',
            recipientRole: 'administrator',
            recipientUserId: systemState.protectedAdministratorId,
            actionRequired: true,
            groupingKey: `archived-payment:${eventId}`,
            link: '/admin?section=system_management',
            action: { label: 'Review event', link: '/admin?section=system_management' },
            metadata: {
              provider: 'stripe',
              eventId,
              eventType: event.type || 'unknown',
              orderId,
              paymentId,
            },
          }).catch((error) => {
            console.warn('[Stripe webhook] Reconciliation alert failed:', error.message);
          });
        }

        return res.json({ received: true, archived: true, reconciliationPending: true });
      } finally {
        archiveTicket.release();
      }
    }
  } catch (error) {
    console.error('Failed to persist archived Stripe reconciliation event:', error.message);
    return res.status(500).json({ received: false });
  }

  let mutationTicket;
  try {
    mutationTicket = await beginTrackedSystemMutation({ throwOnBlocked: true });
  } catch (error) {
    console.warn('[Stripe webhook] System mutation gate blocked event:', error.code || error.message);
    return res.status(error.statusCode || 503).json({
      received: false,
      code: error.code || 'SYSTEM_MUTATION_BLOCKED',
    });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paymentId = session.metadata?.paymentId;
      const orderId = session.metadata?.orderId;

      try {
        let payment = paymentId ? await Payment.findById(paymentId) : null;
        if (!payment && session.id) {
          payment = await Payment.findOne({ providerReference: session.id });
        }
        if (!payment) {
          console.warn('Payment record not found for checkout session:', session.id);
          return res.json({ received: true });
        }
        if (payment.status === 'succeeded') {
          return res.json({ received: true });
        }

        const order = orderId ? await Order.findById(orderId) : await Order.findById(payment.order);
        if (!order) {
          console.warn('Order not found for checkout session:', session.id);
          return res.json({ received: true });
        }

        await finalizePayment(payment, order, {
          providerReference: session.id,
          metadata: { stripeSessionStatus: session.status },
        });
      } catch (error) {
        console.error('Failed to finalize payment from webhook:', error.message);
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      try {
        await recordFailedStripePayment(event.data.object);
      } catch (error) {
        console.error('Failed to record Stripe payment failure:', error.message);
      }
    }

    return res.json({ received: true });
  } finally {
    mutationTicket.release();
  }
};

export const getSalesToday = async (req, res, next) => {
  try {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const range = parseReportingRange({ range: 'custom', from: today, to: today });
    const payments = await Payment.find({ status: { $in: ['succeeded', 'refunded'] } });
    const recognized = payments.filter((payment) => {
      const effectiveAt = getPaymentEffectiveAt(payment);
      const time = effectiveAt ? new Date(effectiveAt).getTime() : NaN;
      return isPostedPayment(payment) && time >= range.start.getTime() && time <= range.end.getTime();
    });
    const total = roundMoney(recognized.reduce((sum, payment) => sum + getSignedAmount(payment), 0));
    const count = recognized.length;

    res.json({
      success: true,
      data: {
        total,
        count,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/my
 * Returns payment history for the currently authenticated customer.
 * Includes total spent and payment count for convenience.
 */
export const getMyPayments = async (req, res, next) => {
  const historyStartedAt = performance.now();
  const timing = {
    paymentsFetch: 0,
    transactionsFetch: 0,
    bookingOrderLookup: 0,
    receiptsFetch: 0,
    refundsFetch: 0,
    responseNormalization: 0,
  };
  console.info(`[PAYMENT HISTORY] start customer=${req.user?.id || 'unknown'}`);
  res.once('finish', () => {
    console.info(
      `[PAYMENT HISTORY] complete customer=${req.user?.id || 'unknown'} status=${res.statusCode}\n` +
      `payments fetch: ${timing.paymentsFetch.toFixed(1)} ms\n` +
      `transactions fetch: ${timing.transactionsFetch.toFixed(1)} ms\n` +
      `booking/order lookup: ${timing.bookingOrderLookup.toFixed(1)} ms\n` +
      `receipts fetch: ${timing.receiptsFetch.toFixed(1)} ms\n` +
      `refunds fetch: ${timing.refundsFetch.toFixed(1)} ms\n` +
      `response normalization: ${timing.responseNormalization.toFixed(1)} ms\n` +
      `total: ${(performance.now() - historyStartedAt).toFixed(1)} ms`
    );
  });
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query?.limit) || 100)));
    const page = Math.max(1, Math.floor(Number(req.query?.page) || 1));
    const skip = (page - 1) * limit;
    const measure = async (key, operation) => {
      const startedAt = performance.now();
      try {
        return await operation();
      } finally {
        timing[key] = performance.now() - startedAt;
      }
    };

    const [pagePayments, summaryRows] = await Promise.all([
      measure('paymentsFetch', () => Payment.find({ customer: userId })
        .select(CUSTOMER_PAYMENT_HISTORY_SELECT)
        .sort({ effectiveAt: -1, submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()),
      measure('refundsFetch', () => Payment.find({ customer: userId })
        .select(CUSTOMER_PAYMENT_HISTORY_SUMMARY_SELECT)
        .lean()),
    ]);

    const orderIds = [...new Set(pagePayments.map((payment) => String(payment.order || '')).filter(Boolean))];
    const [populatedPayments, orderPayments, invoices] = await Promise.all([
      measure('bookingOrderLookup', () => Payment.populate(pagePayments, [
        {
          path: 'order',
          select: 'orderNumber bookingReference customer customerName customerPhone serviceType status vehicle vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate totalPrice totalAmount serviceTotal items approvedAt cancelledAt arrivedAt',
        },
        { path: 'vehicle', select: 'year make model color plateNumber vehicleType' },
        { path: 'service', select: 'name price' },
      ])),
      measure('transactionsFetch', () => orderIds.length
        ? Payment.find({ order: { $in: orderIds } }).select(LEDGER_BALANCE_SELECT_FIELDS).lean()
        : []),
      measure('receiptsFetch', () => findCustomerPaymentInvoiceMetadata(pagePayments)),
    ]);

    const byOrder = new Map();
    orderPayments.forEach((payment) => {
      const orderId = String(payment.order || '');
      if (!byOrder.has(orderId)) byOrder.set(orderId, []);
      byOrder.get(orderId).push(payment);
    });

    const normalizationStartedAt = performance.now();
    const payments = populatedPayments.map((payment) => {
      const transaction = buildLedgerTransaction(payment, {
        orderPayments: byOrder.get(String(payment.order?._id || payment.order || '')) || [],
      });
      return {
        paymentId: transaction.paymentId,
        transactionId: transaction.transactionId,
        invoiceId: transaction.invoiceId,
        orderId: transaction.orderId,
        orderNumber: transaction.orderNumber,
        bookingReference: transaction.bookingReference,
        transactionType: transaction.transactionType,
        paymentStatus: transaction.paymentStatus,
        amountSubmitted: transaction.amountSubmitted,
        amountVerified: transaction.amountVerified,
        signedAmount: transaction.signedAmount,
        effectiveAt: transaction.effectiveAt,
        submittedAt: transaction.submittedAt,
        createdAt: transaction.createdAt,
        method: transaction.method,
        vehicleInfo: transaction.vehicleInfo,
        vehiclePlate: transaction.vehiclePlate,
        services: transaction.services,
        outstandingBalance: transaction.outstandingBalance,
        receiptAvailable: Boolean(reservationReceiptNumber(payment)) || invoices.has(String(payment._id)),
        receiptNumber: reservationReceiptNumber(payment) || invoices.get(String(payment._id))?.invoiceNumber || null,
      };
    });
    const postedPayments = summaryRows.filter((payment) =>
      isPostedPayment(payment) && payment.transactionType !== 'refund');
    const refundRows = summaryRows.filter((payment) =>
      isPostedPayment(payment) && payment.transactionType === 'refund');
    const totalReceived = roundMoney(postedPayments.reduce(
      (sum, payment) => sum + getSignedAmount(payment), 0));
    const refundTotal = roundMoney(refundRows.reduce(
      (sum, payment) => sum + Math.abs(getSignedAmount(payment)), 0));
    const totalSpent = roundMoney(totalReceived - refundTotal);
    const totalCount = postedPayments.length;
    const summary = {
      totalPaid: totalSpent,
      paymentCount: totalCount,
      refundTotal,
      totalReceived,
    };
    timing.responseNormalization = performance.now() - normalizationStartedAt;

    res.json({
      success: true,
      data: payments,
      transactions: payments,
      summary,
      totalSpent,
      totalCount,
      pagination: {
        page,
        limit,
        total: summaryRows.length,
        pages: Math.max(1, Math.ceil(summaryRows.length / limit)),
      },
      currency: 'PHP',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/customer/:customerId/summary
 * Cashier-safe customer history derived only from succeeded payment records.
 */
export const getCustomerPaymentSummary = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ success: false, message: 'Invalid customer id' });
    }

    const customerObjectId = new mongoose.Types.ObjectId(customerId);
    const payments = await Payment.find({ customer: customerObjectId })
      .sort({ effectiveAt: -1, submittedAt: -1, createdAt: -1 })
      .populate(
        'order',
        'orderNumber bookingReference serviceType status arrivedAt egressData serviceProper qcCompletedAt jobOrder'
      );
    const postedPositive = payments.filter((payment) => isPostedPayment(payment) && payment.transactionType !== 'refund');
    const distinctVisitedOrders = new Map();
    postedPositive.forEach((payment) => {
      const order = payment.order;
      const visitAt = order && typeof order === 'object' ? getVisitEvidenceAt(order) : null;
      if (visitAt) distinctVisitedOrders.set(String(order._id), visitAt);
    });
    const lastVisit = distinctVisitedOrders.size
      ? new Date(Math.max(...[...distinctVisitedOrders.values()].map((date) => new Date(date).getTime())))
      : null;
    const recentServices = postedPositive.slice(0, 5).map((payment) => {
      const itemNames = Array.isArray(payment.items)
        ? payment.items.map((item) => String(item?.name || '').trim()).filter(Boolean)
        : [];
      return {
        id: payment._id,
        transactionId: payment.invoiceId,
        service: itemNames.join(', ') || payment.order?.serviceType || 'Service payment',
        date: getPaymentEffectiveAt(payment),
        amount: getSignedAmount(payment),
        paymentMethod: payment.method,
      };
    });

    return res.json({
      success: true,
      data: {
        totalSpent: roundMoney(payments.reduce((sum, payment) => sum + getSignedAmount(payment), 0)),
        visitCount: distinctVisitedOrders.size,
        lastVisit,
        recentServices,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPayments = async (req, res, next) => {
  try {
    const query = req.query || {};
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const filter = {};
    const applyEnumFilter = (name, path) => {
      if (!query[name]) return;
      const values = String(query[name]).split(',').map((value) => value.trim()).filter(Boolean);
      const allowed = new Set(Payment.schema.path(path).enumValues);
      if (values.some((value) => !allowed.has(value))) {
        const error = new Error(`Invalid ${name} filter.`);
        error.statusCode = 400;
        throw error;
      }
      filter[path] = values.length === 1 ? values[0] : { $in: values };
    };
    applyEnumFilter('status', 'status');
    applyEnumFilter('transactionType', 'transactionType');
    applyEnumFilter('method', 'method');
    for (const field of ['customer', 'order']) {
      if (query[field]) {
        if (!mongoose.isValidObjectId(query[field])) {
          const error = new Error(`Invalid ${field} filter.`);
          error.statusCode = 400;
          throw error;
        }
        filter[field] = query[field];
      }
    }
    if (query.search && String(query.search).trim()) {
      const search = String(query.search).trim();
      const regex = new RegExp(escapeRegex(search), 'i');
      const [matchingCustomers, matchingOrders] = await Promise.all([
        User.find({ $or: [{ name: regex }, { email: regex }] }).select('_id'),
        Order.find({
          $or: [
            { orderNumber: regex },
            { bookingReference: regex },
            { customerName: regex },
            { vehiclePlate: regex },
            { serviceType: regex },
          ],
        }).select('_id'),
      ]);
      filter.$or = [
        { invoiceId: regex },
        { paymentReference: regex },
        { providerReference: regex },
        { customer: { $in: matchingCustomers.map((row) => row._id) } },
        { order: { $in: matchingOrders.map((row) => row._id) } },
      ];
    }
    if (query.from || query.to) {
      if (!query.from || !query.to) {
        const error = new Error('Both from and to dates are required.');
        error.statusCode = 400;
        throw error;
      }
      const range = parseReportingRange({ range: 'custom', from: query.from, to: query.to });
      const dateField = query.dateField === 'submittedAt' ? 'submittedAt' : 'effectiveAt';
      filter[dateField] = { $gte: range.start, $lte: range.end };
    }
    const sortBy = ['effectiveAt', 'submittedAt', 'createdAt', 'amount', 'status'].includes(String(query.sortBy))
      ? String(query.sortBy)
      : 'createdAt';
    const sortDirection = String(query.sortOrder || query.direction).toLowerCase() === 'asc' ? 1 : -1;
    const [paymentDocs, total, summaryRows, pendingPayments] = await Promise.all([
      timeOperation({ req, res, kind: 'db', name: 'ledger.page' }, () => Payment.find(filter)
        .select('-proofImage -statusHistory.proofImage')
        .sort({ [sortBy]: sortDirection, _id: sortDirection })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(
          'order',
          'orderNumber bookingReference customer customerName customerPhone serviceType status vehicle vehicleYear vehicleMake ' +
          'vehicleModel vehicleColor vehiclePlate totalPrice totalAmount serviceTotal downPaymentAmount paymentStatus items approvedAt cancelledAt'
        )
        .populate('customer', 'name email phone phoneNumber contactNumber mobileNumber')
        .populate('vehicle', 'year make model color plateNumber vehicleType')
        .populate('service', 'name price')
        .populate('staffAssigned', 'name email')
        .populate('reviewedBy', 'name email')),
      timeOperation({ req, res, kind: 'db', name: 'ledger.count' }, () => Payment.countDocuments(filter)),
      timeOperation({ req, res, kind: 'db', name: 'ledger.summary' }, () =>
        Payment.find(filter).select('amount amountSubmitted amountVerified amountPaid status transactionType effectiveAt reviewedAt createdAt')),
      getPendingPaymentsSummary({ req, res }),
    ]);
    const orderIds = [...new Set(paymentDocs.map((payment) => String(payment.order?._id || payment.order || '')).filter(Boolean))];
    const orderPayments = orderIds.length ? await timeOperation(
      { req, res, kind: 'db', name: 'ledger.orderPayments' },
      () => Payment.find({ order: { $in: orderIds } }).select(LEDGER_BALANCE_SELECT_FIELDS)
    ) : [];
    const byOrder = new Map();
    orderPayments.forEach((payment) => {
      const key = String(payment.order);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(payment);
    });
    const payments = paymentDocs.map((payment) => buildLedgerTransaction(payment, {
      orderPayments: byOrder.get(String(payment.order?._id || payment.order)) || [],
    }));
    const totalRevenue = roundMoney(summaryRows.reduce((sum, payment) => sum + getSignedAmount(payment), 0));
    const totalCount = summaryRows.filter(isPostedPayment).length;

    res.json({
      success: true,
      data: payments,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      totalRevenue,
      totalCount,
      pendingPaymentsSummary: {
        totalOutstanding: pendingPayments.totalOutstanding,
        count: pendingPayments.count,
        statusCounts: pendingPayments.statusCounts,
        statusesIncluded: PENDING_PAYMENT_STATUSES,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPaymentRefund = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { amount = null, reason, confirmed, method } = req.body || {};
    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({ success: false, message: 'Invalid payment id.' });
    }
    if (confirmed !== true) {
      return res.status(400).json({ success: false, message: 'Refund confirmation is required.' });
    }
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3) {
      return res.status(400).json({ success: false, message: 'A refund reason is required.' });
    }
    if (method && !Payment.schema.path('method').enumValues.includes(method)) {
      return res.status(400).json({ success: false, message: 'Invalid refund method.' });
    }
    const idempotencyKey = String(
      req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || req.body?.idempotencyKey || ''
    ).trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ success: false, message: 'A valid idempotency key is required.' });
    }
    const originalPayment = await Payment.findById(paymentId).populate('order');
    if (!originalPayment) {
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    }
    const existing = await findRefundByIdempotency(originalPayment._id, idempotencyKey);
    if (existing) {
      const existingOrderRows = await getOrderLedger(originalPayment.order?._id || originalPayment.order);
      return res.json({
        success: true,
        idempotent: true,
        data: buildLedgerTransaction(existing, { order: originalPayment.order, orderPayments: existingOrderRows }),
      });
    }

    const orderId = originalPayment.order?._id || originalPayment.order;
    if (!orderId) {
      return res.status(409).json({ success: false, message: 'The original payment is missing its booking ledger.' });
    }
    const orderPaymentsBeforeRefund = await getOrderLedger(orderId);
    const refundable = refundableAmountForPayment(originalPayment, orderPaymentsBeforeRefund);
    const requestedRefund = amount === null || amount === undefined || amount === ''
      ? refundable
      : roundMoney(amount);
    if (requestedRefund <= 0 || requestedRefund > refundable + 0.009) {
      return res.status(409).json({
        success: false,
        message: `Refund amount must be positive and cannot exceed ₱${refundable.toFixed(2)}.`,
        code: 'REFUND_EXCEEDS_REFUNDABLE_BALANCE',
      });
    }

    let provider = 'manual';
    let providerReference = null;
    if (originalPayment.provider === 'stripe' || originalPayment.method === 'card') {
      const stripe = getStripeClient();
      if (!stripe) return res.status(503).json({ success: false, message: 'Stripe refunds are unavailable.' });
      const intentId = String(originalPayment.metadata?.stripePaymentIntent || originalPayment.providerReference || '');
      if (!intentId.startsWith('pi_')) {
        return res.status(409).json({ success: false, message: 'This card payment lacks a refundable Stripe PaymentIntent reference.' });
      }
      const requestedAmount = Math.round(requestedRefund * 100);
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: intentId,
          amount: requestedAmount,
          reason: 'requested_by_customer',
          metadata: { autoSpfPaymentId: String(originalPayment._id), requestedBy: String(req.user?.id || '') },
        }, { idempotencyKey });
        provider = 'stripe';
        providerReference = stripeRefund.id;
      } catch (providerError) {
        return res.status(502).json({ success: false, message: 'The payment provider did not complete the refund.' });
      }
    }

    const result = await createRefundLedgerEntry({
      originalPayment,
      amount: requestedRefund,
      reason: normalizedReason,
      actorId: req.user?.id,
      idempotencyKey,
      method,
      provider,
      providerReference,
    });
    const orderPayments = await getOrderLedger(orderId);
    const data = buildLedgerTransaction(result.payment, { order: originalPayment.order, orderPayments });
    logActivity({
      req,
      type: 'refund_processed',
      module: 'POS',
      action: 'Refund Processed',
      description: `Refund ${result.payment.invoiceId} posted for ₱${data.amountVerified.toFixed(2)}.`,
      status: 'success',
      referenceId: result.payment.invoiceId,
      metadata: { paymentId: result.payment._id, relatedPaymentId: originalPayment._id, amount: data.amountVerified },
    });
    try {
      getIO().to('realtime:staff').emit('ledger:changed', {
        paymentId: result.payment._id,
        orderId: originalPayment.order._id || originalPayment.order,
        transactionType: 'refund',
      });
    } catch (socketError) {
      console.warn('Socket not initialized for refund update:', socketError.message);
    }
    return res.status(201).json({ success: true, idempotent: result.idempotent, data });
  } catch (error) {
    if (error?.code === 11000) {
      const idempotencyKey = String(req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || req.body?.idempotencyKey || '').trim();
      const existing = await findRefundByIdempotency(req.params.paymentId, idempotencyKey);
      if (existing) return res.json({ success: true, idempotent: true, data: buildLedgerTransaction(existing) });
    }
    next(error);
  }
};

// ─── POS TRANSACTION (Atomic: Payment + Inventory + Status + Logging) ────────

/**
 * Shared finalize path for POS and billing checkout.
 * `amountCollected` is `balanceDue` from billing totals (what the customer pays now).
 */
export const runPosCheckoutCore = async ({
  req,
  order,
  allItems,
  subtotal: subtotalIn,
  discountAmount: discountAmountIn,
  discount,
  taxVatAmount = 0,
  additionalFees = 0,
  downpayment = 0,
  grandTotal: grandTotalIn,
  balanceDue: balanceDueIn,
  paymentMethod,
  staffId,
  cashReceived,
  amountReceived,
  paymentReference,
  splitPayments = [],
  invoiceRecordId = null,
  billingVersion = null,
  metadataExtra = {},
}) => {
  const subtotal = normalizeMoney(subtotalIn);
  const discountAmount = normalizeMoney(discountAmountIn);
  const taxVat = normalizeMoney(taxVatAmount);
  const fees = normalizeMoney(additionalFees);
  const grandTotal = normalizeMoney(grandTotalIn);
  const requestedBalance = normalizeMoney(balanceDueIn);
  const existingLedgerRows = await getOrderLedger(order._id);
  const existingLedger = summarizeLedgerRows(existingLedgerRows, grandTotal);
  const dp = roundMoney(Math.max(0, existingLedger.netVerified));
  const amountCollected = roundMoney(Math.max(0, grandTotal - existingLedger.netVerified));

  if (grandTotal <= 0 || amountCollected <= 0) {
    const err = new Error('Invalid billing totals');
    err.statusCode = amountCollected <= 0 ? 409 : 400;
    if (amountCollected <= 0) err.message = 'This booking has no outstanding balance to collect.';
    throw err;
  }
  if (Math.abs(requestedBalance - amountCollected) > 0.009) {
    const err = new Error(
      `Checkout amount changed. The server-calculated balance is ₱${amountCollected.toFixed(2)}.`
    );
    err.statusCode = 409;
    err.code = 'LEDGER_AMOUNT_MISMATCH';
    throw err;
  }

  const checkoutReference = buildCheckoutReference({
    order,
    invoiceRecordId,
    billingVersion,
    grandTotal,
    amountCollected,
    metadataExtra,
  });

  const checkoutStatus = String(order.status || '').toLowerCase().replace(/-/g, '_');
  if (checkoutStatus === 'released' || checkoutStatus === 'completed') {
    throw checkoutConflict('This order is already finalized and cannot be checked out again.');
  }

  await assertPickupQueueCheckoutStillEligible(order);

  const duplicatePayment = await Payment.findOne({
    checkoutReference,
    status: 'succeeded',
  }).select('_id invoiceId');
  if (duplicatePayment) {
    throw checkoutConflict(
      `Checkout already completed for this order (${duplicatePayment.invoiceId}).`
    );
  }
  if (paymentMethod === 'gcash') {
    const reusedReference = await Payment.findOne({
      paymentReference: String(paymentReference || '').trim(),
      status: 'succeeded',
    }).select('_id invoiceId');
    if (reusedReference) {
      throw checkoutConflict(`This GCash reference was already used for ${reusedReference.invoiceId}.`);
    }
  }

  let changeGiven = null;
  const normalizedPaymentReference = String(paymentReference || '').trim().slice(0, 64);
  if (amountCollected > 0) {
    if (paymentMethod === 'cash') {
      const received = Number(cashReceived);
      if (!Number.isFinite(received) || received < amountCollected) {
        const err = new Error(
          `Insufficient cash. Received: ₱${received || 0}, Required: ₱${amountCollected}`
        );
        err.statusCode = 400;
        throw err;
      }
      changeGiven = normalizeMoney(received - amountCollected);
    } else if (paymentMethod === 'split') {
      const totalSplit = splitPayments.reduce((sum, sp) => sum + Number(sp.amount || 0), 0);
      if (totalSplit < amountCollected) {
        const err = new Error(
          `Insufficient split total. Total: ₱${totalSplit || 0}, Required: ₱${amountCollected}`
        );
        err.statusCode = 400;
        throw err;
      }
      const cashSplit = splitPayments.find((sp) => sp.method === 'cash');
      if (cashSplit && Number(cashReceived) > cashSplit.amount) {
        changeGiven = normalizeMoney(Number(cashReceived) - cashSplit.amount);
      } else if (totalSplit > amountCollected) {
        changeGiven = normalizeMoney(totalSplit - amountCollected);
      }
    } else if (paymentMethod === 'gcash') {
      const received = Number(amountReceived);
      if (!normalizedPaymentReference || normalizedPaymentReference.length < 6) {
        const err = new Error('A valid GCash reference number is required.');
        err.statusCode = 400;
        throw err;
      }
      if (!Number.isFinite(received) || Math.abs(received - amountCollected) > 0.009) {
        const err = new Error(
          `GCash amount received must match the amount due of ₱${amountCollected.toFixed(2)}.`
        );
        err.statusCode = 400;
        throw err;
      }
    }
  }

  const inventoryWarnings = [];
  for (const item of allItems) {
    const service = await Service.findOne({ name: new RegExp(`^${escapeRegex(item.name)}$`, 'i') });
    if (service?.recipe?.length) {
      for (const entry of service.recipe) {
        let product = null;
        if (entry.product) product = await Product.findById(entry.product);
        if (!product && entry.productName) product = await findProductByName(entry.productName);
        if (product && product.inventory < (entry.quantity || 0)) {
          inventoryWarnings.push({
            product: product.name,
            required: entry.quantity,
            available: product.inventory,
            service: item.name,
          });
        }
      }
    }
  }

  const resolvedStaffId = staffId || req.user?.id || null;
  let staffUser = null;
  if (resolvedStaffId) {
    staffUser = await User.findById(resolvedStaffId).select('name email');
  }

  const invoiceId = await allocateUniquePaymentInvoiceId(order.invoiceId);
  const balanceRemaining = normalizeMoney(Math.max(0, grandTotal - dp - amountCollected));

  let payment;
  try {
    payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer?._id || order.customer,
      vehicle: order.vehicle || null,
      service: order.serviceId || null,
      amount: amountCollected,
      amountSubmitted: amountCollected,
      amountVerified: amountCollected,
      transactionType: existingLedger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
      subtotal,
      discountAmount,
      taxVatAmount: taxVat,
      additionalFees: fees,
      downpayment: dp,
      grandTotal,
      amountPaid: amountCollected,
      balanceRemaining,
      billingVersion,
      invoiceRecord: invoiceRecordId || null,
      currency: 'PHP',
      status: 'succeeded',
      method: paymentMethod,
      provider: paymentMethod === 'card' ? 'stripe' : 'pos',
      providerReference: `POS-${invoiceId}`,
      paymentReference: paymentMethod === 'gcash' ? normalizedPaymentReference : null,
      checkoutReference,
      staffAssigned: resolvedStaffId,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      effectiveAt: new Date(),
      reviewedBy: resolvedStaffId,
      discount: discount && discount.value > 0 ? discount : null,
      splitPayments: paymentMethod === 'split' ? splitPayments : [],
      cashReceived: ['cash', 'split'].includes(paymentMethod) ? Number(cashReceived) : null,
      amountReceived:
        paymentMethod === 'gcash'
          ? Number(amountReceived)
          : ['cash', 'split'].includes(paymentMethod)
            ? Number(cashReceived)
            : amountCollected,
      changeGiven,
      items: allItems,
      metadata: {
        orderNumber: order.orderNumber,
        posTransaction: true,
        ...metadataExtra,
        ...(paymentMethod === 'gcash' ? { paymentReference: normalizedPaymentReference } : {}),
        checkoutReference,
      },
      statusHistory: [{
        status: 'succeeded',
        amountSubmitted: amountCollected,
        amountVerified: amountCollected,
        changedAt: new Date(),
        changedBy: resolvedStaffId,
      }],
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.checkoutReference) {
      throw checkoutConflict('Checkout already completed for this order.');
    }
    if (error?.code === 11000 && error?.keyPattern?.paymentReference) {
      throw checkoutConflict('This GCash reference has already been used.');
    }
    throw error;
  }

  order.invoiceId = invoiceId;
  order.paymentStatus = balanceRemaining <= 0 ? 'paid' : 'partially_paid';
  order.paymentMethod = paymentMethod;
  order.paymentProvider = paymentMethod === 'card' ? 'stripe' : 'pos';
  order.paidAt = balanceRemaining <= 0 ? new Date() : null;
  order.subtotal = subtotal;
  order.discountAmount = discountAmount;
  order.taxVatAmount = taxVat;
  order.additionalFees = fees;
  order.serviceTotal = grandTotal;
  order.amountCollected = roundMoney(existingLedger.netVerified + amountCollected);
  order.finalPaymentAmount = amountCollected;
  order.totalPrice = grandTotal;
  order.totalAmount = grandTotal;
  const occupancyBefore = captureOrderSlotOccupancy(order);
  const prevPosStatus = order.status;
  const prevTrackingStage = order.serviceTrackingStage;
  const readyPickupPhotosComplete = countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS;
  // Payment makes release available; only an explicit customer handover releases the vehicle.
  const fullySettled = balanceRemaining <= 0;
  const prevStatusKey = String(prevPosStatus || '').toLowerCase().replace(/-/g, '_');
  const prevStageKey = String(prevTrackingStage || '').toLowerCase().replace(/-/g, '_');
  if (fullySettled && readyPickupPhotosComplete && (prevStageKey === 'ready_pickup' || prevStatusKey === 'ready_for_payment')) {
    // Preserve the pickup service status for existing customer trackers.
    // paymentStatus=paid owns settlement; released owns physical handover.
    order.status = 'ready_for_payment';
    order.serviceTrackingStage = 'ready_pickup';
  } else if (fullySettled) {
    if (['pending_confirmation', 'pending', 'approved', 'confirmed', 'assigned', 'queued'].includes(prevStatusKey)) {
      order.status = ['approved', 'assigned'].includes(prevStatusKey) ? prevPosStatus : 'confirmed';
      order.serviceTrackingStage = order.serviceTrackingStage || 'confirmed';
    } else if (['received', 'in_progress', 'processing'].includes(prevStatusKey)) {
      order.status = prevStatusKey === 'received' ? 'received' : 'in_progress';
      order.serviceTrackingStage = order.serviceTrackingStage || (prevStatusKey === 'received' ? 'received' : 'in_progress');
    } else if (prevStatusKey === 'ready_for_payment' || prevStatusKey === 'completed' || prevStageKey === 'ready_pickup') {
      order.status = 'ready_for_payment';
      order.serviceTrackingStage = order.serviceTrackingStage || 'ready_pickup';
    } else {
      order.status = 'paid';
    }
  } else {
    order.status = prevPosStatus;
    order.serviceTrackingStage = prevTrackingStage;
  }
  if (fullySettled) order.posQueueStatus = null;
  order.readyForPickupEvidenceComplete = readyPickupPhotosComplete;
  const nextStatusKey = String(order.status || '').toLowerCase().replace(/-/g, '_');
  const nextStageKey = String(order.serviceTrackingStage || '').toLowerCase().replace(/-/g, '_');
  if (['released', 'ready_pickup'].includes(nextStageKey) || ['paid', 'released', 'ready_for_payment', 'completed'].includes(nextStatusKey)) {
    order.customerStatus = 'ready';
  } else if (nextStatusKey === 'received') {
    order.customerStatus = 'received';
  } else if (nextStatusKey === 'in_progress') {
    order.customerStatus = 'in-progress';
  } else {
    order.customerStatus = 'queued';
  }
  order.customerStatusUpdatedAt = new Date();
  if (String(prevTrackingStage || '') !== String(order.serviceTrackingStage || '')) {
    order.serviceTrackingUpdatedAt = new Date();
    order.serviceTrackingUpdatedBy = req.user?.name || req.user?.id || 'POS';
  }
  try {
    await saveOrderWithSlotTransition(order, occupancyBefore);
  } catch (saveError) {
    console.error('[POS] Order finalization failed after payment create. Rolling back payment.', {
      orderId: order._id?.toString?.(),
      paymentId: payment._id?.toString?.(),
      checkoutReference,
      error: saveError.message,
    });
    await Payment.deleteOne({ _id: payment._id }).catch((rollbackError) => {
      console.error('[POS] Payment rollback failed after order save failure:', rollbackError.message);
    });
    throw saveError;
  }
  await applyInventoryDeductions(order);

  if (prevPosStatus !== order.status || String(prevTrackingStage || '') !== String(order.serviceTrackingStage || '')) {
    onOrderStatusChange(order, prevPosStatus, req.user).catch((err) =>
      console.error('[WORKFLOW] Orchestrator error in runPosCheckoutCore:', err.message)
    );
  }

  logActivity({
    req,
    type: 'pos_transaction',
    module: 'POS',
    action: 'POS Transaction Completed',
    description: `POS payment ${invoiceId} — ₱${amountCollected.toLocaleString()} collected (grand ₱${grandTotal.toLocaleString()}) via ${paymentMethod.toUpperCase()} for ${order.customerName || 'Customer'}.`,
    status: 'success',
    referenceId: invoiceId,
    metadata: {
      paymentId: payment._id,
      orderId: order._id,
      invoiceId,
      amount: amountCollected,
      grandTotal,
      method: paymentMethod,
      staffName: staffUser?.name,
    },
  });

  if (discount && discountAmount > 0) {
    logActivity({
      req,
      type: 'price_override',
      module: 'POS',
      action: 'Discount Applied',
      description: `${discount.discountType === 'percent' ? discount.value + '%' : '₱' + discount.value} discount applied to ${invoiceId}${discount.reason ? ' — ' + discount.reason : ''}.`,
      status: 'info',
      referenceId: invoiceId,
      metadata: {
        invoiceId,
        discountType: discount.discountType,
        discountValue: discount.value,
        discountAmount,
        reason: discount.reason,
      },
    });
  }

  try {
    await createAdminNotification({
      title: 'POS payment completed',
      message: `Payment ${invoiceId} received — ₱${amountCollected.toLocaleString()} via ${paymentMethod.toUpperCase()}`,
      category: 'payments',
      event: 'payment_completed',
      severity: 'success',
      source: 'POS',
      actionRequired: false,
      groupingKey: buildAdminGroupingKey('payments', 'payment_completed', payment._id),
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('payments', { paymentId: String(payment._id), orderId: String(order._id) }),
      action: { label: 'View payment' },
      metadata: { paymentId: payment._id, orderId: order._id, invoiceId, amount: amountCollected },
    });
  } catch (notificationError) {
    console.error('Failed to create POS notification:', notificationError.message);
  }

  invalidateResponseCache('qc:');
  try {
    const io = getIO();
    const customerId = order.customer?._id || order.customer;
    if (customerId) {
      io.to(`user:${customerId.toString()}`).emit('booking:status', {
        bookingId: order._id.toString(),
        status: order.status,
        serviceTrackingStage: order.serviceTrackingStage || null,
        paymentStatus: 'paid',
        invoiceId: order.invoiceId || null,
        customerStatus: order.customerStatus,
        trackerStageMedia: getCustomerVisibleTrackerStageMedia(order),
        updatedAt: new Date().toISOString(),
      });
    }

    io.to('realtime:staff').emit('orderUpdated', {
      orderId: order._id.toString(),
      status: order.status,
      serviceTrackingStage: order.serviceTrackingStage || null,
      paymentStatus: order.paymentStatus,
      invoiceId: order.invoiceId,
      posQueueStatus: order.posQueueStatus || null,
      readyForPickupEvidenceComplete: order.readyForPickupEvidenceComplete,
      readyForPaymentAt: order.readyForPaymentAt || null,
      trackerStageMedia: order.trackerStageMedia || [],
      updatedAt: new Date().toISOString(),
    });
    io.to('booking:approvals').emit('pos:transaction_completed', {
      paymentId: payment._id,
      amount: amountCollected,
      method: paymentMethod,
    });
    io.to('booking:approvals').emit('pos:queue_updated', {
      orderId: order._id.toString(),
      posQueueStatus: null,
      status: order.status,
      serviceTrackingStage: order.serviceTrackingStage || null,
      paymentStatus: order.paymentStatus || null,
      eligible: false,
      reason: 'checkout_completed',
      updatedAt: new Date().toISOString(),
    });
  } catch (socketError) {
    console.warn('Socket not initialized for POS notification:', socketError.message);
  }

  const linkedVehicle =
    order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {};
  const receiptData = {
    transactionId: invoiceId,
    paymentId: payment._id,
    customerName: order.customer?.name || order.customerName || 'Walk-in Customer',
    customerEmail: order.customer?.email || '',
    customerPhone: resolveReceiptPhoneForClient(order),
    vehicle: {
      year: order.vehicleYear || linkedVehicle.year || '',
      make: order.vehicleMake || linkedVehicle.make || '',
      model: order.vehicleModel || linkedVehicle.model || '',
      color: order.vehicleColor || linkedVehicle.color || '',
      type:
        order.vehicleType ||
        order.vehicleClass ||
        order.vehicleCategory ||
        linkedVehicle.vehicleType ||
        '',
      plate: order.vehiclePlate || linkedVehicle.plateNumber || '',
    },
    items: allItems,
    subtotal,
    discountAmount,
    discount:
      discount && discountAmount > 0
        ? { type: discount.discountType, value: discount.value, amount: discountAmount, reason: discount.reason }
        : null,
    taxVatAmount: taxVat,
    taxAmount: taxVat,
    additionalFees: fees,
    downpayment: dp,
    grandTotal,
    serviceTotal: grandTotal,
    totalAmount: grandTotal,
    amountCollected,
    balanceRemaining,
    total: amountCollected,
    paymentMethod,
    splitPayments: paymentMethod === 'split' ? splitPayments : [],
    cashReceived: ['cash', 'split'].includes(paymentMethod) ? Number(cashReceived) : null,
    amountReceived:
      paymentMethod === 'gcash'
        ? Number(amountReceived)
        : ['cash', 'split'].includes(paymentMethod)
          ? Number(cashReceived)
          : amountCollected,
    changeGiven,
    paymentReference: paymentMethod === 'gcash' ? normalizedPaymentReference : null,
    staff: staffUser ? { id: staffUser._id, name: staffUser.name } : null,
    bookingRef: order.orderNumber,
    date: new Date().toISOString(),
    inventoryWarnings,
  };

  const customerId = order.customer?._id || order.customer;
  if (!invoiceRecordId && customerId) {
    try {
      await notifyCustomerReceiptReady({
        customerId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        bookingReference: order.bookingReference,
        invoiceNumber: invoiceId,
        paymentId: payment._id,
        amountCollected,
      });
    } catch (receiptNotifyErr) {
      console.warn('[POS] Customer receipt notification failed:', receiptNotifyErr.message);
    }
  }

  return { payment, receiptData, inventoryWarnings, invoiceId };
};

export const createPOSTransaction = async (req, res, next) => {
  try {
    const {
      orderId,
      items = [],
      paymentMethod: requestedPaymentMethod,
      staffId,
      discount,
      cashReceived,
      amountReceived,
      paymentReference,
      addons = [],
      splitPayments = [],
      taxVatAmount: bodyTax = 0,
      additionalFees: bodyFees = 0,
      downpayment: bodyDp = 0,
    } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }
    if (!items.length && !addons.length) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }

    const paymentMethod = normalizePaymentMethod(requestedPaymentMethod);
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'A valid payment method is required',
      });
    }

    if (paymentMethod === 'split' && (!splitPayments || !splitPayments.length)) {
      return res.status(400).json({ success: false, message: 'Split payments array is required for split method' });
    }

    const order = await Order.findById(orderId)
      .populate('customer', RECEIPT_CUSTOMER_SELECT)
      .populate('vehicle', RECEIPT_VEHICLE_SELECT);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const allItems = [
      ...items.map((i) => ({
        serviceId: mongoose.Types.ObjectId.isValid(String(i.serviceId || i.id || ''))
          ? String(i.serviceId || i.id)
          : null,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity || 1,
        isAddon: false,
      })),
      ...addons.map((a) => ({
        serviceId: mongoose.Types.ObjectId.isValid(String(a.serviceId || a.id || ''))
          ? String(a.serviceId || a.id)
          : null,
        name: a.name,
        price: Number(a.price),
        quantity: a.quantity || 1,
        isAddon: true,
      })),
    ];

    const lineItemsForTotals = allItems.map((i) => ({
      unitPrice: normalizeMoney(i.price),
      quantity: i.quantity || 1,
    }));
    const subtotalRaw = lineItemsForTotals.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0);
    const subtotal = normalizeMoney(subtotalRaw);
    const discountForCalc =
      discount && Number(discount.value) > 0 ? discount : { discountType: 'fixed', value: 0 };
    const discountAmount = normalizeMoney(computeDiscountAmount(subtotal, discountForCalc));
    const taxVat = normalizeMoney(bodyTax);
    const fees = normalizeMoney(bodyFees);
    const dp = normalizeMoney(bodyDp);
    const computed = computeBillingTotals({
      lineItems: lineItemsForTotals,
      discount: discountForCalc,
      taxVatAmount: taxVat,
      additionalFees: fees,
      downpayment: dp,
    });

    const discountObj = discount && Number(discount.value) > 0 ? discount : null;

    const { payment, receiptData, inventoryWarnings, invoiceId } = await runPosCheckoutCore({
      req,
      order,
      allItems,
      subtotal,
      discountAmount,
      discount: discountObj,
      taxVatAmount: taxVat,
      additionalFees: fees,
      downpayment: dp,
      grandTotal: computed.grandTotal,
      balanceDue: computed.balanceDue,
      paymentMethod,
      staffId,
      cashReceived,
      amountReceived,
      paymentReference,
      splitPayments,
      invoiceRecordId: null,
      billingVersion: null,
      metadataExtra: {
        checkoutReference: `direct-pos-checkout:${order._id.toString()}`,
      },
    });

    res.json({
      success: true,
      message: 'POS transaction completed successfully',
      data: {
        payment: {
          _id: payment._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          subtotal: payment.subtotal,
          discountAmount: payment.discountAmount,
          taxVatAmount: payment.taxVatAmount,
          additionalFees: payment.additionalFees,
          grandTotal: payment.grandTotal,
          amountPaid: payment.amountPaid,
          method: payment.method,
          status: payment.status,
          createdAt: payment.createdAt,
        },
        receipt: receiptData,
        inventoryWarnings,
        invoiceId,
      },
    });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 409) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }
    next(error);
  }
};

// ─── GET RECEIPT DATA ────────────────────────────────────────────────────────

export const getReceiptData = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id)
      .populate(
        'order',
        'orderNumber customerName customerPhone vehicle vehicleYear vehicleMake vehicleModel vehicleColor ' +
        'vehiclePlate vehicleType vehicleClass vehicleCategory serviceType photos'
      )
      .populate('customer', RECEIPT_CUSTOMER_SELECT)
      .populate('vehicle', RECEIPT_VEHICLE_SELECT)
      .populate('staffAssigned', 'name email')
      .lean();

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const linkedPaymentVehicle =
      payment.vehicle && typeof payment.vehicle === 'object' ? payment.vehicle : {};
    const vehicle = payment.order
      ? {
          year: payment.order.vehicleYear || linkedPaymentVehicle.year || '',
          make: payment.order.vehicleMake || linkedPaymentVehicle.make || '',
          model: payment.order.vehicleModel || linkedPaymentVehicle.model || '',
          color: payment.order.vehicleColor || linkedPaymentVehicle.color || '',
          type:
            payment.order.vehicleType ||
            payment.order.vehicleClass ||
            payment.order.vehicleCategory ||
            linkedPaymentVehicle.vehicleType ||
            '',
          plate: payment.order.vehiclePlate || linkedPaymentVehicle.plateNumber || '',
        }
      : {};

    const receiptData = {
      transactionId: payment.invoiceId,
      paymentId: payment._id,
      customerName: payment.customer?.name || payment.order?.customerName || 'Walk-in Customer',
      customerEmail: payment.customer?.email || '',
      customerPhone: resolveReceiptPhoneForClient(payment.order, payment.customer, payment),
      vehicle,
      items: payment.items || [],
      subtotal: payment.subtotal ?? payment.amount,
      discountAmount: payment.discountAmount || 0,
      discount: payment.discount && payment.discountAmount > 0
        ? {
            type: payment.discount.discountType,
            value: payment.discount.value,
            amount: payment.discountAmount,
            reason: payment.discount.reason,
          }
        : null,
      taxVatAmount: payment.taxVatAmount || 0,
      taxAmount: payment.taxVatAmount || 0,
      additionalFees: payment.additionalFees || 0,
      downpayment: payment.downpayment || 0,
      grandTotal: payment.grandTotal ?? payment.amount,
      serviceTotal: payment.grandTotal ?? payment.amount,
      totalAmount: payment.grandTotal ?? payment.amount,
      amountCollected: payment.amountPaid ?? payment.amount,
      balanceRemaining: payment.balanceRemaining || 0,
      total: payment.amountPaid ?? payment.amount,
      paymentMethod: payment.method,
      splitPayments: payment.splitPayments || [],
      cashReceived: payment.cashReceived,
      amountReceived: payment.amountReceived,
      changeGiven: payment.changeGiven,
      paymentReference: payment.paymentReference,
      staff: payment.staffAssigned ? { id: payment.staffAssigned._id, name: payment.staffAssigned.name } : null,
      bookingRef: payment.order?.orderNumber || '',
      serviceType: payment.order?.serviceType || '',
      photos: payment.order?.photos || {},
      date: payment.createdAt,
      status: payment.status,
    };

    res.json({ success: true, data: receiptData });
  } catch (error) {
    next(error);
  }
};
