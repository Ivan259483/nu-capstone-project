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
import { isCustomerRole } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import emailService from '../utils/emailService.utils.js';
import { normalizeMoney, computeDiscountAmount, computeBillingTotals } from '../utils/billingTotals.js';

const LOW_STOCK_THRESHOLD = 10;
const LOCAL_PAYMENTS_PROVIDER = (process.env.LOCAL_PAYMENTS_PROVIDER || 'paymongo').toLowerCase();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
    await Notification.create({
      title,
      message,
      type: 'inventory',
      recipientRole: 'admin_family',
      link: '/admin/inventory',
      metadata,
    });
  } catch (error) {
    console.error('Failed to create inventory notification:', error.message);
  }
};

const emitAdminNotification = (notification) => {
  try {
    const io = getIO();
    io.to('admin:chat').emit('admin:notification', notification);
  } catch (error) {
    console.warn('Socket not initialized for admin notification:', error.message);
  }
};

const emitCustomerNotification = (customerId, notification) => {
  try {
    if (!customerId) return;
    const io = getIO();
    io.to(`user:${customerId.toString()}`).emit('notification:customer', notification);
  } catch (error) {
    console.warn('Socket not initialized for customer notification:', error.message);
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
  payment.status = 'succeeded';
  payment.providerReference = payload.providerReference || payment.providerReference;
  payment.metadata = { ...payment.metadata, ...payload.metadata };
  await payment.save();

  order.invoiceId = order.invoiceId || payment.invoiceId;
  order.paymentStatus = 'paid';
  order.paymentMethod = payment.method;
  order.paymentProvider = payment.provider;
  order.paidAt = new Date();
  const prevStatus = order.status;
  if (order.status === 'pending') {
    order.status = 'confirmed';
  }
  await order.save();

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
      const notification = await Notification.create({
        title: 'Payment Completed',
        message: `Payment ${payment.invoiceId} received (${payment.method?.toUpperCase() || 'PAYMENT'})`,
        type: 'success',
        recipientRole: 'admin_family',
        link: '/admin/dashboard?tab=billing',
        metadata: {
          paymentId: payment._id,
          orderId: order._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
        },
      });
      emitAdminNotification({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        link: notification.link,
      });
    }
  } catch (notifyError) {
    console.error('Failed to notify payment completion:', notifyError.message);
  }

  try {
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (customerId) {
      const existingCustomer = await Notification.findOne({
        'metadata.paymentId': payment._id,
        type: 'success',
        recipientRole: 'customer',
      });
      if (!existingCustomer) {
        const createdNotification = await Notification.create({
          title: 'Payment Received',
          message: `Payment ${payment.invoiceId} received successfully.`,
          type: 'success',
          recipientRole: 'customer',
          recipientUserId: customerId,
          link: '/customer/dashboard?tab=bookings',
          metadata: {
            paymentId: payment._id,
            orderId: order._id,
            customerId: customerId.toString(),
            invoiceId: payment.invoiceId,
            amount: payment.amount,
          },
        });
        emitCustomerNotification(customerId, {
          id: createdNotification._id,
          title: createdNotification.title,
          message: createdNotification.message,
          type: createdNotification.type,
          isRead: createdNotification.isRead,
          createdAt: createdNotification.createdAt,
          link: createdNotification.link,
        });
      }
    }
  } catch (notifyError) {
    console.error('Failed to notify customer payment completion:', notifyError.message);
  }
};

const getOrderForPayment = async (orderId, user) => {
  const order = await Order.findById(orderId);
  if (!order) return null;

  if (isCustomerRole(user?.role) && order.customer.toString() !== user.id) {
    return null;
  }

  return order;
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
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
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
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
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
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
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

  res.json({ received: true });
};

export const getSalesToday = async (req, res, next) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const result = await Payment.aggregate([
      {
        $match: {
          status: 'succeeded',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const total = result?.[0]?.total || 0;
    const count = result?.[0]?.count || 0;

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
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { limit = 50 } = req.query || {};

    const payments = await Payment.find({ customer: userId })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('order', 'orderNumber customerName serviceType status')
      .lean();

    // Calculate totals for this customer
    const totals = await Payment.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(userId), status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const totalSpent = totals?.[0]?.total || 0;
    const totalCount = totals?.[0]?.count || 0;

    res.json({
      success: true,
      data: payments,
      totalSpent,
      totalCount,
      currency: 'PHP',
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPayments = async (req, res, next) => {
  try {
    const { limit = 100 } = req.query || {};
    const payments = await Payment.find()
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('order', 'orderNumber customerName serviceType')
      .populate('customer', 'name email')
      .lean();

    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: payments,
      totalRevenue: totalRevenue?.[0]?.total || 0,
      totalCount: totalRevenue?.[0]?.count || 0,
    });
  } catch (error) {
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
  splitPayments = [],
  invoiceRecordId = null,
  billingVersion = null,
  metadataExtra = {},
}) => {
  const subtotal = normalizeMoney(subtotalIn);
  const discountAmount = normalizeMoney(discountAmountIn);
  const taxVat = normalizeMoney(taxVatAmount);
  const fees = normalizeMoney(additionalFees);
  const dp = normalizeMoney(downpayment);
  const grandTotal = normalizeMoney(grandTotalIn);
  const amountCollected = normalizeMoney(balanceDueIn);

  if (grandTotal < 0 || amountCollected < 0) {
    const err = new Error('Invalid billing totals');
    err.statusCode = 400;
    throw err;
  }

  let changeGiven = null;
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

  let staffUser = null;
  if (staffId) {
    staffUser = await User.findById(staffId).select('name email');
  }

  const invoiceId = order.invoiceId || generateInvoiceId();
  const balanceRemaining = normalizeMoney(Math.max(0, grandTotal - dp - amountCollected));

  const payment = await Payment.create({
    invoiceId,
    order: order._id,
    customer: order.customer?._id || order.customer,
    amount: amountCollected,
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
    staffAssigned: staffId || null,
    discount: discount && discount.value > 0 ? discount : null,
    splitPayments: paymentMethod === 'split' ? splitPayments : [],
    cashReceived: ['cash', 'split'].includes(paymentMethod) ? Number(cashReceived) : null,
    changeGiven,
    items: allItems,
    metadata: { orderNumber: order.orderNumber, posTransaction: true, ...metadataExtra },
  });

  order.invoiceId = invoiceId;
  order.paymentStatus = 'paid';
  order.paymentMethod = paymentMethod;
  order.paymentProvider = paymentMethod === 'card' ? 'stripe' : 'pos';
  order.paidAt = new Date();
  order.totalPrice = grandTotal;
  order.totalAmount = grandTotal;
  const prevPosStatus = order.status;
  if (
    ['pending', 'confirmed', 'assigned', 'processing', 'in-progress', 'in_progress', 'ready_for_payment'].includes(
      order.status
    )
  ) {
    order.status = 'completed';
  }
  if (prevPosStatus === 'ready_for_payment' || order.serviceTrackingStage === 'ready_pickup') {
    order.serviceTrackingStage = 'released';
  }
  order.customerStatus = 'ready';
  order.customerStatusUpdatedAt = new Date();
  await order.save();

  await applyInventoryDeductions(order);

  if (prevPosStatus !== order.status) {
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
    const io = getIO();
    io.to('admin:chat').emit('admin:notification', {
      id: payment._id,
      title: 'POS Payment Completed',
      message: `₱${amountCollected.toLocaleString()} — ${order.customerName || 'Walk-in'} via ${paymentMethod.toUpperCase()}`,
      type: 'success',
      isRead: false,
      createdAt: new Date().toISOString(),
      link: '/admin/dashboard?tab=pos',
    });

    const customerId = order.customer?._id || order.customer;
    if (customerId) {
      io.to(`user:${customerId.toString()}`).emit('booking:status', {
        bookingId: order._id.toString(),
        status: order.status,
        serviceTrackingStage: order.serviceTrackingStage || null,
        paymentStatus: 'paid',
        invoiceId: order.invoiceId || null,
        customerStatus: order.customerStatus,
        trackerStageMedia: order.trackerStageMedia || [],
        updatedAt: new Date().toISOString(),
      });
    }

    io.emit('pos:transaction_completed', {
      paymentId: payment._id,
      amount: amountCollected,
      method: paymentMethod,
    });
  } catch (socketError) {
    console.warn('Socket not initialized for POS notification:', socketError.message);
  }

  const receiptData = {
    transactionId: invoiceId,
    paymentId: payment._id,
    customerName: order.customer?.name || order.customerName || 'Walk-in Customer',
    customerEmail: order.customer?.email || '',
    customerPhone: order.customer?.phone || '',
    vehicle: {
      year: order.vehicleYear || '',
      make: order.vehicleMake || '',
      model: order.vehicleModel || '',
      color: order.vehicleColor || '',
      plate: order.vehiclePlate || '',
    },
    items: allItems,
    subtotal,
    discount:
      discount && discountAmount > 0
        ? { type: discount.discountType, value: discount.value, amount: discountAmount, reason: discount.reason }
        : null,
    taxVatAmount: taxVat,
    additionalFees: fees,
    downpayment: dp,
    grandTotal,
    amountCollected,
    balanceRemaining,
    total: amountCollected,
    paymentMethod,
    splitPayments: paymentMethod === 'split' ? splitPayments : [],
    cashReceived: ['cash', 'split'].includes(paymentMethod) ? Number(cashReceived) : null,
    changeGiven,
    staff: staffUser ? { id: staffUser._id, name: staffUser.name } : null,
    bookingRef: order.orderNumber,
    date: new Date().toISOString(),
    inventoryWarnings,
  };

  try {
    await Notification.create({
      title: 'POS Payment Completed',
      message: `Payment ${invoiceId} received — ₱${amountCollected.toLocaleString()} via ${paymentMethod.toUpperCase()}`,
      type: 'success',
      recipientRole: 'admin_family',
      link: '/admin/dashboard?tab=pos',
      metadata: { paymentId: payment._id, orderId: order._id, invoiceId, amount: amountCollected },
    });
  } catch (ne) {
    console.error('Failed to create POS notification:', ne.message);
  }

  const customerEmail = order.customer?.email;
  if (customerEmail) {
    emailService
      .sendDigitalReceiptEmail(customerEmail, {
        bookingReference: order.bookingReference || order.orderNumber,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name || order.customerName || 'Valued Customer',
        serviceName: order.serviceType || allItems?.[0]?.name || 'Premium Detailing',
        vehicleInfo: `${order.vehicleYear || ''} ${order.vehicleMake || ''} ${order.vehicleModel || ''}`.trim() || 'N/A',
        plateNumber: order.vehiclePlate || 'N/A',
        totalAmount: amountCollected,
        paymentMethod,
      })
      .catch((err) => console.error('[POS] Receipt email failed:', err.message));
  }

  return { payment, receiptData, inventoryWarnings, invoiceId };
};

export const createPOSTransaction = async (req, res, next) => {
  try {
    const {
      orderId,
      items = [],
      paymentMethod = 'cash',
      staffId,
      discount,
      cashReceived,
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

    const validMethods = ['cash', 'gcash', 'maya', 'card', 'split'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    if (paymentMethod === 'split') {
      if (!splitPayments || !splitPayments.length) {
        return res.status(400).json({ success: false, message: 'Split payments array is required for split method' });
      }
    }

    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const allItems = [
      ...items.map((i) => ({ name: i.name, price: Number(i.price), quantity: i.quantity || 1, isAddon: false })),
      ...addons.map((a) => ({ name: a.name, price: Number(a.price), quantity: a.quantity || 1, isAddon: true })),
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
      splitPayments,
      invoiceRecordId: null,
      billingVersion: null,
      metadataExtra: {},
    });

    res.json({
      success: true,
      message: 'POS transaction completed successfully',
      data: {
        payment: {
          _id: payment._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
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
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ─── GET RECEIPT DATA ────────────────────────────────────────────────────────

export const getReceiptData = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id)
      .populate('order', 'orderNumber customerName vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate serviceType photos')
      .populate('customer', 'name email phone')
      .populate('staffAssigned', 'name email')
      .lean();

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const vehicle = payment.order
      ? {
          year: payment.order.vehicleYear || '',
          make: payment.order.vehicleMake || '',
          model: payment.order.vehicleModel || '',
          color: payment.order.vehicleColor || '',
          plate: payment.order.vehiclePlate || '',
        }
      : {};

    const receiptData = {
      transactionId: payment.invoiceId,
      paymentId: payment._id,
      customerName: payment.customer?.name || payment.order?.customerName || 'Walk-in Customer',
      customerEmail: payment.customer?.email || '',
      customerPhone: payment.customer?.phone || '',
      vehicle,
      items: payment.items || [],
      subtotal: payment.subtotal || payment.amount,
      discount: payment.discount && payment.discountAmount > 0
        ? {
            type: payment.discount.discountType,
            value: payment.discount.value,
            amount: payment.discountAmount,
            reason: payment.discount.reason,
          }
        : null,
      total: payment.amount,
      paymentMethod: payment.method,
      splitPayments: payment.splitPayments || [],
      cashReceived: payment.cashReceived,
      changeGiven: payment.changeGiven,
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
